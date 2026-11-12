/**
 * Model seçici — walk-forward backtesting ile en iyi modeli seçer.
 * Küçük/aralıklı serilerde Croston/SBA, mevsimsellik varsa Holt-Winters öne çıkar;
 * yeterli veri yoksa INSUFFICIENT_DATA döner (uydurma tahmin üretmez).
 */
import { FORECAST_MODELS, type ForecastModelId } from "./models";
import { errorMetrics, type ErrorMetrics } from "../accuracy/error-metrics";
import { mean, stddev } from "../core/statistics";

export interface BacktestEntry {
  model: ForecastModelId;
  label: string;
  metrics: ErrorMetrics;
  eligible: boolean;
  skipReason?: string;
}

export interface ModelSelection {
  chosen: ForecastModelId | null;
  chosenLabel: string | null;
  chosenMetrics: ErrorMetrics | null;
  results: BacktestEntry[];
  sampleSize: number;
  zeroFraction: number;
  meanDemand: number;
  stdDemand: number;
  dataQuality: "OK" | "LOW_DATA" | "INSUFFICIENT_DATA";
  note: string;
}

const MIN_NONZERO = 4;

export function selectModel(series: number[], period = 7, minBacktest = 5): ModelSelection {
  const n = series.length;
  const zeros = series.filter((v) => v === 0).length;
  const zeroFraction = n ? zeros / n : 1;
  const meanDemand = mean(series);
  const stdDemand = stddev(series);
  const nonzeroCount = n - zeros;

  const base: ModelSelection = {
    chosen: null,
    chosenLabel: null,
    chosenMetrics: null,
    results: [],
    sampleSize: n,
    zeroFraction,
    meanDemand,
    stdDemand,
    dataQuality: "INSUFFICIENT_DATA",
    note: "Yetersiz veri: en az 4 sıfır-dışı talep günü ve 10 gözlem gerekir.",
  };

  if (n < 10 || nonzeroCount < MIN_NONZERO) return base;

  const results: BacktestEntry[] = [];
  for (const model of FORECAST_MODELS) {
    if (n < model.minSamples) {
      results.push({ model: model.id, label: model.label, metrics: emptyMetrics(), eligible: false, skipReason: `en az ${model.minSamples} gözlem gerekli` });
      continue;
    }
    if (model.needsPeriod && n < 2 * period) {
      results.push({ model: model.id, label: model.label, metrics: emptyMetrics(), eligible: false, skipReason: `mevsimsellik için en az ${2 * period} gözlem` });
      continue;
    }
    // Walk-forward: son `minBacktest` gözlemi tek tek tahmin et
    const testSize = Math.min(minBacktest, Math.floor(n / 3));
    const preds: number[] = [];
    const actuals: number[] = [];
    for (let t = n - testSize; t < n; t++) {
      const train = series.slice(0, t);
      const pred = model.forecast(train, 1, period)[0];
      preds.push(pred);
      actuals.push(series[t]);
    }
    results.push({ model: model.id, label: model.label, metrics: errorMetrics(preds, actuals), eligible: true });
  }

  const eligible = results.filter((r) => r.eligible);
  if (!eligible.length) {
    return { ...base, results, note: "Uygun model bulunamadı (veri yetersiz)." };
  }

  // Aralıklı talepte (zeroFraction yüksek) Croston/SBA'ya doğal öncelik:
  // diğer modeller de aynı test setinde yarışır; kazananı WAPE (hata paydası
  // gereği gerçek ölçeğe duyarlı) belirler, beraberlikte Croston ailesi tercih edilir.
  const rank = (r: BacktestEntry) => {
    const wape = r.metrics.wape ?? Number.POSITIVE_INFINITY;
    return wape;
  };
  eligible.sort((a, b) => {
    const d = rank(a) - rank(b);
    if (Math.abs(d) < 1e-9) {
      const intermittentA = a.model === "CROSTON" || a.model === "SBA" ? -1 : 0;
      const intermittentB = b.model === "CROSTON" || b.model === "SBA" ? -1 : 0;
      return zeroFraction > 0.5 ? intermittentA - intermittentB : 0;
    }
    return d;
  });
  const best = eligible[0];
  const quality: ModelSelection["dataQuality"] = n < 28 || zeroFraction > 0.8 ? "LOW_DATA" : "OK";

  return {
    chosen: best.model,
    chosenLabel: best.label,
    chosenMetrics: best.metrics,
    results,
    sampleSize: n,
    zeroFraction,
    meanDemand,
    stdDemand,
    dataQuality: quality,
    note:
      quality === "LOW_DATA"
        ? "Düşük veri yoğunluğu: tahmin aralıkları geniş tutun, sonuçları ihtiyatla değerlendirin."
        : "Model, geçmiş üzerinde walk-forward backtesting ile seçildi.",
  };
}

function emptyMetrics(): ErrorMetrics {
  return { mae: 0, rmse: 0, mape: null, wape: null, mase: null, bias: 0, sampleSize: 0 };
}
