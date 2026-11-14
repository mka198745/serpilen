/**
 * Tahmin modelleri — saf TypeScript, dış bağımlılık yok.
 * Her model `forecaster(series, horizon, period)` imzasıyla gelecek `horizon`
 * günlük nokta tahmini üretir. Giriş serisi günlük tane/ciro değerleridir.
 */
import { linearRegression, mean } from "../core/statistics";

export type ForecastModelId =
  | "SMA"
  | "WMA"
  | "SES"
  | "HOLT"
  | "HOLT_WINTERS"
  | "LINEAR_REGRESSION"
  | "SEASONAL_NAIVE"
  | "CROSTON"
  | "SBA";

export interface ForecastModel {
  id: ForecastModelId;
  label: string;
  minSamples: number;
  needsPeriod?: boolean;
  forecast: (series: number[], horizon: number, period?: number) => number[];
}

const clampNonNeg = (v: number) => (Number.isFinite(v) ? Math.max(0, v) : 0);

function smaForecast(series: number[], horizon: number): number[] {
  const window = Math.min(7, series.length);
  const slice = series.slice(-window);
  const avg = mean(slice);
  return Array.from({ length: horizon }, () => clampNonNeg(avg));
}

function wmaForecast(series: number[], horizon: number): number[] {
  const window = Math.min(7, series.length);
  const slice = series.slice(-window);
  let weightSum = 0;
  let acc = 0;
  slice.forEach((v, i) => {
    const w = i + 1; // sonraki gözleme daha fazla ağırlık
    weightSum += w;
    acc += v * w;
  });
  const avg = weightSum ? acc / weightSum : 0;
  return Array.from({ length: horizon }, () => clampNonNeg(avg));
}

function sesForecast(series: number[], horizon: number): number[] {
  const alpha = 0.3;
  let level = series[0] ?? 0;
  for (let i = 1; i < series.length; i++) {
    level = alpha * series[i] + (1 - alpha) * level;
  }
  return Array.from({ length: horizon }, () => clampNonNeg(level));
}

function holtForecast(series: number[], horizon: number): number[] {
  const alpha = 0.3;
  const beta = 0.1;
  let level = series[0] ?? 0;
  let trend = series.length > 1 ? series[1] - series[0] : 0;
  for (let i = 1; i < series.length; i++) {
    const prevLevel = level;
    level = alpha * series[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  return Array.from({ length: horizon }, (_, h) => clampNonNeg(level + (h + 1) * trend));
}

function holtWintersForecast(series: number[], horizon: number, period = 7): number[] {
  const m = period;
  if (series.length < 2 * m) return sesForecast(series, horizon);
  const alpha = 0.3;
  const beta = 0.1;
  const gamma = 0.1;
  // Başlangıç: ilk periyot ortalaması + ilk trend tahmini
  let level = mean(series.slice(0, m));
  let trend = (mean(series.slice(m, 2 * m)) - level) / m;
  const seasonal: number[] = [];
  for (let i = 0; i < m; i++) seasonal.push(series[i] - level);
  for (let i = m; i < series.length; i++) {
    const prevLevel = level;
    const sIdx = i % m;
    const obs = series[i];
    level = alpha * (obs - seasonal[sIdx]) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    seasonal[sIdx] = gamma * (obs - level) + (1 - gamma) * seasonal[sIdx];
  }
  const out: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    const sIdx = (series.length + h - 1) % m;
    out.push(clampNonNeg(level + h * trend + seasonal[sIdx]));
  }
  return out;
}

function linearRegressionForecast(series: number[], horizon: number): number[] {
  const { slope, intercept } = linearRegression(series);
  const n = series.length;
  return Array.from({ length: horizon }, (_, h) => clampNonNeg(intercept + slope * (n + h)));
}

function seasonalNaiveForecast(series: number[], horizon: number, period = 7): number[] {
  const m = Math.min(period, series.length);
  if (m < 2) return sesForecast(series, horizon);
  const lastSeason = series.slice(-m);
  return Array.from({ length: horizon }, (_, h) => clampNonNeg(lastSeason[h % m]));
}

/** Croston: aralıklı talebi talep büyüklüğü × talep aralığı olarak modeller. */
function crostonEstimate(series: number[], alpha = 0.1) {
  const nonzero: number[] = [];
  const intervals: number[] = [];
  let lastDemandIdx = -1;
  let sizeEst = 0;
  let intervalEst = 0;
  let count = 0;
  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (v > 0) {
      if (lastDemandIdx === -1) {
        sizeEst = v;
        intervalEst = i + 1;
      } else {
        const gap = i - lastDemandIdx;
        sizeEst = alpha * v + (1 - alpha) * sizeEst;
        intervalEst = alpha * gap + (1 - alpha) * intervalEst;
      }
      nonzero.push(v);
      lastDemandIdx = i;
      count++;
    }
  }
  if (count === 0) return { rate: 0, size: 0, interval: 0 };
  const rate = intervalEst > 0 ? sizeEst / intervalEst : sizeEst;
  return { rate, size: sizeEst, interval: intervalEst };
}

