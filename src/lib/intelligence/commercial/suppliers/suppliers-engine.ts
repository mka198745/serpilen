/**
 * SUPPLIER PERFORMANCE ENGINE — gerçek PO/GDN/iade verisinden türetilir.
 * Ürün↔tedarikçi bağı doğrudan şemada YOKTUR; bağ yalnızca PO geçmişi üzerindedir
 * ve öyle etiketlenir. Eksik kriterler skor dışı bırakılır; KAPSAM % raporlanır.
 */
import { weightedScore, type ScoreCriterion } from "../core/scoring-engine";
import { combinedConfidence } from "../core/confidence-engine";
import { financialImpactScale } from "../core/priority-score";
import { buildOpportunity } from "../core/commercial-opportunity-engine";
import type { BuiltOpportunity } from "../core/commercial-opportunity-engine";
import type { SupplierContext, ProductSales } from "../data-prep";

const n = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (v: number) => Number(v.toFixed(2));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dayDiff = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / 86400000);

export interface SupplierSettings {
  periodDays: number;         // bilgi amaçlı (PO penceresi 365g; skor tüm PO'lara bakar)
  lowScoreThreshold: number;  // bu skor altı "iyileştirme" fırsatı
  singleSourceSharePct: number; // tek kaynak yoğunlaşması alarmı
  costInflationPct: number;   // birim maliyet artışı alarmı
}

export const DEFAULT_SUPPLIER_SETTINGS: SupplierSettings = {
  periodDays: 180,
  lowScoreThreshold: 60,
  singleSourceSharePct: 60,
  costInflationPct: 5,
};

export interface SupplierScoreRow {
  supplierId: number;
  name: string;
  isActive: boolean;
  poCount: number;
  totalSpend: number;
  totalOrderedQty: number;
  totalReceivedQty: number;
  fillRatePct: number | null;
  onTimePct: number | null;
  avgActualLeadDays: number | null;
  promisedLeadDays: number;
  returnsLinkedValue: number;
  returnsLinkedUnits: number;
  score: number | null;      // 0-100, null = hiç kriter yok
  coverage: number;          // kapsanan ağırlık %
  missing: string[];
  ratingEntry: number | null; // suppliers.rating (personel girişi — öznel)
  rank: number;
}

export interface SupplierAnalysis {
  generatedAt: string;
  settings: SupplierSettings;
  rows: SupplierScoreRow[];
  categoryConcentration: Array<{ categoryId: number; categoryName: string; supplierId: number; supplierName: string; sharePct: number; risk: "SINGLE_SOURCE" | "CONCENTRATED" }>;
  opportunities: BuiltOpportunity[];
  dataQuality: { status: "VERIFIED" | "PARTIAL" | "INSUFFICIENT_DATA"; notes: string[] };
}

const CRITERIA_WEIGHTS = { onTime: 25, fillRate: 25, leadTime: 15, quality: 20, price: 10, rating: 5 } as const;

