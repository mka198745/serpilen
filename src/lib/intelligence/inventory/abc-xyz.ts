/**
 * ABC-XYZ Inventory Intelligence.
 * ABC: yıllık tüketim değeri = yıllık adet × birim alış maliyeti; kümülatif %80/%95 sınırları (ayarlanabilir).
 * XYZ: aylık talep kovalarının değişim katsayısı (CV = std/mean). Ortalama 0 ise sınıf verilmez.
 * Maliyet eksikse ABC = "N/A" (uydurma sınıflandırma yapılmaz).
 */
import type { SalesBundle } from "../repositories";
import { isValidOrder, orderDate } from "../types";
import { coefficientOfVariation } from "../core/statistics";

export interface AbcXyzRow {
  productId: number;
  productName: string;
  sku: string;
  abcClass: "A" | "B" | "C" | "N/A";
  xyzClass: "X" | "Y" | "Z" | "N/A";
  composite: string;
  annualQty: number;
  annualValue: number;
  avgDailyDemand: number;
  demandCv: number | null;
  inventoryValue: number;
  availableQty: number;
  turnover: number | null;
  daysOfCover: number | null;
  risk: "STOCKOUT" | "OVERSTOCK" | "DEAD_STOCK" | "NONE";
}

export interface AbcXyzReport {
  generatedAt: string;
  windowDays: number;
  thresholds: { aPercent: number; bPercent: number; xMaxCv: number; yMaxCv: number };
  rows: AbcXyzRow[];
  matrix: Record<string, { count: number; value: number; qty: number }>;
  notes: string[];
  costCoverage: number;
}

export const CLASS_ACTIONS: Record<string, string> = {
  AX: "Yüksek değer + düzenli talep: sık stok kontrolü, minimum kalem, otomatik reorder noktaları ve tedarikçi SLA'sı yakın izlenmeli.",
  AY: "Yüksek değer + orta değişkenlik: dönemsel gözden geçirme, esnek reorder, güvenlik stoğu ayarlı.",
  AZ: "Yüksek değer + düzensiz talep: kontrollü satın alma, manuel onaylı sipariş, fazla stoktan kaçın.",
  BX: "Orta değer + düzenli talep: standart otomatik stok politikası uygula.",
  BY: "Orta değer + orta değişkenlik: periyodik sayım, trend takibi.",
  BZ: "Orta değer + düzensiz talep: az miktar, sık parti; elde stok tutma süresini kısalt.",
  CX: "Düşük değer + düzenli talep: basit otomatik doldurma, iki kutu yöntemi uygun.",
  CY: "Düşük değer + orta değişkenlik: düşük öncelikli izleme, dönemsel satın alma.",
  CZ: "Düşük değer + düzensiz talep: fazla birikimi önle, talep onayı olmadan almayın, raftaki stoğu erit.",
  "N/A": "Sınıflanamadı (maliyet veya talep verisi eksik) — veri gelince yeniden hesaplanır.",
};

