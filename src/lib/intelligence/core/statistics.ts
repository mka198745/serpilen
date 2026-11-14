/**
 * Commerce Intelligence Engine — ortak istatistik çekirdeği.
 * Saf fonksiyonlar: veritabanı/IO bağımlılığı YOK. Tüm fonksiyonlar sayısal
 * diziler üzerinde çalışır ve NaN üretmemeye özen gösterir (girdi yetersizse
 * null/NaN yerine güvenli varsayılanlar döner).
 */

export function sum(values: number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return sum(values) / values.length;
}

export function variance(values: number[], sample = false): number {
  const n = values.length;
  if (n < 2) return 0;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) * (v - m);
  return acc / (sample ? n - 1 : n);
}

export function stddev(values: number[], sample = false): number {
  return Math.sqrt(variance(values, sample));
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Lineer interpolasyonlu quantile (p in [0,1]). */
export function quantile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * clamp(p, 0, 1);
  const base = Math.floor(pos);
  const rest = pos - base;
  if (s[base + 1] !== undefined) return s[base] + rest * (s[base + 1] - s[base]);
  return s[base];
}

export function min(values: number[]): number {
  if (!values.length) return 0;
  let m = values[0];
  for (const v of values) if (v < m) m = v;
  return m;
}

export function max(values: number[]): number {
  if (!values.length) return 0;
  let m = values[0];
  for (const v of values) if (v > m) m = v;
  return m;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Değişim katsayısı = std / |mean|. Ortalama 0 ise null (tanımlı değil). */
export function coefficientOfVariation(values: number[]): number | null {
  const m = mean(values);
  if (m === 0) return null;
  return stddev(values) / Math.abs(m);
}

/** Baseline z-score: (x - mean) / std. std=0 ise 0. */
export function zScore(x: number, seriesMean: number, seriesStd: number): number {
  if (seriesStd === 0) return 0;
  return (x - seriesMean) / seriesStd;
}

/** Modified z-score: 0.6745 × (x − median) / MAD. Aykırı değerlere dayanıklı. */
export function modifiedZScore(x: number, med: number, mad: number): number {
  if (mad === 0) return 0;
  return (0.6745 * (x - med)) / mad;
}

/** Median Absolute Deviation. */
export function mad(values: number[]): number {
  const med = median(values);
  return median(values.map((v) => Math.abs(v - med)));
}

export interface IqrBounds {
  q1: number;
  q3: number;
  iqr: number;
  lower: number;
  upper: number;
}

export function iqrBounds(values: number[], multiplier = 1.5): IqrBounds {
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  const iqr = q3 - q1;
  return { q1, q3, iqr, lower: q1 - multiplier * iqr, upper: q3 + multiplier * iqr };
}

/** Üstel ağırlıklı hareketli ortalama serisi. */
export function ewmaSeries(values: number[], alpha: number): number[] {
  if (!values.length) return [];
  const out: number[] = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = alpha * values[i] + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}

/** CUSUM (iki taraflı): kümülatif sapma serisi; kayma tespiti için. */
export function cusumSeries(values: number[], target?: number, drift = 0): { pos: number[]; neg: number[] } {
  const t = target ?? mean(values);
  const pos: number[] = [];
  const neg: number[] = [];
  let cp = 0;
  let cn = 0;
  for (const v of values) {
    cp = Math.max(0, cp + (v - t) - drift);
    cn = Math.max(0, cn - (v - t) - drift);
    pos.push(cp);
    neg.push(cn);
  }
  return { pos, neg };
}

export interface LinearRegressionResult {
  slope: number;
  intercept: number;
  r2: number;
  residualStd: number;
}

export function linearRegression(values: number[]): LinearRegressionResult {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, r2: 0, residualStd: 0 };
  const xs = values.map((_, i) => i);
  const sumX = sum(xs);
  const sumY = sum(values);
  const sumXY = xs.reduce((s, x, i) => s + x * values[i], 0);
  const sumX2 = xs.reduce((s, x) => s + x * x, 0);
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const fitted = xs.map((x) => slope * x + intercept);
  const residuals = values.map((y, i) => y - fitted[i]);
  const residualStd = Math.sqrt(variance(residuals, true));
  const sstot = variance(values, false) * n;
  const ssres = residuals.reduce((s, r) => s + r * r, 0);
  const r2 = sstot === 0 ? 0 : clamp(1 - ssres / sstot, -1, 1);
  return { slope, intercept, r2, residualStd };
}

/** Deterministik sıralama (eşit değerlerde id ile) ile quantile tabanlı skor 1-5. */
export function quantileScore(value: number, sortedAsc: number[], invert = false): number {
  const n = sortedAsc.length;
  if (n === 0) return 3;
  // value'nun konumunu bul (deterministik)
  let idx = 0;
  while (idx < n && sortedAsc[idx] < value) idx++; // eleman sayısı < value
  // invert (recency gibi küçük=iyi): value'dan BÜYÜK eleman sayısı rank'tir
  let rank: number;
  if (invert) {
    let upper = idx;
    while (upper < n && sortedAsc[upper] <= value) upper++;
    rank = n - upper; // value'dan büyük eleman sayısı
  } else {
    rank = idx; // value'dan küçük eleman sayısı
  }
  const q = (rank + 1) / (n + 1);
  if (q <= 0.2) return 1;
  if (q <= 0.4) return 2;
  if (q <= 0.6) return 3;
  if (q <= 0.8) return 4;
  return 5;
}
