/**
 * FAZ 3 — Merkezi Karar Değerlendirme Motoru
 * Alternatif üretir → 11 kriterle puanlar → kısıtlar/hedeflerle sıralar → öneri + explanation.
 * En yüksek puan = otomatik kazanan DEĞİLDİR; nakit/risk/hedef kısıtları uygulanır.
 */
import { generateAlternatives, type BaselineInput } from "./alternatives";
import { computeDecisionConfidence, clamp100, DECISION_ALGORITHM_VERSION, type ConfidenceComponents } from "./confidence";
import { costBenefitRatio, rankAlternatives, riskToCriterionScore, implementationEaseScore, costToCriterionScore, scoreAlternative } from "./scoring";
import { buildExplanation } from "./explanation";
import { criterionWeights, CRITERION_LABELS } from "./settings";
import { compareFinancials, type AlternativeFinancials } from "./financial";
import type {
  AlternativeKind,
  DecisionContext,
  DecisionRecommendation,
  EvaluationCriterion,
  ScoredAlternative,
} from "./types";

export interface DecisionEngineInput {
  context: DecisionContext;
  baseline: BaselineInput;
  settings: Record<string, string>; // faz3 merged ayarlar
  /** Aktif hedef uyumu (−100..+100); yoksa null → strategic_fit nötr */
  goalAlignment?: number | null;
  /** Geçmiş tahmin isabeti (0-100); yoksa null */
  forecastAccuracyPct?: number | null;
  statisticalConfidence?: number | null;
  /** Gözlem sayısı (örneklem doyg. için) */
  sampleN: number;
  /** Veri kapsama % (dışarıdan — kaç kaynağın veri verdiği) */
  dataCoverage: number;
  /** Kısıtlar: nakit tavanı / risk tavanı (yönetici bağlamı) */
  constraints?: { maxCashNeed?: number | null; maxRiskScore?: number | null } | null;
  /** Çağıranın ürettiği özel alternatifler (CUSTOM) — şablonlarla birleştirilir */
  customAlternatives?: Array<Omit<ScoredAlternative, "criteria" | "weightedScore" | "coverage" | "costBenefitRatio" | "goalAlignment" | "rank">>;
  title?: string;
  trigger?: string | null;
  opportunityKey?: string | null;
}

const EPS = 1e-9;

function minmaxScore(value: number | null, min: number | null, max: number | null, invert = false): number | null {
  if (value == null || min == null || max == null) return null;
  const span = max - min;
  if (Math.abs(span) < EPS) return 50; // hepsi eşit → nötr
  let s = ((value - min) / span) * 100;
  if (invert) s = 100 - s;
  return Math.round(clamp100(s));
}

