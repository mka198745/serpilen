/**
 * Fırsat öncelik skorlaması (0-100). Ağırlıklar intelligence_settings'ten
 * (faz2.priority.*) okunabilir; eksikse varsayılanlar: finansal 35, uygulanabilirlik 20,
 * aciliyet 20, güvenilirlik 15, stratejik 10.
 */
export interface PriorityInputs {
  financialImpact: number; // 0-100 (modülün kendi normalizasyonu)
  feasibility: number;     // 0-100
  urgency: number;         // 0-100
  reliability: number;     // 0-100 (veri güvenilirliği — eksik veri düşürür)
  strategic: number;       // 0-100
}

export const DEFAULT_PRIORITY_WEIGHTS = { financial: 35, feasibility: 20, urgency: 20, reliability: 15, strategic: 10 };

export function priorityScore(inputs: PriorityInputs, weights = DEFAULT_PRIORITY_WEIGHTS): number {
  const total = weights.financial + weights.feasibility + weights.urgency + weights.reliability + weights.strategic;
  const w = total > 0 ? weights : DEFAULT_PRIORITY_WEIGHTS;
  const t = w.financial + w.feasibility + w.urgency + w.reliability + w.strategic;
  const norm = (v: number) => Math.min(100, Math.max(0, v));
  const acc =
    norm(inputs.financialImpact) * w.financial +
    norm(inputs.feasibility) * w.feasibility +
    norm(inputs.urgency) * w.urgency +
    norm(inputs.reliability) * w.reliability +
    norm(inputs.strategic) * w.strategic;
  return Number((acc / t).toFixed(1));
}

/** Finansal etkiyi 0-100'e normalize eder (log ölçek — büyük etkiler doygunlaşır). */
export function financialImpactScale(profitImpactTry: number, fullAt = 50000): number {
  const v = Math.abs(profitImpactTry);
  if (v <= 0) return 0;
  return Math.round(Math.min(100, (Math.log10(v + 1) / Math.log10(fullAt + 1)) * 100));
}

export function severityFromPriority(score: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (score >= 85) return "CRITICAL";
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}
