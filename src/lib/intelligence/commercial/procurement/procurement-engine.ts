/**
 * PROCUREMENT OPTIMIZATION ENGINE — satış hızı + stok + termin verisinden
 * yeniden sipariş adayları, ölü stok ve fazla stok tespiti.
 * Finansal etki tahminleri açık varsayımlarla üretilir; ölçülmüş etki değildir.
 */
import { buildOpportunity } from "../core/commercial-opportunity-engine";
import type { BuiltOpportunity } from "../core/commercial-opportunity-engine";
import { combinedConfidence } from "../core/confidence-engine";
import { financialImpactScale } from "../core/priority-score";
import type { ProductSales, SupplierContext } from "../data-prep";
import type { SalesBundle } from "../../repositories";
import { computeAbcXyz } from "../../inventory/abc-xyz";

const n = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (v: number) => Number(v.toFixed(2));

export interface ProcurementSettings {
  periodDays: number;
  deadStockDays: number;    // bu sürenin satışı yoksa ölü stok
  reorderCoverDays: number; // hedef kaplama günü
  overstockFactor: number;  // kaplama > hedef × faktör → fazla stok
}

export const DEFAULT_PROCUREMENT_SETTINGS: ProcurementSettings = {
  periodDays: 90,
  deadStockDays: 90,
  reorderCoverDays: 21,
  overstockFactor: 3,
};

export interface ReorderCandidate {
  productId: number;
  name: string;
  sku: string;
  availableQty: number;
  velocityPerDay: number;
  daysCover: number | null;
  leadTimeDays: number | null;
  suggestedQty: number;
  unitCost: number;
  estimatedStockoutLoss: number | null;
}

export interface DeadStockRow {
  productId: number;
  name: string;
  sku: string;
  qty: number;
  value: number;
  daysSinceLastSale: number | null;
}

export interface OverstockRow {
  productId: number;
  name: string;
  sku: string;
  availableQty: number;
  velocityPerDay: number;
  daysCover: number;
  excessQty: number;
  excessValue: number;
}

export interface ProcurementAnalysis {
  generatedAt: string;
  settings: ProcurementSettings;
  reorderCandidates: ReorderCandidate[];
  deadStock: DeadStockRow[];
  overstock: OverstockRow[];
  totals: {
    deadStockValue: number;
    overstockExcessValue: number;
    productsWithStock: number;
  };
  abcSummary: Record<string, number>;
  opportunities: BuiltOpportunity[];
  dataQuality: { status: "VERIFIED" | "PARTIAL" | "INSUFFICIENT_DATA"; notes: string[] };
}

