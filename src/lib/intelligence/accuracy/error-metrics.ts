/**
 * Forecast Accuracy Engine — tahmin hata metrikleri (saf fonksiyonlar).
 * MAPE sıfır gerçekleşenlerde hesaplanmaz; WAPE paydası 0 ise null;
 * MASE scaled error naive MAE=0 ise null.
 */
import { mean } from "../core/statistics";

export interface ErrorMetrics {
  mae: number;
  rmse: number;
  mape: number | null; // %
  wape: number | null; // %
  mase: number | null;
  bias: number; // mean(pred - actual)
  sampleSize: number;
}

export function errorMetrics(predicted: number[], actual: number[]): ErrorMetrics {
  const n = Math.min(predicted.length, actual.length);
  const out: ErrorMetrics = { mae: 0, rmse: 0, mape: null, wape: null, mase: null, bias: 0, sampleSize: n };
  if (n === 0) return out;

  let absSum = 0;
  let sqSum = 0;
  let apeSum = 0;
  let apeCount = 0;
  let absActualSum = 0;
  let biasSum = 0;
  for (let i = 0; i < n; i++) {
    const p = predicted[i];
    const a = actual[i];
    const e = p - a;
    const ae = Math.abs(e);
    absSum += ae;
    sqSum += e * e;
    biasSum += e;
    absActualSum += Math.abs(a);
    if (a !== 0) {
      apeSum += ae / Math.abs(a);
      apeCount++;
    }
  }
  out.mae = absSum / n;
  out.rmse = Math.sqrt(sqSum / n);
  out.mape = apeCount > 0 ? (apeSum / apeCount) * 100 : null;
  out.wape = absActualSum > 0 ? (absSum / absActualSum) * 100 : null;
  out.bias = biasSum / n;

  // MASE: naive (önceki gözlem) MAE'sine göre ölçekli hata
  if (actual.length >= 2) {
    let naiveAbs = 0;
    let naiveN = 0;
    for (let i = 1; i < actual.length; i++) {
      naiveAbs += Math.abs(actual[i] - actual[i - 1]);
      naiveN++;
    }
    const naiveMae = naiveN ? naiveAbs / naiveN : 0;
    out.mase = naiveMae > 0 ? out.mae / naiveMae : null;
  }
  return out;
}

/** İki diziyi hizalayıp metriği hesaplar; uzunluklar farklıysa kırpılır. */
export function evaluatePairs(predicted: number[], actual: number[]): ErrorMetrics {
  return errorMetrics(predicted, actual);
}
