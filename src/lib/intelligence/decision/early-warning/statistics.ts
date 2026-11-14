/**
 * Erken uyarı istatistik araçları — saf fonksiyonlar.
 * Tek yöntem her şeye uygulanmaz; her alarm türü kendi yöntemini seçer.
 */
export function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
export function stddev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}
/** Son n değerin ortalaması vs önceki m değerin ortalaması → sapma % (negatif = düşüş). */
export function recentVsBaselinePct(series: number[], recentN: number, baselineN: number): { recentMean: number | null; baselineMean: number | null; changePct: number | null } {
  const recent = series.slice(-recentN);
  const baseline = series.slice(-(recentN + baselineN), -recentN);
  const r = mean(recent);
  const b = mean(baseline);
  if (r == null || b == null || Math.abs(b) < 1e-9) return { recentMean: r, baselineMean: b, changePct: null };
  return { recentMean: r, baselineMean: b, changePct: ((r - b) / Math.abs(b)) * 100 };
}
/** Basit z-score (normal dağılım varsayar; ağır kuyrukta modified z tercih edilir). */
export function zScore(latest: number, history: number[]): number | null {
  const m = mean(history);
  const sd = stddev(history);
  if (m == null || sd == null || sd < 1e-9) return null;
  return (latest - m) / sd;
}
/** Modified Z (medyan + MAD) — aykırı değerlere dayanıklı. */
export function modifiedZScore(latest: number, history: number[]): number | null {
  if (history.length < 3) return null;
  const sorted = [...history].sort((a, b) => a - b);
  const med = median(sorted);
  const mad = median(sorted.map((x) => Math.abs(x - med)));
  if (mad < 1e-9) return null;
  return (0.6745 * (latest - med)) / mad;
}
/** IQR sınırı: Q1-1.5*IQR .. Q3+1.5*IQR dışı = aykırı. */
export function iqrBounds(history: number[]): { q1: number; q3: number; lower: number; upper: number } | null {
  if (history.length < 4) return null;
  const s = [...history].sort((a, b) => a - b);
  const q1 = quantile(s, 0.25);
  const q3 = quantile(s, 0.75);
  const iqr = q3 - q1;
  return { q1, q3, lower: q1 - 1.5 * iqr, upper: q3 + 1.5 * iqr };
}
/** EWMA: α ile üstel düzeltilmiş ortalama; ani değişimde z-benzeri sapma döner. */
export function ewmaDeviation(series: number[], alpha = 0.3): { ewma: number | null; deviation: number | null } {
  if (!series.length) return { ewma: null, deviation: null };
  let e = series[0];
  for (let i = 1; i < series.length; i++) e = alpha * series[i] + (1 - alpha) * e;
  const sd = stddev(series);
  if (sd == null || sd < 1e-9) return { ewma: e, deviation: null };
  return { ewma: e, deviation: (series[series.length - 1] - e) / sd };
}
/** CUSUM: kümülatif toplam sapması — kayıcı (drift) tespit eder. */
export function cusumDrift(series: number[], target?: number): { pos: number; neg: number } | null {
  if (series.length < 2) return null;
  const t = target ?? mean(series)!;
  let pos = 0;
  let neg = 0;
  for (const x of series) {
    pos = Math.max(0, pos + (x - t));
    neg = Math.min(0, neg + (x - t));
  }
  return { pos, neg };
}
/** Basit lineer regresyon eğimi (x=0..n-1) — birim/gün değişim. */
export function linearTrendSlope(values: number[]): number | null {
  const n = values.length;
  if (n < 3) return null;
  const xs = values.map((_, i) => i);
  const mx = mean(xs)!;
  const my = mean(values)!;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (values[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (Math.abs(den) < 1e-9) return null;
  return num / den;
}
/** Trendin yüzde sapması: eğim × pencere / ortalama |level|. */
export function trendDeviationPct(values: number[]): number | null {
  const slope = linearTrendSlope(values);
  const m = mean(values);
  if (slope == null || m == null || Math.abs(m) < 1e-9) return null;
  return (slope * values.length) / Math.abs(m) * 100;
}
export function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] != null) return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  return sorted[base];
}
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
/** Basit geçmiş üzerinde point-forecast sapma %: (gerçek − tahmin)/tahmin. */
export function forecastDeviationPct(actual: number, predicted: number): number | null {
  if (Math.abs(predicted) < 1e-9) return null;
  return ((actual - predicted) / Math.abs(predicted)) * 100;
}
