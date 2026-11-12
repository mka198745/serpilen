/**
 * Anomaly Detection Engine — istatistiksel, kendi-geçmişi-referanslı.
 * Yöntemler: Modified Z (MAD), EWMA, IQR, Rolling mean/std.
 * Sabit eşik yok; her metrik kendi geçmişine göre puanlanır.
 * Minimum gözlem (varsayılan 14) sağlanamazsa LOW_DATA_CONFIDENCE üretilir.
 * Nedenler KESİN DEĞİL — yalnızca olası açıklamalar (possibleCauses).
 */
import { iqrBounds, mad, mean, median, stddev } from "../core/statistics";

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface AnomalyCandidate {
  anomalyKey: string; // metric|entityId|YYYY-MM-DD — dedup anahtarı
  metric: string;
  entityType: "STORE" | "PRODUCT";
  entityId: string;
  entityLabel: string;
  observedValue: number;
  expectedValue: number;
  deviationPct: number;
  method: "MODIFIED_Z" | "EWMA" | "IQR" | "ROLLING_STD";
  severity: Severity;
  confidence: "OK" | "LOW_DATA_CONFIDENCE";
  possibleCauses: string[];
  direction: "UP" | "DOWN";
}

const MIN_OBS = 14;

function severityFromZ(z: number): Severity {
  const a = Math.abs(z);
  if (a >= 3.5) return "CRITICAL";
  if (a >= 2.5) return "HIGH";
  if (a >= 2.0) return "MEDIUM";
  return "LOW";
}

/**
 * Tek seri üzerinde anomalileri döner. `dates` aynı uzunlukta olmalı.
 * Son gözlem ekranda gösterim için puanlanır; geçmiş tüm günler de taranır
 * (dedup ile), böylece geçmiş sapmalar da görünür.
 */
export function detectSeriesAnomalies(opts: {
  metric: string;
  entityType: "STORE" | "PRODUCT";
  entityId: string;
  entityLabel: string;
  dates: string[];
  values: number[];
  minObservations?: number;
  possibleCauses?: string[];
}): AnomalyCandidate[] {
  const { metric, entityType, entityId, entityLabel, dates, values } = opts;
  const minObs = opts.minObservations ?? MIN_OBS;
  const causes = opts.possibleCauses ?? [
    "Olağan dışı talep veya kampanya etkisi",
    "Stok yokluğu / teslimat aksaması",
    "Veri giriş hatası veya eksik kayıt",
    "Sezonsal hareket (hafta sonu / tatil)",
  ];
  const out: AnomalyCandidate[] = [];
  const n = values.length;
  if (n < minObs + 1) return out; // indeks 0'dan itibaren yeterli geçmiş gerekir


  const evaluate = (idx: number): AnomalyCandidate | null => {
    const history = values.slice(0, idx);
    if (history.length < minObs) return null;
    const x = values[idx];
    const hMean = mean(history);
    const hStd = stddev(history, true);
    const hMedian = median(history);
    const hMad = mad(history);
    const hIqr = iqrBounds(history);
    const confidence: AnomalyCandidate["confidence"] = history.length < 28 ? "LOW_DATA_CONFIDENCE" : "OK";

    // Yöntem 1: Modified Z (aykırı değerlere dayanıklı) — ana yöntem
    // Sıfır varyanslı geçmişte herhangi bir sapma kesin anomalidir.
    const mz = hMad > 0 ? (0.6745 * (x - hMedian)) / hMad : hStd > 0 ? (x - hMean) / hStd : x === hMedian ? 0 : x > hMedian ? 3 : -3;
    // Yöntem 2: Klasik z (karşılaştırma)
    const z = hStd > 0 ? (x - hMean) / hStd : 0;
    // Yöntem 3: EWMA sapması
    const alpha = 2 / (history.length + 1);
    let ewma = history[0];
    for (let i = 1; i < history.length; i++) ewma = alpha * history[i] + (1 - alpha) * ewma;
    const ewmaDev = hStd > 0 ? Math.abs(x - ewma) / hStd : 0;

    // Karar: Modified Z |z|>=2 VE (IQR dışı VEYA klasik |z|>=2 VEYA EWMA>=2)
    const absMz = Math.abs(mz);
    const outOfIqr = x < hIqr.lower || x > hIqr.upper;
    const isAnomaly = absMz >= 2 && (outOfIqr || Math.abs(z) >= 2 || ewmaDev >= 2);
    if (!isAnomaly) return null;

    const expected = hMedian;
    const deviationPct = expected !== 0 ? ((x - expected) / Math.abs(expected)) * 100 : x > 0 ? 100 : 0;
    const severity = severityFromZ(mz);
    return {
      anomalyKey: `${metric}|${entityId}|${dates[idx]}`,
      metric,
      entityType,
      entityId,
      entityLabel,
      observedValue: Number(x.toFixed(2)),
      expectedValue: Number(expected.toFixed(2)),
      deviationPct: Number(deviationPct.toFixed(1)),
      method: "MODIFIED_Z",
      severity,
      confidence,
      possibleCauses: causes,
      direction: x >= expected ? "UP" : "DOWN",
    };
  };

  // Yalnızca SON güne değil, son 14 günün her birine bak — dedup serviste
  const scanFrom = Math.max(minObs, n - 14);
  for (let i = scanFrom; i < n; i++) {
    const hit = evaluate(i);
    if (hit) out.push(hit);
  }
  return out.sort((a, b) => b.anomalyKey.split("|")[2].localeCompare(a.anomalyKey.split("|")[2]));
}

/** Örnekleme yetersizliği özetini döner (raporlama için). */
export function insufficientDataNote(seriesLength: number, minObs = MIN_OBS) {
  return seriesLength < minObs ? { sufficient: false, seriesLength, minObs } : { sufficient: true, seriesLength, minObs };
}