function crostonForecast(series: number[], horizon: number): number[] {
  const { rate } = crostonEstimate(series);
  return Array.from({ length: horizon }, () => clampNonNeg(rate));
}

/**
 * Syntetos-Boylan Approximation (Syntetos & Boylan, 2005):
 *   F = (z / p) x (1 - p / (2T))
 * z = ortalama talep büyüklüğü, p = tahmini ortalama talep aralığı (periyot),
 * T = serideki gözlem (periyot) sayısı. Düzeltme çarpanı Croston'un
 * yukarı yönlü yanlılığını (örnekleme başına ~p/2 talep-olayı önyargısı) kırar.
 */
function sbaForecast(series: number[], horizon: number): number[] {
  const { size, interval } = crostonEstimate(series);
  const T = series.length;
  if (interval <= 0 || size <= 0 || T === 0) return Array.from({ length: horizon }, () => 0);
  const correction = Math.max(0, 1 - interval / (2 * T));
  const rate = (size / interval) * correction;
  return Array.from({ length: horizon }, () => clampNonNeg(rate));
}

export const FORECAST_MODELS: ForecastModel[] = [
  { id: "SMA", label: "Basit Hareketli Ortalama", minSamples: 7, forecast: (s, h) => smaForecast(s, h) },
  { id: "WMA", label: "Ağırlıklı Hareketli Ortalama", minSamples: 7, forecast: (s, h) => wmaForecast(s, h) },
  { id: "SES", label: "Basit Üstel Düzleştirme", minSamples: 10, forecast: (s, h) => sesForecast(s, h) },
  { id: "HOLT", label: "Holt Doğrusal Trend", minSamples: 10, forecast: (s, h) => holtForecast(s, h) },
  { id: "HOLT_WINTERS", label: "Holt-Winters Mevsimsel", minSamples: 28, needsPeriod: true, forecast: (s, h, p) => holtWintersForecast(s, h, p) },
  { id: "LINEAR_REGRESSION", label: "Doğrusal Regresyon", minSamples: 7, forecast: (s, h) => linearRegressionForecast(s, h) },
  { id: "SEASONAL_NAIVE", label: "Mevsimsel Saf (Seasonal Naive)", minSamples: 14, needsPeriod: true, forecast: (s, h, p) => seasonalNaiveForecast(s, h, p) },
  { id: "CROSTON", label: "Croston (Aralıklı Talep)", minSamples: 10, forecast: (s, h) => crostonForecast(s, h) },
  { id: "SBA", label: "Syntetos-Boylan (SBA)", minSamples: 10, forecast: (s, h) => sbaForecast(s, h) },
];

export function getModel(id: ForecastModelId): ForecastModel {
  const m = FORECAST_MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`Bilinmeyen tahmin modeli: ${id}`);
  return m;
}
