/**
 * Erken uyarı risk puanı: olasılık %30 + etki %30 + aciliyet %20 + maruziyet %10 + veri güvenilirliği %10
 * Ağırlıklar yönetici tarafından değiştirilebilir (faz3.risk.weight_*).
 * Yüksek risk puanı ≠ yüksek güven. Veri güveni düşükse skor tavanlanır ve
 * severity HIGH/CRITICAL'e yükseltilmez.
 */
export type EarlyWarningSeverity = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface RiskScoreInput {
  probability: number;   // 0-100
  impact: number;        // 0-100
  urgency: number;       // 0-100
  exposure: number;      // 0-100
  dataReliability: number; // 0-100
  weights?: { probability: number; impact: number; urgency: number; exposure: number; reliability: number };
  /** Veri güveni kritik eşiğin altındaysa yüksek severity basılmaz */
  minConfidenceForHigh?: number; // varsayılan 60
}

export const DEFAULT_RISK_WEIGHTS = { probability: 30, impact: 30, urgency: 20, exposure: 10, reliability: 10 };

export function computeRiskScore(input: RiskScoreInput): { score: number; severity: EarlyWarningSeverity; capped: boolean } {
  const w = input.weights ?? DEFAULT_RISK_WEIGHTS;
  const total = Math.max(1, w.probability + w.impact + w.urgency + w.exposure + w.reliability);
  const raw =
    (clamp(input.probability) * w.probability +
      clamp(input.impact) * w.impact +
      clamp(input.urgency) * w.urgency +
      clamp(input.exposure) * w.exposure +
      clamp(input.dataReliability) * w.reliability) / total;
  let score = Math.round(raw);
  const minHigh = input.minConfidenceForHigh ?? 60;
  let capped = false;
  if (input.dataReliability < minHigh && score > 49) {
    score = 49; // MODERATE tavanı — veri yetersizken "kritik" basılmaz
    capped = true;
  }
  return { score, severity: severityOf(score), capped };
}

export function severityOf(score: number): EarlyWarningSeverity {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MODERATE";
  return "LOW";
}

export const SEVERITY_LABELS: Record<EarlyWarningSeverity, string> = {
  LOW: "Düşük",
  MODERATE: "Orta",
  HIGH: "Yüksek",
  CRITICAL: "Kritik",
};

const clamp = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