export function computeAbcXyz(
  bundle: SalesBundle,
  opts: { aPercent?: number; bPercent?: number; xMaxCv?: number; yMaxCv?: number; windowDays?: number } = {}
): AbcXyzReport {
  const aPercent = opts.aPercent ?? 0.8;
  const bPercent = opts.bPercent ?? 0.95;
  const xMaxCv = opts.xMaxCv ?? 0.5;
  const yMaxCv = opts.yMaxCv ?? 1.0;
  const windowDays = opts.windowDays ?? 365;

  const windowStart = Date.now() - windowDays * 86400000;
  const valid = bundle.orders.filter((o) => isValidOrder(o) && orderDate(o).getTime() >= windowStart);
  const orderIds = new Set(valid.map((o) => o.id));
  const items = bundle.items.filter((i) => orderIds.has(i.orderId));

  const byProduct = new Map<number, { qty: number }>();
  for (const it of items) {
    const e = byProduct.get(it.productId) ?? { qty: 0 };
    e.qty += it.quantity;
    byProduct.set(it.productId, e);
  }

  const productById = new Map(bundle.products.map((p) => [p.id, p]));
  const inventoryByProduct = new Map<number, { physical: number; reserved: number }>();
  for (const inv of bundle.inventory) {
    const e = inventoryByProduct.get(inv.productId) ?? { physical: 0, reserved: 0 };
    e.physical += inv.physicalQty;
    e.reserved += inv.reservedQty;
    inventoryByProduct.set(inv.productId, e);
  }

  // Aylık talep kovaları (son 12 ay)
  const now = new Date();
  const monthKeys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const monthlyByProduct = new Map<number, number[]>();
  const orderDateById = new Map(valid.map((o) => [o.id, orderDate(o)]));
  for (const it of items) {
    const d = orderDateById.get(it.orderId);
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const idx = monthKeys.indexOf(key);
    if (idx < 0) continue;
    const arr = monthlyByProduct.get(it.productId) ?? new Array(12).fill(0);
    arr[idx] += it.quantity;
    monthlyByProduct.set(it.productId, arr);
  }

  const totalCostLines = byProduct.size;
  let costedForAbc = 0;

  interface Draft {
    productId: number;
    productName: string;
    sku: string;
    annualQty: number;
    annualValue: number;
    demandCv: number | null;
    inventoryValue: number;
    availableQty: number;
    turnover: number | null;
    daysOfCover: number | null;
    risk: AbcXyzRow["risk"];
    costOk: boolean;
  }

  const drafts: Draft[] = [];
  const allProductIds = new Set<number>([...byProduct.keys(), ...inventoryByProduct.keys()]);
  for (const productId of allProductIds) {
    const p = productById.get(productId);
    const annualQty = byProduct.get(productId)?.qty ?? 0;
    const unitCost = p?.buyPrice ?? 0;
    const annualValue = annualQty * unitCost;
    if (annualQty > 0 && unitCost > 0) costedForAbc++;
    const inv = inventoryByProduct.get(productId);
    const physical = inv?.physical ?? 0;
    const available = (inv?.physical ?? 0) - (inv?.reserved ?? 0);
    const inventoryValue = physical * unitCost;
    const monthly = monthlyByProduct.get(productId) ?? new Array(12).fill(0);
    const demandMean = monthly.reduce((s, v) => s + v, 0) / 12;
    const cv = demandMean > 0 ? coefficientOfVariation(monthly) : null;
    const avgDailyDemand = annualQty / windowDays;
    const daysOfCover = avgDailyDemand > 0 ? Number((Math.max(0, available) / avgDailyDemand).toFixed(1)) : null;
    const turnover = inventoryValue > 0 ? Number(((annualValue) / inventoryValue).toFixed(2)) : null;
    let risk: Draft["risk"] = "NONE";
    if (available <= 0 && avgDailyDemand > 0) risk = "STOCKOUT";
    else if (physical > 0 && annualQty === 0) risk = "DEAD_STOCK";
    else if (daysOfCover != null && daysOfCover > 180) risk = "OVERSTOCK";
    drafts.push({
      productId,
      productName: p?.name ?? `Ürün #${productId}`,
      sku: p?.sku ?? "",
      annualQty,
      annualValue: Number(annualValue.toFixed(2)),
      demandCv: cv != null ? Number(cv.toFixed(3)) : null,
      inventoryValue: Number(inventoryValue.toFixed(2)),
      availableQty: available,
      turnover,
      daysOfCover,
      risk,
      costOk: unitCost > 0,
    });
  }

  // ABC sıralaması (yalnız maliyetli + satışlı ürünler)
  const abcPool = drafts.filter((d) => d.annualQty > 0 && d.costOk).sort((a, b) => b.annualValue - a.annualValue);
  const abcTotal = abcPool.reduce((s, d) => s + d.annualValue, 0);
  const abcById = new Map<number, "A" | "B" | "C">();
  let cumulative = 0;
  // "Eşiği geçen kalem A" kuralı (crossing): kalemin eklenmesinden ÖNCEKİ
  // kümülatif pay eşiğin altındaysa o sınıf. Böylece tek baskın ürün her
  // durumda A olur; kümülatif pay %80'i geçen ilk kalem B, %95'i geçen C olur.
  for (const d of abcPool) {
    const cumBefore = abcTotal > 0 ? cumulative / abcTotal : 1;
    abcById.set(d.productId, cumBefore < aPercent ? "A" : cumBefore < bPercent ? "B" : "C");
    cumulative += d.annualValue;
  }

  const rows: AbcXyzRow[] = drafts.map((d) => {
    const abcClass: AbcXyzRow["abcClass"] = d.annualQty === 0 ? "C" : abcById.get(d.productId) ?? "N/A";
    let xyzClass: AbcXyzRow["xyzClass"] = "N/A";
    if (d.demandCv != null) xyzClass = d.demandCv <= xMaxCv ? "X" : d.demandCv <= yMaxCv ? "Y" : "Z";
    const composite = abcClass === "N/A" || xyzClass === "N/A" ? `${abcClass}${xyzClass === "N/A" ? "" : xyzClass}` : `${abcClass}${xyzClass}`;
    return {
      productId: d.productId,
      productName: d.productName,
      sku: d.sku,
      abcClass,
      xyzClass,
      composite: composite === "" ? "N/A" : composite,
      annualQty: d.annualQty,
      annualValue: d.annualValue,
      avgDailyDemand: Number((d.annualQty / windowDays).toFixed(3)),
      demandCv: d.demandCv,
      inventoryValue: d.inventoryValue,
      availableQty: d.availableQty,
      turnover: d.turnover,
      daysOfCover: d.daysOfCover,
      risk: d.risk,
    };
  });

  const matrix: AbcXyzReport["matrix"] = {};
  for (const cls of ["AX", "AY", "AZ", "BX", "BY", "BZ", "CX", "CY", "CZ"]) {
    matrix[cls] = { count: 0, value: 0, qty: 0 };
  }
  for (const r of rows) {
    if (matrix[r.composite]) {
      matrix[r.composite].count++;
      matrix[r.composite].value = Number((matrix[r.composite].value + r.annualValue).toFixed(2));
      matrix[r.composite].qty += r.annualQty;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    thresholds: { aPercent, bPercent, xMaxCv, yMaxCv },
    rows: rows.sort((a, b) => b.annualValue - a.annualValue),
    matrix,
    notes: [
      "ABC: yıllık tüketim değeri (adet × cari alış maliyeti) sıralamasıyla kümülatif %80/%95 eşiği.",
      "XYZ: son 12 aylık aylık talep kovalarının CV'si; ortalama talep 0 ise sınıf verilmez.",
      "Turnover = yıllık tüketim değeri / mevcut stok değeri (ortalama stok değeri geçmişi yok → mevcut değer proxy).",
      "Maliyeti eksik ürünlerde ABC='N/A' — uydurma sınıflandırma yapılmaz.",
      "CV>1 olan sınıflar Z'dir; örnekleme azlığında Z baskın çıkar — LOW_DATA uyarısına dikkat edin.",
    ],
    costCoverage: totalCostLines ? Number((costedForAbc / totalCostLines).toFixed(3)) : 0,
  };
}
