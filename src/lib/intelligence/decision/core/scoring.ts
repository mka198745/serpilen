/**
 * Karar değerlendirme — 11 kriterli ağırlıklı skorlama + cost-benefit.
 * Eksik kriterler SIFIR sayılmaz; ağırlıklar kalanlara yeniden normalize edilir.
 * En yüksek puan = otomatik "en iyi" DEĞİL — hedef uyumu ve kısıtlar ayrıca değerlendirilir.
 */
import { weightedScore } from "../../commercial/core/scoring-engine";
import type { EvaluationCriterion } from "./types";

export interface CostBenefitInput {
  expectedProfit: number | null;
  expectedCost: number | null;
  cashNeed: number | null;
}

/**
 * Basit cost-benefit: (beklenen kâr) / (1 + maliyet + nakit ihtiyacı).
 * Payda 0 ise kâr>0 için Infinity yerine null döner (tanımsız) — çağıran "tanımsız" gösterir.
 */
export function costBenefitRatio(input: CostBenefitInput): number | null {
  const profit = input.expectedProfit;
  if (profit == null) return null;
  const cost = Math.max(0, input.expectedCost ?? 0);
  const cash = Math.max(0, input.cashNeed ?? 0);
  const denom = cost + cash;
  if (denom <= 0) return null;
  return Number((profit / denom).toFixed(2));
}

/** Kriter skorlarını kullanarak alternatifi puanlar. */
export function scoreAlternative(criteria: EvaluationCriterion[]) {
  const result = weightedScore(criteria.map((c) => ({ key: c.key, weight: c.weight, score: c.score })));
  return {
    weightedScore: result.score,
    coverage: result.coverage,
    used: result.used,
    missing: result.missing,
  };
}

/**
 * Risk puanını değerlendirme kriterine çevirir: düşük risk = yüksek puan.
 * 0 risk → 100 puan; 100 risk → 0 puan. Lineer.
 */
export function riskToCriterionScore(riskScore: number | null): number | null {
  if (riskScore == null || !Number.isFinite(riskScore)) return null;
  return Math.round(100 - Math.min(100, Math.max(0, riskScore)));
}

/** Uygulama süresi (gün) → kolaylık puanı: 0g→100, 90g+→0 (lineer). */
export function implementationEaseScore(days: number | null): number | null {
  if (days == null || !Number.isFinite(days) || days < 0) return null;
  return Math.round(Math.max(0, 100 - (days / 90) * 100));
}

/** Maliyet → kriter puanı: maliyet 0 → 100; maliyet ≥ olumsuz eşik → 0. Eşik = period cirosunun %20'si (yoksa 50k taban). */
export function costToCriterionScore(cost: number | null, referenceTurnover: number | null): number | null {
  if (cost == null || !Number.isFinite(cost) || cost < 0) return null;
  const threshold = referenceTurnover != null && referenceTurnover > 0 ? referenceTurnover * 0.2 : 50000;
  if (threshold <= 0) return 50;
  return Math.round(Math.max(0, Math.min(100, 100 - (cost / threshold) * 100)));
}

/** İki alternatif eşit/yakın puanda ise belirleyici sıralama: risk düşük → cash ihtiyacı düşük → geri alınabilir. */
export function tieBreak(a: { riskScore: number | null; cashNeed: number | null }, b: { riskScore: number | null; cashNeed: number | null }): number {
  const ra = a.riskScore ?? 50;
  const rb = b.riskScore ?? 50;
  if (Math.abs(ra - rb) > 5) return ra - rb; // risk düşük olan önce
  const ca = a.cashNeed ?? 0;
  const cb = b.cashNeed ?? 0;
  return ca - cb; // nakit ihtiyacı düşük olan önce
}

/** Puan sıralaması (yoksa en sona) + tie-break. */
export function rankAlternatives<T extends { weightedScore: number | null; riskScore: number | null; cashNeed: number | null }>(alts: T[]): T[] {
  return [...alts].sort((a, b) => {
    const sa = a.weightedScore;
    const sb = b.weightedScore;
    if (sa == null && sb == null) return tieBreak(a, b);
    if (sa == null) return 1;
    if (sb == null) return -1;
    if (Math.abs(sa - sb) < 0.5) return tieBreak(a, b);
    return sb - sa;
  });
}