export function analyzeProcurement(opts: {
  bundle: SalesBundle;
  salesByProduct: Map<number, ProductSales>;
  inventory: Map<number, number>; // kullanılabilir adet
  suppliers: SupplierContext[];
  productDims: Map<number, { name: string; sku: string; buyPrice: number; categoryId: number | null }>;
  lastSaleByProduct: Map<number, Date>;
  settings?: Partial<ProcurementSettings>;
}): ProcurementAnalysis {
  const settings: ProcurementSettings = { ...DEFAULT_PROCUREMENT_SETTINGS, ...(opts.settings ?? {}) };
  const notes: string[] = [];
  const periodDays = settings.periodDays;

  // ABC/XYZ bağlamı (FAZ 1 motoru yeniden kullanılır)
  let abcSummary: Record<string, number> = {};
  try {
    const abc = computeAbcXyz(opts.bundle, { windowDays: Math.max(periodDays, 30) });
    for (const [k, v] of Object.entries(abc.matrix)) abcSummary[k] = v.count;
  } catch {
    notes.push("ABC/XYZ sınıflaması hesaplanamadı; procurement sonuçları bundan etkilenmez.");
  }

  // Tedarikçi bazında ortalama termin (PO gerçek kayıtları)
  const supplierLeadByProduct = new Map<number, number>();
  for (const s of opts.suppliers) {
    for (const po of s.pos) {
      const first = po.receipts.map((rc) => rc.createdAt).sort((a, b) => a.getTime() - b.getTime())[0];
      const actual = first ? Math.floor((first.getTime() - po.createdAt.getTime()) / 86400000) : s.leadTimeDays;
      for (const it of po.items) {
        const cur = supplierLeadByProduct.get(it.productId);
        supplierLeadByProduct.set(it.productId, cur == null ? actual : Math.round((cur + actual) / 2));
      }
    }
  }

  // Yeniden sipariş adayları
  const reorderCandidates: ReorderCandidate[] = [];
  for (const [pid, s] of opts.salesByProduct) {
    if (s.unitsSold <= 0) continue;
    const velocity = s.unitsSold / periodDays;
    if (velocity <= 0) continue;
    const dim = opts.productDims.get(pid);
    const available = opts.inventory.get(pid) ?? 0;
    const daysCover = available / velocity;
    const leadTime = supplierLeadByProduct.get(pid) ?? null;
    const reorderPoint = velocity * ((leadTime ?? 7) + settings.reorderCoverDays);
    if (available <= reorderPoint) {
      const targetQty = Math.ceil(velocity * (settings.reorderCoverDays + (leadTime ?? 7))) - available;
      const unitCost = dim && n(dim.buyPrice) > 0 ? n(dim.buyPrice) : 0;
      // Stok biterse beklenen kayıp: kapsam dışı gün × hız × katkı (maliyet varsa)
      const unitPriceProxy = velocity > 0 ? s.grossRevenue / Math.max(s.unitsSold, 1) : 0;
      const unitContrib = unitCost > 0 ? Math.max(0, unitPriceProxy - unitCost) : unitPriceProxy * 0.25;
      const shortfallDays = Math.max(0, (leadTime ?? 7) - daysCover);
      const estimatedStockoutLoss = r2(shortfallDays * velocity * unitContrib);
      reorderCandidates.push({
        productId: pid,
        name: dim?.name ?? `Ürün #${pid}`,
        sku: dim?.sku ?? "",
        availableQty: available,
        velocityPerDay: r2(velocity),
        daysCover: available > 0 ? r2(daysCover) : 0,
        leadTimeDays: leadTime,
        suggestedQty: Math.max(1, targetQty),
        unitCost: r2(unitCost),
        estimatedStockoutLoss,
      });
    }
  }
  reorderCandidates.sort((a, b) => (b.estimatedStockoutLoss ?? 0) - (a.estimatedStockoutLoss ?? 0));

  // Ölü stok (dönem içinde sıfır satış + stokta var)
  const deadStock: DeadStockRow[] = [];
  const deadStockDays = settings.deadStockDays;
  for (const [pid, qty] of opts.inventory) {
    if (qty <= 0) continue;
    const s = opts.salesByProduct.get(pid);
    const sold = s?.unitsSold ?? 0;
    if (sold > 0) continue;
    const dim = opts.productDims.get(pid);
    const unitCost = dim && n(dim.buyPrice) > 0 ? n(dim.buyPrice) : 0;
    if (unitCost <= 0) continue; // maliyet bilinmiyor → para değeri uydurma
    const last = opts.lastSaleByProduct.get(pid);
    deadStock.push({
      productId: pid,
      name: dim?.name ?? `Ürün #${pid}`,
      sku: dim?.sku ?? "",
      qty,
      value: r2(qty * unitCost),
      daysSinceLastSale: last ? Math.floor((Date.now() - last.getTime()) / 86400000) : null,
    });
  }
  deadStock.sort((a, b) => b.value - a.value);

  // Fazla stok
  const overstock: OverstockRow[] = [];
  for (const [pid, s] of opts.salesByProduct) {
    if (s.unitsSold <= 0) continue;
    const velocity = s.unitsSold / periodDays;
    const available = opts.inventory.get(pid) ?? 0;
    const daysCover = available / velocity;
    const limit = settings.reorderCoverDays * settings.overstockFactor;
    if (daysCover > limit) {
      const excessQty = Math.floor(available - velocity * settings.reorderCoverDays * 2);
      const dim = opts.productDims.get(pid);
      const unitCost = dim && n(dim.buyPrice) > 0 ? n(dim.buyPrice) : 0;
      if (excessQty > 0 && unitCost > 0) {
        overstock.push({
          productId: pid,
          name: dim?.name ?? `Ürün #${pid}`,
          sku: dim?.sku ?? "",
          availableQty: available,
          velocityPerDay: r2(velocity),
          daysCover: r2(daysCover),
          excessQty,
          excessValue: r2(excessQty * unitCost),
        });
      }
    }
  }
  overstock.sort((a, b) => b.excessValue - a.excessValue);

  const totals = {
    deadStockValue: r2(deadStock.reduce((s, r) => s + r.value, 0)),
    overstockExcessValue: r2(overstock.reduce((s, r) => s + r.excessValue, 0)),
    productsWithStock: [...opts.inventory.values()].filter((q) => q > 0).length,
  };

  // Fırsatlar
  const opportunities: BuiltOpportunity[] = [];
  const period = { start: daysAgoISO(periodDays), end: new Date().toISOString().slice(0, 10) };

  const topDead = deadStock.slice(0, 5);
  const deadValue = r2(topDead.reduce((s, r) => s + r.value, 0));
  if (topDead.length > 0 && deadValue > 0) {
    opportunities.push(buildOpportunity({
      opportunityKey: "CASH_FLOW_OPTIMIZATION|dead_stock|aggregate",
      opportunityType: "CASH_FLOW_OPTIMIZATION",
      title: `Ölü stok ${topDead.length} kalemde ${deadValue} TL bağlı — likide çevirme planı`,
      description: `${periodDays}+ gündür satılmayan ve stokta bekleyen kalemlerin maliyeti ${deadValue} TL. Nakit boşaltma ve raf alanı kazanma fırsatı.`,
      sourceModule: "procurement",
      estimatedCashImpact: deadValue,
      estimatedCostSaving: r2(deadValue * 0.15), // raf/işletme yükü tahmini
      estimatedProfitImpact: 0,
      confidenceScore: combinedConfidence(85, topDead.length, 5),
      dataCoverage: 85,
      priorityInputs: {
        financialImpact: financialImpactScale(deadValue, 75000),
        feasibility: 65,
        urgency: 45,
        strategic: 70,
      },
      evidence: topDead.map((r) => `${r.name}: ${r.qty} adet × ${r2(r.value / Math.max(r.qty, 1))} TL = ${r.value} TL${r.daysSinceLastSale != null ? ` (son satış ${r.daysSinceLastSale} gün önce)` : ""}`),
      assumptions: [
        "Ölü stok = dönemde sıfır satış + stokta mevcut, ölü stok eşiği ayarlardan (faz2.procurement.dead_stock_days).",
        "Likidasyon fiyatı varsayımı yoktur; nakit etkisi maliyet üzerinden gösterilir (üst sınır).",
        "Maliyeti bilinmeyen SKU'lar dışarıda.",
      ],
      calculationMethod: "bağlanan nakit = Σ(qty × buy_price); hedef = bu değeri indirim/paket kampanyasıyla likide çevirmek.",
      recommendedAction: "İndirim/paket kampanyası veya tedarikçiye iade/değişim görüşmesi başlatın; 30 gün sonra kapanışı ölçün.",
      dataPeriodStart: period.start,
      dataPeriodEnd: period.end,
      expiresInDays: 60,
    }));
  }

  const topOver = overstock.slice(0, 5);
  const overValue = r2(topOver.reduce((s, r) => s + r.excessValue, 0));
  if (topOver.length > 0 && overValue > 0) {
    opportunities.push(buildOpportunity({
      opportunityKey: "STOCK_OPTIMIZATION|overstock|aggregate",
      opportunityType: "STOCK_OPTIMIZATION",
      title: `Fazla stok ${topOver.length} kalemde ${overValue} TL — alım yasağı + satış ivmesi`,
      description: `Kaplama süresi hedefin ${settings.overstockFactor} katını aşan kalemler; yeni alım durdurulup satış ivmesi (vitrin/çapraz satış) düşünülmeli.`,
      sourceModule: "procurement",
      estimatedCashImpact: overValue,
      estimatedProfitImpact: 0,
      confidenceScore: combinedConfidence(75, topOver.reduce((s, r) => s + Math.round(r.velocityPerDay * periodDays), 0), 40),
      dataCoverage: 75,
      priorityInputs: {
        financialImpact: financialImpactScale(overValue, 75000),
        feasibility: 70,
        urgency: 40,
        strategic: 60,
      },
      evidence: topOver.map((r) => `${r.name}: ${r.availableQty} adet, kaplama ${r.daysCover} gün, fazla ${r.excessQty} adet = ${r.excessValue} TL`),
      assumptions: [
        "Fazla adet = mevcut − hedef kaplama (reorder_cover_days × 2); hedef dışı kısmın maliyetidir.",
        "Talep hızı dönem ortalamasıdır; mevsimsellik hesaba katılmadı.",
      ],
      calculationMethod: "fazla adet = available − hız × (reorder_cover_days × 2); excessValue = fazla × buy_price.",
      recommendedAction: "Bu kalemlerde alım yasağı koyun; vitrin, paket (bundle) ve çapraz satışla hızı artırın; 60 gün sonra yeniden hesaplayın.",
      dataPeriodStart: period.start,
      dataPeriodEnd: period.end,
      expiresInDays: 60,
    }));
  }

  const topReorder = reorderCandidates.slice(0, 5).filter((r) => (r.estimatedStockoutLoss ?? 0) > 0);
  if (topReorder.length > 0) {
    const est = r2(topReorder.reduce((s, r) => s + (r.estimatedStockoutLoss ?? 0), 0));
    opportunities.push(buildOpportunity({
      opportunityKey: "STOCK_OPTIMIZATION|reorder|aggregate",
      opportunityType: "STOCK_OPTIMIZATION",
      title: `${topReorder.length} kalemde stok tükenme riski — yeniden sipariş önerisi`,
      description: "Kaplama günü kalan sipariş gününden düşük; üretilmezse satış kaybı doğar. Önerilen adetler hız×(termin+hedef kapsam) formülüyledir.",
      sourceModule: "procurement",
      estimatedProfitImpact: est,
      estimatedCashImpact: r2(topReorder.reduce((s, r) => s + r.suggestedQty * r.unitCost, 0)),
      confidenceScore: combinedConfidence(75, topReorder.length, 5),
      dataCoverage: 70,
      priorityInputs: {
        financialImpact: financialImpactScale(est, 40000),
        feasibility: 90,
        urgency: 80,
        strategic: 55,
      },
      evidence: topReorder.map((r) => `${r.name}: kalan ${r.availableQty} adet (${r.daysCover}g), öneri ${r.suggestedQty} adet, termin ${r.leadTimeDays ?? "n/a"}g`),
      assumptions: [
        "Satış hızı dönem ortalamasıdır (düz hız varsayımı); hız değişirse öneri güncellenmelidir.",
        "Beklenen stoksuz satış kaybı = kısa kalan gün × hız × birim katkı (yaklaşık).",
      ],
      calculationMethod: "reorder noktası = hız × (tedarikçi termin + hedef kapsam); öneri = ceil(hız × (termin + kapsam)) − mevcut.",
      recommendedAction: "Önerilen adetlerle satınalma taslağı oluşturun; onay sonrası tedarikçiye sipariş geçin.",
      dataPeriodStart: period.start,
      dataPeriodEnd: period.end,
      expiresInDays: 21,
    }));
  }

  const status: "VERIFIED" | "PARTIAL" | "INSUFFICIENT_DATA" =
    totals.productsWithStock === 0 ? "INSUFFICIENT_DATA"
    : opts.salesByProduct.size === 0 ? "PARTIAL"
    : "PARTIAL";
  if (totals.productsWithStock === 0) notes.push("Stok kaydı yok.");
  else notes.push("Satış hızı düz varsayılır; yeniden sipariş önerileri yönetici onayı olmadan uygulanmaz.");
  notes.push("ABC/XYZ bağlamı FAZ 1 sınıflamasından yeniden hesaplanır.");

  return {
    generatedAt: new Date().toISOString(),
    settings,
    reorderCandidates: reorderCandidates.slice(0, 20),
    deadStock,
    overstock: overstock.slice(0, 20),
    totals,
    abcSummary,
    opportunities,
    dataQuality: { status, notes },
  };
}

function daysAgoISO(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}