/** Tek alternatifi 11 kriterle puanlar (kategori-bağlamlı, deterministik). */
export function buildCriteria(opts: {
  alt: { expectedProfit: number | null; expectedCost: number | null; cashNeed: number | null; riskScore: number | null; implementationDays: number | null; kind: AlternativeKind };
  profitRange: [number | null, number | null];
  revenueRange: [number | null, number | null];
  expectedRevenue: number | null;
  revenue: number | null;
  costRange: [number | null, number | null];
  cashRange: [number | null, number | null];
  weights: Record<string, number>;
  decisionConfidence: number;
  goalAlignment: number | null;
  decisionType: string;
  referenceTurnover: number | null;
}): EvaluationCriterion[] {
  const { alt, profitRange, revenueRange, expectedRevenue, revenue, costRange, cashRange, weights, decisionConfidence, goalAlignment, decisionType, referenceTurnover } = opts;
  const strategicFit = goalAlignment != null ? Math.round((goalAlignment + 100) / 2) : 50;
  const customerImpact = (decisionType === "CUSTOMER" || decisionType === "CAMPAIGN" || decisionType === "MARKETING")
    ? (alt.kind === "CURRENT_STATE" ? 55 : alt.kind === "CONSERVATIVE" ? 65 : alt.kind === "BALANCED" ? 72 : 58)
    : 50;
  const feasibility = (() => {
    const d = alt.implementationDays;
    if (d == null) return null;
    if (d <= 3) return 82;
    if (d <= 14) return 66;
    if (d <= 30) return 50;
    return 34;
  })();
  const reversibility = ({ CURRENT_STATE: 100, CONSERVATIVE: 82, BALANCED: 62, AGGRESSIVE: 40, CUSTOM: 55 } as Record<AlternativeKind, number>)[alt.kind];

  const mk = (key: string, score: number | null, note?: string): EvaluationCriterion => ({
    key,
    label: CRITERION_LABELS[key as keyof typeof CRITERION_LABELS] ?? key,
    weight: weights[key] ?? 0,
    score,
    note,
  });

  return [
    mk("expected_profit", minmaxScore(alt.expectedProfit, profitRange[0], profitRange[1])),
    mk("expected_revenue", minmaxScore(revenue, revenueRange[0], revenueRange[1])),
    mk("cash_impact", minmaxScore(alt.cashNeed, cashRange[0], cashRange[1], true)),
    mk("risk", riskToCriterionScore(alt.riskScore)),
    mk("implementation_ease", implementationEaseScore(alt.implementationDays)),
    mk("data_confidence", decisionConfidence, "Karar güveni tüm alternatiflere aynı uygulanır"),
    mk("strategic_fit", strategicFit, goalAlignment != null ? `Hedef uyumu ${goalAlignment >= 0 ? "+" : ""}${Math.round(goalAlignment)}` : "Hedef verisi yok — nötr 50"),
    mk("customer_impact", customerImpact, decisionType === "CUSTOMER" || decisionType === "CAMPAIGN" || decisionType === "MARKETING" ? "Müşteri/ciro ilişkisi varsayılan bant (nedensel kanıt sınırlı)" : "Doğrudan müşteri etkisi ölçülemedi — nötr 50"),
    mk("operational_feasibility", feasibility),
    mk("reversibility", reversibility, "Alternatif türüne göre varsayılan geri alınabilirlik"),
    mk("cost", costToCriterionScore(alt.expectedCost, referenceTurnover)),
  ];
}

