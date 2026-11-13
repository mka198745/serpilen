/**
 * SMART PRICING ENGINE — saf (DB'siz) hesaplama.
 *
 * Bilinçli sınırlar:
 * - Rakip fiyat veya elastikiyet verisi YOKTUR → talep düz (FLAT) varsayılır;
 *   her öneride bu varsayım açıkça yazılır.
 * - Komisyon/kargo/paketleme maliyetleri şemada yoktur → katkı hesabı bu kalemleri
 *   içermez; eksik maliyet listesi her satırda döner.
 * - Geçmiş maliyet bilinmez (cari buy_price kullanılır).
 */
import {
  grossMarginPct,
  contributionPerUnit,
  contributionMarginPct,
  priceForTargetMargin,
  MISSING_VARIABLE_COST_KEYS,
} from "../core/financial-calculator";
import type { BuiltOpportunity, OpportunityDraft } from "../core/commercial-opportunity-engine";
import { buildOpportunity } from "../core/commercial-opportunity-engine";
import { combinedConfidence } from "../core/confidence-engine";
import { financialImpactScale } from "../core/priority-score";

export interface PricingSettings {
  targetMarginPct: number;      // hedef katkı marjı (ör. 25)
  minMarginPct: number;         // bu altı "düşük marj" sayılır (ör. 15)
  minUnitsPeriod: number;       // öneri için asgari satış adedi dönemde
  periodDays: number;           // analiz dönemi
  maxSuggestedIncreasePct: number; // tek öneride azami fiyat artışı (ör. 20)
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  targetMarginPct: 25,
  minMarginPct: 15,
  minUnitsPeriod: 5,
  periodDays: 90,
  maxSuggestedIncreasePct: 20,
};

export interface PricingProductInput {
  id: number;
  name: string;
  sku: string;
  categoryId: number | null;
  categoryName?: string | null;
  isActive: boolean;
  buyPrice: number;
  retailPrice: number;
  campaignPrice: number | null;
}

export interface PricingSalesInput {
  unitsSold: number;
  grossRevenue: number; // KDV hariç, satır geliri toplamı
  returnsQty: number;   // iade edilen adet (gözlem)
}

export interface PricingInventoryInput {
  availableQty: number; // fiziksel - rezerve
}

export type PricingFlag =
  | "NEGATIVE_CONTRIBUTION"   // etkin fiyat ≤ maliyet
  | "LOW_MARGIN_HIGH_VOLUME"  // düşük marjlı ama satan ürün
  | "CAMPAIGN_BELOW_COST"     // kampanya fiyatı maliyetin altında
  | "DISCOUNT_MARGIN_LEAK"    // gerçekleşen fiyat, etkin liste fiyatının anlamlı altında
  | "COST_UNKNOWN";           // maliyet verisi yok

export interface PricingRow {
  productId: number;
  name: string;
  sku: string;
  categoryId: number | null;
  categoryName: string | null;
  isActive: boolean;
  unitCost: number;
  listPrice: number;
  campaignPrice: number | null;
  effectivePrice: number;    // min(liste, kampanya) — geçerli fiyat
  realizedPrice: number | null; // Σ(satır geliri)/Σ(adet) — dönem gerçekleşme
  costKnown: boolean;
  grossMarginPct: number | null;
  contributionPerUnit: number | null;
  contributionMarginPct: number | null;
  realizedContributionPct: number | null;
  unitsSold: number;
  returnsQty: number;
  grossRevenue: number;
  velocityPerDay: number;
  stockQty: number;
  suggestedPrice: number | null;   // hedef marj fiyatı (artışta tavan uygulanmış)
  flags: PricingFlag[];
  missingVariableCosts: readonly string[];
}

export interface PricingAnalysis {
  generatedAt: string;
  periodDays: number;
  settings: PricingSettings;
  rows: PricingRow[];
  summary: {
    productCount: number;
    costKnownCount: number;
    costCoveragePct: number;
    negativeContributionCount: number;
    lowMarginCount: number;
    campaignBelowCostCount: number;
    totalUnits: number;
    totalRevenue: number;
  };
  dataQuality: {
    status: "VERIFIED" | "PARTIAL" | "INSUFFICIENT_DATA";
    notes: string[];
  };
  opportunities: BuiltOpportunity[];
}

const n = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (v: number) => Number(v.toFixed(2));

