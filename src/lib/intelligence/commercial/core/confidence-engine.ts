/**
 * Veri güvenilirliği & kapsama (coverage) motoru.
 * Kapsama: mevcut/değerlendirilen kriter veya gözlem oranı (0-100).
 * Örneklem: gözlem sayısının doygunluğa oranı (ör. 28 gün = örnek 1.0).
 */
export interface CoverageResult {
  coverage: number; // 0-100
  label: "HIGH" | "MEDIUM" | "LOW";
  note: string;
}

export function coverageOf(available: number, total: number): CoverageResult {
  if (total <= 0) return { coverage: 0, label: "LOW", note: "Değerlendirilecek kriter/gözlem yok." };
  const coverage = Math.round((available / total) * 100);
  const label = coverage >= 80 ? "HIGH" : coverage >= 50 ? "MEDIUM" : "LOW";
  return { coverage, label, note: `${available}/${total} veri noktası mevcut.` };
}

/** Örneklem doygunluğu 0-1 arası (n/satürasyon noktası, 1'i aşmaz). */
export function sampleSaturation(n: number, saturationAt = 28): number {
  if (saturationAt <= 0) return 1;
  return Math.min(1, Math.max(0, n / saturationAt));
}

/**
 * Birleşik güven puanı (0-100): kapsama %60 + örneklem %40 ağırlık.
 * Eksik veri yüksek etkiyle birleşirse puan düşük kalır — kasıtlı.
 */
export function combinedConfidence(coveragePct: number, sampleN: number, saturationAt = 28): number {
  const cov = Math.min(100, Math.max(0, coveragePct));
  const sat = sampleSaturation(sampleN, saturationAt) * 100;
  return Math.round(cov * 0.6 + sat * 0.4);
}

export function confidenceGrade(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 75) return "HIGH";
  if (score >= 45) return "MEDIUM";
  return "LOW";
}