export function analyzeSuppliers(opts: {
  suppliers: SupplierContext[];
  salesByProduct: Map<number, ProductSales>;
  categoryByProduct: Map<number, { id: number | null; name: string | null }>;
  allSuppliersForConcentration?: Array<{ supplierId: number; categoryId: number | null; units: number }>;
  settings?: Partial<SupplierSettings>;
}): SupplierAnalysis {
  const settings: SupplierSettings = { ...DEFAULT_SUPPLIER_SETTINGS, ...(opts.settings ?? {}) };
  const notes: string[] = [];
  const opportunities: BuiltOpportunity[] = [];
  const period = { start: daysAgoISO(settings.periodDays), end: new Date().toISOString().slice(0, 10) };

  const rows: SupplierScoreRow[] = [];
  const poSupplierCategoryUnits: Array<{ supplierId: number; categoryId: number | null; units: number }> = [];

  for (const s of opts.suppliers) {
    const poCount = s.pos.length;
    const allItems = s.pos.flatMap((po) => po.items.map((it) => ({ ...it, poId: po.id, poCreatedAt: po.createdAt, expectedDate: po.expectedDate, receipts: po.receipts })));
    const totalOrderedQty = allItems.reduce((sum, it) => sum + it.quantity, 0);
    const totalReceivedQty = allItems.reduce((sum, it) => sum + it.receivedQty, 0);
    const totalSpend = s.pos.reduce((sum, po) => sum + po.totalAmount, 0);

    // 1) Zamanında teslim
    let evaluated = 0, onTime = 0;
    const actualLeadDays: number[] = [];
    for (const po of s.pos) {
      const first = po.receipts.map((r) => r.createdAt).sort((a, b) => a.getTime() - b.getTime())[0];
      if (first) actualLeadDays.push(dayDiff(po.createdAt, first));
      if (po.expectedDate) {
        evaluated += 1;
        if (first) {
          const exp = new Date(po.expectedDate);
          if (!Number.isNaN(exp.getTime()) && first <= new Date(exp.getTime() + 86400000 - 1)) onTime += 1;
        }
      }
    }
    const onTimePct = evaluated > 0 ? r2((onTime / evaluated) * 100) : null;

    // 2) Doluluk oranı
    const fillRatePct = totalOrderedQty > 0 ? r2((totalReceivedQty / totalOrderedQty) * 100) : null;

    // 3) Termin uyumu
    const avgActualLeadDays = actualLeadDays.length ? r2(actualLeadDays.reduce((a, b) => a + b, 0) / actualLeadDays.length) : null;
    const promised = Math.max(0, s.leadTimeDays);
    const leadTimeScore = avgActualLeadDays == null
      ? null
      : promised <= 0
        ? (avgActualLeadDays <= 1 ? 100 : 80)
        : clamp(100 * (1 - Math.max(0, avgActualLeadDays - promised) / Math.max(promised, 1)), 0, 100);

    // 4) Kalite (PO'su olan ürünlerin iade oranı)
    const productIds = [...new Set(allItems.map((it) => it.productId))];
    let linkedReturnUnits = 0, linkedReturnValue = 0, linkedSoldUnits = 0;
    for (const pid of productIds) {
      const sl = opts.salesByProduct.get(pid);
      if (!sl) continue;
      linkedSoldUnits += sl.unitsSold;
      linkedReturnUnits += sl.returnsQty;
      linkedReturnValue += sl.returnsValue;
    }
    const qualityScore = linkedSoldUnits >= 5 ? clamp(100 - (linkedReturnUnits / linkedSoldUnits) * 100 * 8, 0, 100) : null;

    // 5) Fiyat trendi (aynı ürün için ilk vs son PO birim maliyeti)
    let priceScore: number | null = null;
    const byProduct = new Map<number, Array<{ t: number; cost: number }>>();
    for (const po of s.pos) {
      for (const it of po.items) {
        if (!byProduct.has(it.productId)) byProduct.set(it.productId, []);
        byProduct.get(it.productId)!.push({ t: po.createdAt.getTime(), cost: it.unitCost });
      }
    }
    let increases: number[] = [];
    for (const arr of byProduct.values()) {
      if (arr.length < 2) continue;
      arr.sort((a, b) => a.t - b.t);
      const first = arr[0].cost, last = arr[arr.length - 1].cost;
      if (first > 0) increases.push(((last - first) / first) * 100);
    }
    if (increases.length) {
      const avgInc = increases.reduce((a, b) => a + b, 0) / increases.length;
      priceScore = clamp(100 - Math.max(0, avgInc) * 2, 0, 100);
    }

    const criteria: ScoreCriterion[] = [
      { key: "onTime", weight: CRITERIA_WEIGHTS.onTime, score: onTimePct },
      { key: "fillRate", weight: CRITERIA_WEIGHTS.fillRate, score: fillRatePct != null ? clamp(fillRatePct, 0, 100) : null },
      { key: "leadTime", weight: CRITERIA_WEIGHTS.leadTime, score: leadTimeScore },
      { key: "quality", weight: CRITERIA_WEIGHTS.quality, score: qualityScore },
      { key: "price", weight: CRITERIA_WEIGHTS.price, score: priceScore },
      { key: "rating", weight: CRITERIA_WEIGHTS.rating, score: s.rating != null ? clamp((s.rating / 5) * 100, 0, 100) : null },
    ];
    const ws = weightedScore(criteria);

    rows.push({
      supplierId: s.id,
      name: s.name,
      isActive: s.isActive,
      poCount,
      totalSpend: r2(totalSpend),
      totalOrderedQty,
      totalReceivedQty,
      fillRatePct,
      onTimePct,
      avgActualLeadDays,
      promisedLeadDays: promised,
      returnsLinkedValue: r2(linkedReturnValue),
      returnsLinkedUnits: linkedReturnUnits,
      score: ws.score,
      coverage: ws.coverage,
      missing: ws.missing,
      ratingEntry: s.rating,
      rank: 0,
    });

    // Kategori yoğunlaşması için ({tedarikçi, kategori, adet}) listesi
    for (const it of allItems) {
      const cat = opts.categoryByProduct.get(it.productId);
      poSupplierCategoryUnits.push({ supplierId: s.id, categoryId: cat?.id ?? null, units: it.quantity });
    }
  }

  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  rows.forEach((r, i) => { r.rank = i + 1; });

  // Kategori yoğunlaşma / tek kaynak
  const catNameById = new Map<number, string>();
  for (const v of opts.categoryByProduct.values()) {
    if (v.id != null && v.name) catNameById.set(v.id, v.name);
  }
  const catAgg = new Map<string, { categoryId: number | null; categoryName: string; bySupplier: Map<number, number>; total: number }>();
  for (const rec of poSupplierCategoryUnits) {
    const key = String(rec.categoryId ?? "NA");
    const catName = rec.categoryId != null ? (catNameById.get(rec.categoryId) ?? `Kategori #${rec.categoryId}`) : "Kategorisiz";
    if (!catAgg.has(key)) catAgg.set(key, { categoryId: rec.categoryId, categoryName: catName, bySupplier: new Map(), total: 0 });
    const agg = catAgg.get(key)!;
    agg.bySupplier.set(rec.supplierId, (agg.bySupplier.get(rec.supplierId) ?? 0) + rec.units);
    agg.total += rec.units;
  }
  const categoryConcentration: SupplierAnalysis["categoryConcentration"] = [];
  const supplierName = new Map(opts.suppliers.map((s) => [s.id, s.name]));
  for (const agg of catAgg.values()) {
    if (agg.categoryId == null || agg.total <= 0) continue;
    for (const [supId, units] of agg.bySupplier) {
      const share = (units / agg.total) * 100;
      if (share >= settings.singleSourceSharePct && agg.bySupplier.size === 1) {
        categoryConcentration.push({ categoryId: agg.categoryId, categoryName: agg.categoryName, supplierId: supId, supplierName: supplierName.get(supId) ?? `Tedarikçi #${supId}`, sharePct: r2(share), risk: "SINGLE_SOURCE" });
      } else if (share >= settings.singleSourceSharePct) {
        categoryConcentration.push({ categoryId: agg.categoryId, categoryName: agg.categoryName, supplierId: supId, supplierName: supplierName.get(supId) ?? `Tedarikçi #${supId}`, sharePct: r2(share), risk: "CONCENTRATED" });
      }
    }
  }

  // Fırsatlar
  for (const r of rows) {
    if (r.score != null && r.score < settings.lowScoreThreshold && r.poCount >= 1) {
      const weak: string[] = [];
      if (r.onTimePct != null && r.onTimePct < 70) weak.push(`zamanında teslim %${r.onTimePct}`);
      if (r.fillRatePct != null && r.fillRatePct < 90) weak.push(`doluluk %${r.fillRatePct}`);
      if (r.avgActualLeadDays != null && r.avgActualLeadDays > r.promisedLeadDays + 2) weak.push(`gerçek termin ${r.avgActualLeadDays}g (taahhüt ${r.promisedLeadDays}g)`);
      const est = r2(r.returnsLinkedValue * 0.3); // bağlantılı iade değerinin %30'u geri kazanılabilir varsayımı
      opportunities.push(buildOpportunity({
        opportunityKey: `SUPPLIER_IMPROVEMENT|supplier:${r.supplierId}|low_score`,
        opportunityType: "SUPPLIER_IMPROVEMENT",
        title: `"${r.name}" tedarikçi performansı düşük (skor ${r.score}) — iyileştirme/alternatif değerlendir`,
        description: `Kapsama %${r.coverage} ile ölçülen skor ${r.score}/100. Zayıf noktalar: ${weak.join(", ") || "bkz. detay"}.`,
        sourceModule: "suppliers",
        relatedSupplierId: r.supplierId,
        estimatedCostSaving: est,
        estimatedProfitImpact: est,
        confidenceScore: combinedConfidence(r.coverage, r.poCount, 6),
        dataCoverage: r.coverage,
        priorityInputs: {
          financialImpact: financialImpactScale(Math.max(est, r.totalSpend * 0.05), 60000),
          feasibility: 55,
          urgency: r.score < 40 ? 80 : 55,
          strategic: 75,
        },
        evidence: [
          `${r.poCount} PO, toplam spend ${r.totalSpend} TL`,
          `Doluluk %${r.fillRatePct ?? "n/a"} · Zamanında %${r.onTimePct ?? "n/a"} · Gerçek termin ${r.avgActualLeadDays ?? "n/a"}g (taahhüt ${r.promisedLeadDays}g)`,
          `Tedarikçi ürünlerinde bağlı iade değeri ${r.returnsLinkedValue} TL (${r.returnsLinkedUnits} adet)`,
          `Skor kapsamı %${r.coverage}; eksik kriterler: ${r.missing.join(", ") || "yok"}`,
        ],
        assumptions: [
          "Ürün↔tedarikçi bağı PO geçmişinden türetilmiştir (ayrı alan yok).",
          "Bağlı iade değerinin %30'u iyileştirmeyle geri kazanılabilir varsayıldı (ölçülmüş etki değil).",
          "Eksik alt kriterler skor dışı bırakıldı; kapsama %'si ayrıca verilir.",
        ],
        calculationMethod: "Ağırlıklı normalize skor (zamanında 25, doluluk 25, termin 15, kalite 20, fiyat 10, kayıt 5); tasarruf = bağlı iade değeri × %30.",
        recommendedAction: "Tedarikçiyle SLA toplantısı planlayın veya alternatif kaynak arayın; 60 gün sonra yeniden ölçün.",
        dataPeriodStart: period.start,
        dataPeriodEnd: period.end,
        expiresInDays: 45,
      }));
    }

    if (r.returnsLinkedValue > 0 && r.score != null && r.score >= settings.lowScoreThreshold) {
      // İyi skorda bile yüksek bağlı iade varsa kalite fırsatı
      const est = r2(r.returnsLinkedValue * 0.3);
      if (est >= 100) {
        opportunities.push(buildOpportunity({
          opportunityKey: `SUPPLIER_IMPROVEMENT|supplier:${r.supplierId}|returns_linked`,
          opportunityType: "SUPPLIER_IMPROVEMENT",
          title: `"${r.name}" ürünlerinde iade değeri ${r.returnsLinkedValue} TL — kalite geri bildirimi`,
          description: "Tedarikçi ürünlerinde onaylanmış satışlara bağlı iadeler tespit edildi; kalite/spesifikasyon görüşmesi önerilir.",
          sourceModule: "suppliers",
          relatedSupplierId: r.supplierId,
          estimatedCostSaving: est,
          estimatedProfitImpact: est,
          confidenceScore: combinedConfidence(70, r.poCount, 6),
          dataCoverage: 70,
          priorityInputs: {
            financialImpact: financialImpactScale(est, 50000),
            feasibility: 60,
            urgency: 35,
            strategic: 65,
          },
          evidence: [
            `Bağlı iade değeri ${r.returnsLinkedValue} TL (${r.returnsLinkedUnits} adet)`,
            `Skor ${r.score}/100 (kapsama %${r.coverage})`,
          ],
          assumptions: [
            "Ürün↔tedarikçi bağı PO geçmişinden türetilmiştir.",
            "%30 geri kazanım varsayımı; gerçek oran pilot ile ölçülmeli.",
          ],
          calculationMethod: "İyileştirme potansiyeli = tedarikçi ürünlerindeki iade değeri × %30.",
          recommendedAction: "İade nedeni Pareto'sunu tedarikçiyle paylaşın; defolu ürün süreçlerini gözden geçirin.",
          dataPeriodStart: period.start,
          dataPeriodEnd: period.end,
          expiresInDays: 60,
        }));
      }
    }
  }

  for (const conc of categoryConcentration.filter((c) => c.risk === "SINGLE_SOURCE")) {
    opportunities.push(buildOpportunity({
      opportunityKey: `SUPPLIER_RISK|category:${conc.categoryId}|single_source`,
      opportunityType: "SUPPLIER_RISK",
      title: `"${conc.categoryName}" kategorisinde tek kaynak: ${conc.supplierName} (%${conc.sharePct})`,
      description: "Son 12 ayda kategoriye yapılan alımların tamamı tek tedarikçiden; tedarik kesintisi riskine açıktır.",
      sourceModule: "suppliers",
      relatedSupplierId: conc.supplierId,
      relatedCategoryId: conc.categoryId,
      estimatedCashImpact: 0,
      estimatedProfitImpact: 0,
      estimatedCostSaving: 0,
      confidenceScore: 75,
      dataCoverage: 80,
      priorityInputs: { financialImpact: 35, feasibility: 50, urgency: 55, strategic: 85 },
      evidence: [
        `${conc.categoryName}: ${conc.supplierName} payı %${conc.sharePct} (tek PO kaynağı)`,
        "Alternatif kaynak sayısı: 0 (PO geçmişi)",
      ],
      assumptions: [
        "Alımlar yalnızca PO geçmişiyle sınırlıdır; PO dışı tedarik dikkate alınmaz.",
        "Finansal etki tahmini yoktur — risk nitelikseldir.",
      ],
      calculationMethod: "Kategori birimi içinde tek tedarikçi payı %100 → SINGLE_SOURCE.",
      recommendedAction: "Kategori için en az bir alternatif tedarikçi tekliflendirin; güvenlik stokunu gözden geçirin.",
      dataPeriodStart: period.start,
      dataPeriodEnd: period.end,
      expiresInDays: 90,
    }));
  }

  const withPOs = rows.filter((r) => r.poCount > 0).length;
  const status: "VERIFIED" | "PARTIAL" | "INSUFFICIENT_DATA" =
    opts.suppliers.length === 0 ? "INSUFFICIENT_DATA"
    : withPOs === 0 ? "INSUFFICIENT_DATA"
    : rows.some((r) => r.coverage >= 80) ? "PARTIAL"
    : "PARTIAL";
  if (opts.suppliers.length === 0) notes.push("Tedarikçi kaydı yok.");
  else if (withPOs === 0) notes.push("Tedarikçiler var ancak PO/GDN kaydı yok — performans türetilemez.");
  else notes.push("On-time karşılaştırması yalnızca expected_date girilmiş PO'larda yapılır; kapsama her satırda raporlanır.");

  return {
    generatedAt: new Date().toISOString(),
    settings,
    rows,
    categoryConcentration,
    opportunities,
    dataQuality: { status, notes },
  };
}

function daysAgoISO(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}