export function analyzePricing(opts: {
  products: PricingProductInput[];
  sales: Map<number, PricingSalesInput>;
  inventory: Map<number, PricingInventoryInput>;
  settings?: Partial<PricingSettings>;
}): PricingAnalysis {
  const settings: PricingSettings = { ...DEFAULT_PRICING_SETTINGS, ...(opts.settings ?? {}) };
  const periodDays = settings.periodDays;
  const notes: string[] = [];
  if (opts.products.length === 0) notes.push("Ürün kaydı bulunamadı.");

  const rows: PricingRow[] = [];
  for (const p of opts.products) {
    const s = opts.sales.get(p.id) ?? { unitsSold: 0, grossRevenue: 0, returnsQty: 0 };
    const inv = opts.inventory.get(p.id)?.availableQty ?? 0;
    const costKnown = n(p.buyPrice) > 0;
    const unitCost = n(p.buyPrice);
    const listPrice = n(p.retailPrice);
    const campaignPrice = p.campaignPrice != null && n(p.campaignPrice) > 0 ? n(p.campaignPrice) : null;
    const effectivePrice = campaignPrice != null ? Math.min(listPrice, campaignPrice) : listPrice;

    const realizedPrice = s.unitsSold > 0 ? s.grossRevenue / s.unitsSold : null;
    const gmm = costKnown ? grossMarginPct(effectivePrice, unitCost) : null;
    const contrib = costKnown ? contributionPerUnit(effectivePrice, unitCost, 0) : null;
    const contribPct = costKnown ? contributionMarginPct(effectivePrice, unitCost, 0) : null;
    const realizedCPct = costKnown && realizedPrice != null ? contributionMarginPct(realizedPrice, unitCost, 0) : null;

    const flags: PricingFlag[] = [];
    if (!costKnown) flags.push("COST_UNKNOWN");
    if (costKnown && effectivePrice > 0 && contributionPerUnit(effectivePrice, unitCost, 0) <= 0) {
      flags.push("NEGATIVE_CONTRIBUTION");
    }
    if (campaignPrice != null && costKnown && campaignPrice < unitCost) {
      flags.push("CAMPAIGN_BELOW_COST");
    }
    if (
      costKnown &&
      realizedPrice != null &&
      effectivePrice > 0 &&
      realizedPrice < effectivePrice * 0.92 // %8'den fazla gerçekleşme kaybı
    ) {
      flags.push("DISCOUNT_MARGIN_LEAK");
    }
    if (
      costKnown &&
      contribPct != null &&
      contribPct > 0 &&
      contribPct < settings.minMarginPct &&
      s.unitsSold >= settings.minUnitsPeriod
    ) {
      flags.push("LOW_MARGIN_HIGH_VOLUME");
    }

    // Önerilen fiyat: hedef marj fiyatı, artış tavanı uygulanır
    let suggestedPrice: number | null = null;
    if (costKnown && flags.includes("NEGATIVE_CONTRIBUTION") || (flags.includes("LOW_MARGIN_HIGH_VOLUME"))) {
      const target = priceForTargetMargin(unitCost, settings.targetMarginPct);
      const capped = effectivePrice > 0 ? Math.min(target, effectivePrice * (1 + settings.maxSuggestedIncreasePct / 100)) : target;
      suggestedPrice = r2(Math.max(capped, unitCost));
    }

    rows.push({
      productId: p.id,
      name: p.name,
      sku: p.sku,
      categoryId: p.categoryId,
      categoryName: p.categoryName ?? null,
      isActive: p.isActive,
      unitCost: r2(unitCost),
      listPrice: r2(listPrice),
      campaignPrice: campaignPrice != null ? r2(campaignPrice) : null,
      effectivePrice: r2(effectivePrice),
      realizedPrice: realizedPrice != null ? r2(realizedPrice) : null,
      costKnown,
      grossMarginPct: gmm != null ? r2(gmm) : null,
      contributionPerUnit: contrib != null ? r2(contrib) : null,
      contributionMarginPct: contribPct != null ? r2(contribPct) : null,
      realizedContributionPct: realizedCPct != null ? r2(realizedCPct) : null,
      unitsSold: s.unitsSold,
      returnsQty: s.returnsQty,
      grossRevenue: r2(s.grossRevenue),
      velocityPerDay: periodDays > 0 ? r2(s.unitsSold / periodDays) : 0,
      stockQty: n(inv),
      suggestedPrice,
      flags,
      missingVariableCosts: [...MISSING_VARIABLE_COST_KEYS],
    });
  }

  const costKnownCount = rows.filter((r) => r.costKnown).length;
  const summary = {
    productCount: rows.length,
    costKnownCount,
    costCoveragePct: rows.length ? r2((costKnownCount / rows.length) * 100) : 0,
    negativeContributionCount: rows.filter((r) => r.flags.includes("NEGATIVE_CONTRIBUTION")).length,
    lowMarginCount: rows.filter((r) => r.flags.includes("LOW_MARGIN_HIGH_VOLUME")).length,
    campaignBelowCostCount: rows.filter((r) => r.flags.includes("CAMPAIGN_BELOW_COST")).length,
    totalUnits: rows.reduce((s, r) => s + r.unitsSold, 0),
    totalRevenue: r2(rows.reduce((s, r) => s + r.grossRevenue, 0)),
  };

  const totalObs = summary.totalUnits;
  const coverage = summary.costCoveragePct;
  const sampleOk = totalObs >= 30;
  const status: "VERIFIED" | "PARTIAL" | "INSUFFICIENT_DATA" =
    rows.length === 0 || totalObs === 0 ? "INSUFFICIENT_DATA"
    : coverage >= 80 && sampleOk ? "VERIFIED"
    : "PARTIAL";
  if (status !== "VERIFIED") notes.push(
    `Veri kapsama: maliyeti bilinen ürün ${costKnownCount}/${rows.length} (%${summary.costCoveragePct}). Komisyon/kargo/paket verisi şemada yok — katkı marjı brüt katkıdır.`
  );
  if (!sampleOk && rows.length > 0) notes.push("Satış hacmi düşük; öneriler düşük güvenle değerlendirilmelidir.");

  // Fırsat taslakları
  const opportunities: BuiltOpportunity[] = [];
  const period = { start: daysAgoISO(periodDays), end: new Date().toISOString().slice(0, 10) };
  for (const row of rows) {
    if (!row.costKnown) continue;
    if (row.flags.includes("NEGATIVE_CONTRIBUTION") && row.suggestedPrice != null) {
      const deltaPerUnit = row.suggestedPrice - row.effectivePrice;
      const est = r2(deltaPerUnit * Math.max(row.unitsSold, 1));
      opportunities.push(buildOpportunity({
        opportunityKey: `MARGIN_IMPROVEMENT|product:${row.productId}|negative_contribution`,
        opportunityType: "MARGIN_IMPROVEMENT",
        title: `"${row.name}" maliyetin altında satılıyor — fiyatlama acil düzeltme`,
        description: `Etkin satış fiyatı (${row.effectivePrice} TL) tanımlanan birim maliyetin (${row.unitCost} TL) altında veya eşit; her satış katkı kaybı üretiyor.`,
        sourceModule: "pricing",
        relatedProductId: row.productId,
        relatedCategoryId: row.categoryId,
        estimatedRevenueImpact: est,
        estimatedProfitImpact: est,
        estimatedCashImpact: 0,
        confidenceScore: combinedConfidence(summary.costCoveragePct, Math.max(row.unitsSold, 1), 30),
        dataCoverage: summary.costCoveragePct,
        priorityInputs: {
          financialImpact: financialImpactScale(est, 50000),
          feasibility: 85,
          urgency: 95,
          strategic: 60,
        },
        evidence: [
          `Etkin fiyat ${row.effectivePrice} TL ≤ maliyet ${row.unitCost} TL`,
          `Son ${periodDays} günde ${row.unitsSold} adet satıldı (gelir ${row.grossRevenue} TL)`,
          `Önerilen hedef fiyat: ${row.suggestedPrice} TL (hedef marj %${settings.targetMarginPct}, artış tavanı %${settings.maxSuggestedIncreasePct})`,
          `Stok: ${row.stockQty} adet`,
        ],
        assumptions: [
          "Talep düz varsayılır (elastikiyet verisi yok): adet sabit kalır.",
          "Maliyet = cari buy_price; geçmiş alış maliyeti kaydı yoktur.",
          "Komisyon/kargo/paket maliyetleri dışarıda (şemada yok).",
        ],
        calculationMethod: "(önerilen fiyat − etkin fiyat) × dönem satış adedi; önerilen fiyat = maliyet/(1−hedef marj), artış tavanı uygulanır.",
        recommendedAction: `Fiyatı en azından ${row.suggestedPrice} TL'ye yükseltin ya da ürünü satıştan kaldırın; kampanya fiyatı maliyetin altında kalmasın.`,
        dataPeriodStart: period.start,
        dataPeriodEnd: period.end,
        expiresInDays: 30,
      }));
    }

    if (row.flags.includes("LOW_MARGIN_HIGH_VOLUME") && row.suggestedPrice != null && !row.flags.includes("NEGATIVE_CONTRIBUTION")) {
      const deltaPerUnit = row.suggestedPrice - row.effectivePrice;
      const est = r2(deltaPerUnit * row.unitsSold);
      opportunities.push(buildOpportunity({
        opportunityKey: `MARGIN_IMPROVEMENT|product:${row.productId}|low_margin_volume`,
        opportunityType: "MARGIN_IMPROVEMENT",
        title: `"${row.name}" düşük marjda hacim yapıyor — marj düzeltmesi`,
        description: `Dönem satış adedi ${row.unitsSold}, katkı marjı %${row.contributionMarginPct} (hedef %${settings.targetMarginPct}). Tavan dahilinde fiyat artışı kâr üretir.`,
        sourceModule: "pricing",
        relatedProductId: row.productId,
        relatedCategoryId: row.categoryId,
        estimatedRevenueImpact: est,
        estimatedProfitImpact: est,
        estimatedCashImpact: 0,
        confidenceScore: combinedConfidence(summary.costCoveragePct, row.unitsSold, 60),
        dataCoverage: summary.costCoveragePct,
        priorityInputs: {
          financialImpact: financialImpactScale(est, 75000),
          feasibility: 75,
          urgency: 60,
          strategic: 65,
        },
        evidence: [
          `Katkı marjı %${row.contributionMarginPct} < asgari %${settings.minMarginPct}`,
          `Son ${periodDays} günde ${row.unitsSold} adet (haftanın hızı ${r2(row.unitsSold / (periodDays / 7))} adet/hafta)`,
          `Gerçekleşen ortalama fiyat ${row.realizedPrice ?? "n/a"} TL`,
          `Önerilen ${row.suggestedPrice} TL (artış tavanı %${settings.maxSuggestedIncreasePct})`,
        ],
        assumptions: [
          "Talep düz varsayılır; elastikiyet ölçümü için fiyat testine ihtiyaç vardır.",
          "Maliyet = cari buy_price.",
          "Komisyon/kargo/paket maliyetleri dışarıda (şemada yok).",
        ],
        calculationMethod: "(min(hedef marj fiyatı, etkin fiyat × (1+tavan)) − etkin fiyat) × dönem adedi.",
        recommendedAction: `Fiyatı ${row.suggestedPrice} TL seviyesine taşımayı değerlendirin; değişiklikten 2-4 hafta sonra gerçekleşen satış adedini gözden geçirin.`,
        dataPeriodStart: period.start,
        dataPeriodEnd: period.end,
        expiresInDays: 45,
      }));
    }

    if (row.flags.includes("CAMPAIGN_BELOW_COST")) {
      const lossPerUnit = r2(row.unitCost - (row.campaignPrice ?? 0));
      const est = r2(lossPerUnit * Math.max(row.unitsSold, 0));
      opportunities.push(buildOpportunity({
        opportunityKey: `PRICING_OPPORTUNITY|product:${row.productId}|campaign_below_cost`,
        opportunityType: "PRICING_OPPORTUNITY",
        title: `"${row.name}" kampanya fiyatı maliyetin altında`,
        description: `Kampanya fiyatı (${row.campaignPrice} TL) birim maliyetin (${row.unitCost} TL) altında; birim başına ${lossPerUnit} TL kayıp.`,
        sourceModule: "pricing",
        relatedProductId: row.productId,
        relatedCategoryId: row.categoryId,
        estimatedRevenueImpact: 0,
        estimatedProfitImpact: est,
        estimatedCashImpact: 0,
        confidenceScore: combinedConfidence(100, Math.max(row.unitsSold, 1), 30),
        dataCoverage: 95,
        priorityInputs: {
          financialImpact: financialImpactScale(Math.max(est, lossPerUnit), 25000),
          feasibility: 95,
          urgency: 90,
          strategic: 55,
        },
        evidence: [
          `Kampanya fiyatı ${row.campaignPrice} TL < maliyet ${row.unitCost} TL`,
          `Son ${periodDays} günde ${row.unitsSold} adet satıldı (kampanyanın ürüne ait olduğundan emin değilseniz adet bağı kesin değildir)`,
        ],
        assumptions: [
          "Kampanyanın satışlara etkisinin ürüne ait olduğu varsayılır; kampanya atfı sipariş bazında yapısal değildir.",
          "Kampanya fiyatı aktifken satılan adedin tümü kampanyalı kabul edilir (üst sınır tahmini).",
        ],
        calculationMethod: "(maliyet − kampanya fiyatı) × dönem satış adedi (üst sınır tahmini).",
        recommendedAction: "Kampanya fiyatını maliyetin üzerine çekin veya kampanyayı bu ürün için sonlandırın.",
        dataPeriodStart: period.start,
        dataPeriodEnd: period.end,
        expiresInDays: 14,
      }));
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    periodDays,
    settings,
    rows,
    summary,
    dataQuality: { status, notes },
    opportunities,
  };
}

function daysAgoISO(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}