/** Ana giriş: alternatif üret + puan + kısıtla + öneri döndür (persist edilmez). */
export function evaluateDecision(input: DecisionEngineInput): DecisionRecommendation {
  const { context, baseline, settings } = input;
  const weights = criterionWeights(settings);
  const decisionType = context.decisionType;

  // 1) Güven bileşenleri
  const conf = computeDecisionConfidence({
    dataCoverage: input.dataCoverage,
    sampleN: input.sampleN,
    forecastAccuracyPct: input.forecastAccuracyPct ?? null,
    statisticalConfidence: input.statisticalConfidence ?? null,
  });

  // 2) Alternatifler (şablon + varsa CUSTOM)
  const settingsNums: Record<string, number> = {};
  for (const k of Object.keys(settings)) {
    const v = Number(settings[k]);
    if (Number.isFinite(v)) settingsNums[k] = v;
  }
  const generated = generateAlternatives(decisionType, baseline, settingsNums);
  const altDrafts = [...generated, ...(input.customAlternatives ?? [])];

  // 3) Aralıklar (min-max normalize için)
  const profitVals = altDrafts.map((a) => a.expectedProfit).filter((v): v is number => v != null);
  const revenueVals = altDrafts.map((a) => a.expectedRevenue).filter((v): v is number => v != null);
  const costVals = altDrafts.map((a) => a.expectedCost).filter((v): v is number => v != null);
  const cashVals = altDrafts.map((a) => a.cashNeed).filter((v): v is number => v != null);
  const range = (vals: number[]): [number | null, number | null] =>
    vals.length ? [Math.min(...vals), Math.max(...vals)] : [null, null];
  const profitRange = range(profitVals);
  const revenueRange = range(revenueVals);
  const costRange = range(costVals);
  const cashRange = range(cashVals);
  const referenceTurnover = n0f(baseline.revenuePerDay) != null ? (baseline.revenuePerDay as number) * baseline.periodDays : null;

  // 4) Kriterleri kur + puanla
  const currentAlt = altDrafts.find((a) => a.kind === "CURRENT_STATE") ?? altDrafts[0];
  const scored: ScoredAlternative[] = altDrafts.map((alt) => {
    const criteria = buildCriteria({
      alt,
      profitRange,
      revenueRange,
      expectedRevenue: alt.expectedRevenue,
      revenue: alt.expectedRevenue,
      costRange,
      cashRange,
      weights,
      decisionConfidence: conf.decisionConfidence,
      goalAlignment: input.goalAlignment ?? null,
      decisionType,
      referenceTurnover,
    });
    const s = scoreAlternative(criteria);
    return {
      ...alt,
      criteria,
      weightedScore: s.weightedScore,
      coverage: s.coverage,
      costBenefitRatio: costBenefitRatio({ expectedProfit: alt.expectedProfit, expectedCost: alt.expectedCost, cashNeed: alt.cashNeed }),
      goalAlignment: input.goalAlignment ?? null,
      rank: 0,
    };
  });

  // 5) Sırala + kısıtları uygula (nakit/risk tavanı)
  const ranked = rankAlternatives(scored.map((s) => ({ weightedScore: s.weightedScore, riskScore: s.riskScore, cashNeed: s.cashNeed, ref: s }))).map((r) => r.ref);
  const maxCash = input.constraints?.maxCashNeed ?? null;
  const maxRisk = input.constraints?.maxRiskScore ?? null;
  const pickBest = (): ScoredAlternative | null => {
    for (const alt of ranked) {
      if (alt.weightedScore == null) continue;
      if (maxCash != null && alt.cashNeed != null && alt.cashNeed > maxCash) continue; // nakit tavanı
      if (maxRisk != null && alt.riskScore != null && alt.riskScore > maxRisk) continue; // risk tavanı
      if (input.goalAlignment != null && input.goalAlignment < -30 && alt.kind !== "CURRENT_STATE" && (alt.goalAlignment ?? 0) < -30) continue; // hedefe zıt
      return alt;
    }
    return null;
  };
  const best = pickBest();
  const runnerUp = ranked.find((a) => a !== best) ?? null;
  ranked.forEach((a, i) => { a.rank = i + 1; });

  // 6) Beklenen etki (en iyi alternatife göre delta'lar)
  const curFin: AlternativeFinancials = { expectedRevenue: currentAlt.expectedRevenue, expectedProfit: currentAlt.expectedProfit, expectedCost: currentAlt.expectedCost, cashNeed: currentAlt.cashNeed };
  const bestFin: AlternativeFinancials = best ? { expectedRevenue: best.expectedRevenue, expectedProfit: best.expectedProfit, expectedCost: best.expectedCost, cashNeed: best.cashNeed } : curFin;
  const delta = compareFinancials(curFin, bestFin, baseline.periodDays);

  // 7) Metinler
  const risks: string[] = [];
  if (best?.riskScore != null && best.riskScore >= 60) risks.push(`Seçilen alternatifin risk puanı yüksek (${Math.round(best.riskScore)}/100) — kademeli uygulama önerilir.`);
  if (conf.decisionConfidence < 45) risks.push("Karar güveni düşük (<%45) — ek veri olmadan kesin aksiyon önerilmez.");
  if (best?.assumptions.length) risks.push(...best.assumptions.slice(0, 2).map((a) => `Varsayım: ${a}`));
  if (profitRange[0] != null && profitRange[1] != null && Math.abs((profitRange[1] as number) - (profitRange[0] as number)) < EPS) {
    risks.push("Alternatifler kâr açısından ayırt edilemedi (veri sınırlı).");
  }

  const assumptionsBase = [
    `Analiz dönemi: son ${baseline.periodDays} gün gerçek verisi.`,
    "Kaynak ticari kayıtlar DEĞİŞTİRİLMEZ; yalnızca öneri ve kayıt üretilir.",
    "Talep esnekliği verisi yokluğunda sabit talep varsayılır (etiketli).",
  ];
  const assumptions = [...new Set([...(best?.assumptions ?? []), ...assumptionsBase])];
  const evidence = [...new Set(altDrafts.flatMap((a) => a.evidence))];

  const decisionKey = makeDecisionKey(context, input.trigger ?? null);
  const title = input.title ?? defaultTitle(decisionType, best);
  const summary = best
    ? `${best.label} — ağırlıklı puan ${best.weightedScore ?? "n/a"}/100, beklenen kâr etkisi ${delta.profitDelta != null ? formatSignedTl(delta.profitDelta) : "bilinmiyor"}.`
    : "Karar alternatifleri veri yetersizliği/kısıt nedeniyle sıralanamadı.";
  const rationale = buildRationale(best, runnerUp, conf, delta, maxCash, maxRisk);

  const expectedImpact = { revenue: delta.revenueDelta, profit: delta.profitDelta, cash: delta.cashDelta };
  const base: Omit<DecisionRecommendation, "explanation"> = {
    decisionKey,
    context,
    title,
    summary,
    alternatives: ranked,
    bestAlternativeKind: best?.kind ?? null,
    runnerUpKind: runnerUp?.kind ?? null,
    currentStateKind: "CURRENT_STATE",
    rationale,
    expectedImpact,
    risks,
    assumptions,
    evidence,
    dataCoverage: conf.dataCoverage,
    statisticalConfidence: conf.statisticalConfidence,
    decisionConfidence: conf.decisionConfidence,
    confidenceComponents: conf.components,
    methodNote: "Weighted Scoring (11 kriter, yönetici ağırlıkları) + Cost-Benefit; AHP/TOPSIS bu sürümde yoktur.",
    opportunityKey: input.opportunityKey ?? null,
    algorithmVersion: DECISION_ALGORITHM_VERSION,
  };
  return {
    ...base,
    explanation: buildExplanation(base),
  };
}

