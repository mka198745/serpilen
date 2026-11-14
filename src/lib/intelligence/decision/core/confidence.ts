/**
 * ÜÇ AYRI güven kavramı — asla tek bir keyfi yüzdeye indirgenmez:
 *  1) Data Coverage (veri kapsama %): verinin varlığı/kapsamı
 *  2) Statistical Confidence (istatistiksel güven): tahmin var ise dağılım tabanlı; yoksa null
 *  3) Decision Confidence (karar güveni): coverage + örneklem + tahmin doğruluğu bileşenlerinden türetilir
 */
export interface ConfidenceComponents {
  dataCoverage: number; // 0-100
  sampleScore: number; // 0-100 (gözlem doygunluğu)
  forecastAccuracy: number | null; // 0-100 (geçmiş tahmin isabeti; yoksa null)
  statisticalConfidence: number | null; // 0-100
  decisionConfidence: number; // 0-100
  components: Array<{ key: string; label: string; contribution: number; note: string }>;
  label: "HIGH" | "MEDIUM" | "LOW";
}

export const DECISION_ALGORITHM_VERSION = "decision@1.0.0";
export const SCENARIO_ALGORITHM_VERSION = "scenario@1.0.0";
export const MONTE_CARLO_ALGORITHM_VERSION = "montecarlo@1.0.0";
export const EARLY_WARNING_ALGORITHM_VERSION = "earlywarning@1.0.0";

/** Gözlem sayısından 0-100 doygunluk puanı (varsayılan doygunluk: 28 gözlem). */
export function sampleScore(n: number, saturationAt = 28): number {
  if (!(saturationAt > 0)) return 100;
  return Math.round(Math.min(1, Math.max(0, n / saturationAt)) * 100);
}

/**
 * Karar güveni: kapsama %55 + örneklem %30 + tahmin doğruluğu %15.
 * Tahmin doğruluğu yoksa paylar kapsama/örnekleme dağıtılır (55/30 → 65/35) ve
 * bileşen listesinde "tahmin geçmişi yok" açıkça yazılır.
 */
export function computeDecisionConfidence(input: {
  dataCoverage: number; // 0-100
  sampleN: number;
  forecastAccuracyPct?: number | null; // 0-100
  statisticalConfidence?: number | null; // 0-100
}): ConfidenceComponents {
  const coverage = clamp100(input.dataCoverage);
  const ss = sampleScore(input.sampleN);
  const fa = input.forecastAccuracyPct != null ? clamp100(input.forecastAccuracyPct) : null;

  let wCov = 0.55;
  let wSamp = 0.3;
  let wAcc = 0.15;
  if (fa == null) {
    // Tahmin isabeti yok: ağırlıkları yeniden dengele (uydurmak YOK, açıkça belirtilir)
    wCov = 0.65;
    wSamp = 0.35;
    wAcc = 0;
  }
  const raw = coverage * wCov + ss * wSamp + (fa ?? 0) * wAcc;
  const decisionConfidence = Math.round(clamp100(raw));

  const components: ConfidenceComponents["components"] = [
    { key: "data_coverage", label: "Veri kapsaması", contribution: Math.round(coverage * wCov), note: `Kapsam %${Math.round(coverage)} × ağırlık ${(wCov * 100).toFixed(0)}%` },
    { key: "sample", label: "Örneklem doygunluğu", contribution: Math.round(ss * wSamp), note: `n=${Math.max(0, Math.floor(input.sampleN))} gözlem, doygunluk %${ss}` },
  ];
  if (fa != null) {
    components.push({ key: "forecast_accuracy", label: "Tahmin isabeti geçmişi", contribution: Math.round(fa * wAcc), note: `Geçmiş MAPE tabanlı doğruluk %${Math.round(fa)}` });
  } else {
    components.push({ key: "forecast_accuracy", label: "Tahmin isabeti geçmişi", contribution: 0, note: "Tahmin geçmişi yetersiz — ağırlık kapsama/örnekleme dağıtıldı" });
  }

  // İstatistiksel güven yalnızca tahmin/dağılım varken anlamlıdır; yoksa coverage'ın alt kümesi DEĞİL, null.
  const statisticalConfidence = input.statisticalConfidence != null ? Math.round(clamp100(input.statisticalConfidence)) : null;

  const label: "HIGH" | "MEDIUM" | "LOW" = decisionConfidence >= 75 ? "HIGH" : decisionConfidence >= 45 ? "MEDIUM" : "LOW";
  return { dataCoverage: Math.round(coverage), sampleScore: ss, forecastAccuracy: fa, statisticalConfidence, decisionConfidence, components, label };
}

/** Tahmin isabetinden istatistiksel güven: MAPE'yi 0-100 doğruluğa çevirir. */
export function statisticalConfidenceFromMape(mapePct: number | null | undefined): number | null {
  if (mapePct == null || !Number.isFinite(mapePct) || mapePct < 0) return null;
  return Math.round(clamp100(Math.max(0, 100 - mapePct)));
}

export function clamp100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}