function n0f(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null;
}

export function makeDecisionKey(context: DecisionContext, trigger: string | null): string {
  const parts = [
    "dec",
    context.decisionType,
    context.relatedProductId != null ? `p${context.relatedProductId}` : "p-",
    context.relatedCategoryId != null ? `c${context.relatedCategoryId}` : "c-",
    context.relatedSupplierId != null ? `s${context.relatedSupplierId}` : "s-",
    context.relatedCampaignId != null ? `k${context.relatedCampaignId}` : "k-",
    context.analysisPeriodStart ?? "-",
    context.analysisPeriodEnd ?? "-",
    trigger ?? "manual",
  ];
  return parts.join(":");
}

function defaultTitle(decisionType: string, best: ScoredAlternative | null): string {
  switch (decisionType) {
    case "PRICING": return "Fiyatlandırma kararı";
    case "INVENTORY": return "Stok politikası kararı";
    case "PROCUREMENT": return "Satın alma kararı";
    case "SUPPLIER": return "Tedarikçi kararı";
    case "CAMPAIGN": return "Kampanya kararı";
    case "MARKETING": return "Reklam bütçesi kararı";
    case "FINANCIAL": return "Finansal tahsis kararı";
    case "QUALITY": return "Kalite aksiyonu";
    case "CUSTOMER": return "Müşteri aksiyonu";
    case "ASSORTMENT": return "Ürün gamı kararı";
    case "CASH_FLOW": return "Nakit akışı kararı";
    case "RETURNS": return "İade azaltım kararı";
    case "FORECAST": return "Tahmin tabanlı plan kararı";
    default: return best ? `${best.label}` : "Operasyonel karar";
  }
}

function buildRationale(
  best: ScoredAlternative | null,
  runnerUp: ScoredAlternative | null,
  conf: ConfidenceComponents,
  delta: ReturnType<typeof compareFinancials>,
  maxCash: number | null,
  maxRisk: number | null,
): string {
  if (!best) return "Alternatifler nakit/risk/hedef kısıtlarını geçemedi veya puanlama için yeterli veri yok. Yönetici yeniden değerlendirmeli ya da ek veri sağlamalı.";
  const bits: string[] = [];
  bits.push(`En yüksek puanı kısıtlar altında geçen alternatif: "${best.label}" (puan ${best.weightedScore ?? "n/a"}, kapsam %${Math.round(best.coverage)}).`);
  bits.push(`Mevcut duruma göre kâr etkisi ${delta.profitDelta != null ? formatSignedTl(delta.profitDelta) : "bilinmiyor"}; ciro etkisi ${delta.revenueDelta != null ? formatSignedTl(delta.revenueDelta) : "bilinmiyor"}.`);
  if (runnerUp) bits.push(`İkinci seçenek: "${runnerUp.label}" (puan ${runnerUp.weightedScore ?? "n/a"}).`);
  bits.push(`Karar güveni %${Math.round(conf.decisionConfidence)} (${conf.label}); veri kapsama %${Math.round(conf.dataCoverage)}.`);
  if (maxCash != null) bits.push(`Nakit tavanı kısıtı: ${maxCash.toLocaleString("tr-TR")} TL.`);
  if (maxRisk != null) bits.push(`Risk tavanı kısıtı: ${maxRisk}/100.`);
  bits.push("En yüksek puan tek başına kazanan değildir; hedefler/kısıtlar/risk toleransı uygulanmıştır.");
  return bits.join(" ");
}

function formatSignedTl(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL`;
}
