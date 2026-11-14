/**
 * Monte Carlo motoru — seed'li, deterministik, tahmin gibi SUNULMAZ.
 * - Dağılım SEÇİMİ kullanıcıya aittir; otomatik/kontrolsüz dağılım seçimi YOK.
 * - Korelasyon matrisi kullanıcıdan gelirse doğrulanır (simetri, diyagonal 1, PSD);
 *   geçersizse ÇALIŞTIRILMAZ. Verilmezse bağımsızlık varsayılır ve AÇIKÇA belirtilir.
 *   Poisson ve empirical değişkenler bağımsızlık varsayımıyla örneklenir (not edilir).
 * - Iterasyon: min/max yönetici ayarı; üst sınır performans tavanıdır.
 * - Çıktı: mean/median/stddev/min/max/P5..P95; P(zarar), hedef olasılıkları;
 *   duyarlılık (Pearson |r|), yakınsama (ilk/ikinci yarı), aşırı değer kırpma (winsorize).
 */
import { mulberry32, nextNormal } from "./prng";
import { sample, sampleFromZ, validateDistribution, type DistributionSpec } from "./distributions";
import { evaluateExpression, validateExpression } from "./expression";
import { quantile } from "../early-warning/statistics";

export interface McVariable {
  name: string;
  distribution: DistributionSpec;
  /** Gözlem sayısı (biliniyorsa) — rapora yazılır */
  observationCount?: number | null;
  /** Dağılım seçimi gerekçesi — yönetici notu */
  rationale?: string | null;
  /** Alt/üst sınırlar — örnekler kırpılır (tıraşlama değil, işaretleme) */
  nonNegative?: boolean;
}

export interface McRequest {
  name: string;
  kind: string; // PRICE | COST | DEMAND | LEAD_TIME | CAMPAIGN | PROCUREMENT | CONTRIBUTION
  variables: McVariable[];
  /** Çıkış formülü: ör. "(price - cost) * units" */
  outputFormula: string;
  iterations: number;
  seed: number;
  /** Korelasyon matrisi (variables sırasına göre, simetrik, diyagonal 1) */
  correlation?: number[][] | null;
  /** Hedef değeri + yön — olasılık hesabı için */
  target?: { value: number; direction: "ABOVE" | "BELOW" } | null;
  /** Winsorize oranı (her kuyruk), ör. 0.005 = %0.5 */
  clipFraction?: number;
  /** Deterministik çıktının "sıfır altı zarar" eşiği */
  lossThreshold?: number;
}

export interface McReliability {
  seed: number;
  iterations: number;
  effectiveIterations: number;
  nanDiscarded: number;
  clippedFraction: number;
  converged: boolean;
  convergenceRelDiff: number | null;
  correlationUsed: boolean;
  correlationDisclaimer: string | null;
  distributionNotes: string[];
  assumptions: string[];
  warnings: string[];
}

export interface McResults {
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  p5: number; p10: number; p25: number; p50: number; p75: number; p90: number; p95: number;
  probLoss: number | null;         // P(çıktı < lossThreshold)
  probTarget: number | null;       // target verildiyse hedef olasılığı
  sensitivity: Array<{ variable: string; pearson: number; absPearson: number }>;
  reliability: McReliability;
}

export const DEFAULT_MC_CLIP = 0.005;

/** Korelasyon matrisini doğrular; hataları listeler (PSD: Cholesky). */
export function validateCorrelationMatrix(matrix: number[][], names: string[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const n = matrix.length;
  if (n !== names.length) errors.push(`Korelasyon matrisi boyutu (${n}) değişken sayısıyla (${names.length}) uyuşmuyor.`);
  for (let i = 0; i < n; i++) {
    if (matrix[i].length !== n) errors.push(`Matrisin ${i + 1}. satırı ${matrix[i].length} sütun — ${n} bekleniyor.`);
  }
  if (errors.length) return { ok: false, errors };
  for (let i = 0; i < n; i++) {
    if (Math.abs(matrix[i][i] - 1) > 1e-8) errors.push(`Diyagonal [${i + 1}][${i + 1}] = ${matrix[i][i]} — tam 1 olmalı.`);
    for (let j = i + 1; j < n; j++) {
      const a = matrix[i][j];
      const b = matrix[j][i];
      if (Math.abs(a - b) > 1e-8) errors.push(`Matris simetrik değil: [${i + 1}][${j + 1}]=${a} ≠ [${j + 1}][${i + 1}]=${b}.`);
      if (Math.abs(a) > 1 + 1e-12) errors.push(`Korelasyon 1'i aşıyor: [${i + 1}][${j + 1}]=${a}.`);
      if (Math.abs(b) > 1 + 1e-12) errors.push(`Korelasyon 1'i aşıyor: [${j + 1}][${i + 1}]=${b}.`);
    }
  }
  if (errors.length) return { ok: false, errors };
  // PSD kontrolü — Cholesky
  try {
    cholesky(matrix);
  } catch {
    errors.push("Korelasyon matrisi pozitif yarı-tanımlı değil (cholesky başarısız) — korele örnekleme yapılamaz.");
  }
  return { ok: errors.length === 0, errors };
}

/** Alt-üçgensel L matrisi: A = L·Lᵀ */
export function cholesky(a: number[][]): number[][] {
  const n = a.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = a[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 0) throw new Error("Not PSD");
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

/** MC koşusunu çalıştırır (eşitleme sırası: seed → dağılımlar → formül). */
export function runMonteCarlo(req: McRequest, limits: { minIterations: number; maxIterations: number }): McResults {
  const warnings: string[] = [];
  const assumptions: string[] = [];
  const notes: string[] = [];

  // Parametre kontrolleri
  const iterations = Math.floor(req.iterations);
  if (!Number.isFinite(iterations) || iterations < limits.minIterations) {
    throw new Error(`Iterasyon en az ${limits.minIterations} olmalı.`);
  }
  if (iterations > limits.maxIterations) {
    throw new Error(`Iterasyon yönetici tavanını (${limits.maxIterations}) aşıyor.`);
  }
  if (!req.variables.length) throw new Error("En az bir değişken gerekli.");
  if (new Set(req.variables.map((v) => v.name)).size !== req.variables.length) {
    throw new Error("Değişken adları tekrar ediyor.");
  }
  for (const v of req.variables) {
    const validation = validateDistribution(v.distribution);
    if (!validation.ok) throw new Error(`"${v.name}" dağılımı geçersiz: ${validation.errors.join(" ")}`);
    if (v.nonNegative && (v.distribution.type === "normal") && v.distribution.params.mean - 3 * v.distribution.params.stddev < 0) {
      warnings.push(`"${v.name}" normal dağılımı sıfırın altına inebilir (mean − 3σ < 0) — negatif-olmayan kısıt örnek kırparak uygulanır.`);
    }
  }
  const formulaCheck = validateExpression(req.outputFormula, req.variables.map((v) => v.name));
  if (!formulaCheck.ok) throw new Error(`Formül geçersiz: ${formulaCheck.errors.join(" ")}`);

  // Korelasyon
  let correlationUsed = false;
  let correlationDisclaimer: string | null = null;
  let chol: number[][] | null = null;
  if (req.correlation && req.correlation.length) {
    const check = validateCorrelationMatrix(req.correlation, req.variables.map((v) => v.name));
    if (!check.ok) throw new Error(`Korelasyon matrisi geçersiz: ${check.errors.join(" ")}`);
    correlationUsed = true;
    chol = cholesky(req.correlation);
    const hasPoissonOrEmpirical = req.variables.some((v) => v.distribution.type === "poisson" || v.distribution.type === "empirical");
    if (hasPoissonOrEmpirical) {
      notes.push("Poisson/empirical değişkenlere korelasyon uygulanmaz; bunlar bağımsızlık varsayımıyla örneklenir.");
    }
  } else {
    correlationDisclaimer = "Korelasyon matrisi verilmedi — değişkenler BAĞIMSIZ varsayıldı (varsayım; gerçek bağımlılık yansıtılmayabilir).";
    assumptions.push(correlationDisclaimer);
  }

  // Örnekleme
  const rand = mulberry32(req.seed);
  const outputs: number[] = [];
  const perVariableSamples: number[][] = req.variables.map(() => []);
  let nanDiscarded = 0;
  const nonNegIdx = req.variables.map((v) => !!v.nonNegative);

  for (let i = 0; i < iterations; i++) {
    // Bağımsız standart normaller
    const zBase = req.variables.map(() => nextNormal(rand));
    // Korele normaller: z = L · zBase
    const zCorr = chol
      ? chol.map((row) => row.reduce((s, lij, j) => s + lij * zBase[j], 0))
      : zBase;

    const values: Record<string, number> = {};
    for (let v = 0; v < req.variables.length; v++) {
      const spec = req.variables[v].distribution;
      let x: number;
      if (chol && spec.type !== "poisson" && spec.type !== "empirical") {
        x = sampleFromZ(spec, zCorr[v], rand);
      } else {
        x = sample(spec, rand);
      }
      if (nonNegIdx[v] && x < 0) x = 0;
      values[req.variables[v].name] = x;
      perVariableSamples[v].push(x);
    }
    const out = evaluateExpression(req.outputFormula, values);
    if (!Number.isFinite(out)) { nanDiscarded++; continue; }
    outputs.push(out);
  }

  if (outputs.length < 10) {
    throw new Error(`Çıktıların neredeyse tamamı geçersiz (NaN) — formülü ve dağılım parametrelerini kontrol edin (elenen: ${nanDiscarded}/${iterations}).`);
  }

  // Aşırı değer kırpma (winsorize) — HER KUYRUKTA clipFraction
  const clip = req.clipFraction ?? DEFAULT_MC_CLIP;
  const sorted = [...outputs].sort((a, b) => a - b);
  const loIdx = Math.floor(sorted.length * clip);
  const hiIdx = Math.max(loIdx, sorted.length - 1 - Math.floor(sorted.length * clip));
  const lo = sorted[loIdx];
  const hi = sorted[hiIdx];
  const clipped = outputs.map((x) => Math.min(hi, Math.max(lo, x)));
  const retained = [...clipped].sort((a, b) => a - b);
  const clippedFraction = clip * 2;

  // İstatistikler
  const n = clipped.length;
  const meanV = clipped.reduce((s, x) => s + x, 0) / n;
  const variance = clipped.reduce((s, x) => s + (x - meanV) ** 2, 0) / (n - 1);
  const stddev = Math.sqrt(variance);
  const median = quantile(retained, 0.5);
  const q = (p: number) => quantile(retained, p);

  // Yakınsama: ilk yarı vs ikinci yarı ortalamaları (kırpılmış çıktılarda)
  const half = Math.floor(n / 2);
  const firstHalf = clipped.slice(0, half);
  const secondHalf = clipped.slice(half);
  const m1 = firstHalf.reduce((s, x) => s + x, 0) / Math.max(1, firstHalf.length);
  const m2 = secondHalf.reduce((s, x) => s + x, 0) / Math.max(1, secondHalf.length);
  const convergenceRelDiff = Math.abs(m2 - m1) / Math.max(EPS_ABS, Math.abs(m1), Math.abs(m2));
  const converged = convergenceRelDiff <= 0.01; // %1 tolerans

  // Olasılıklar
  const lossThreshold = req.lossThreshold ?? 0;
  const probLoss = n ? clipped.filter((x) => x < lossThreshold).length / n : null;
  let probTarget: number | null = null;
  if (req.target) {
    const t = req.target.value;
    probTarget = n
      ? req.target.direction === "ABOVE"
        ? clipped.filter((x) => x >= t).length / n
        : clipped.filter((x) => x <= t).length / n
      : null;
  }

  // Duyarlılık — Pearson(girdi, kırpılmış çıktı)
  const sensitivity = req.variables.map((v, vIdx) => {
    const xs = perVariableSamples[vIdx];
    const nEff = Math.min(xs.length, outputs.length);
    if (nEff < 10) return { variable: v.name, pearson: 0, absPearson: 0 };
    // NaN elenen iterasyonlarla hizalanmak için: outputs indeksleri ile karşılaştırmak yerine
    // aynı anda örneklenen değerleri kullan (NaN atma oranı düşüktür)
    const ys = outputs;
    const xsCut = xs.slice(0, ys.length);
    const r = pearson(xsCut, ys);
    return { variable: v.name, pearson: r, absPearson: Math.abs(r) };
  }).sort((a, b) => b.absPearson - a.absPearson);

  return {
    mean: meanV,
    median,
    stddev,
    min: retained[0],
    max: retained[retained.length - 1],
    p5: q(0.05), p10: q(0.1), p25: q(0.25), p50: median, p75: q(0.75), p90: q(0.9), p95: q(0.95),
    probLoss,
    probTarget,
    sensitivity,
    reliability: {
      seed: req.seed,
      iterations,
      effectiveIterations: outputs.length,
      nanDiscarded,
      clippedFraction,
      converged,
      convergenceRelDiff,
      correlationUsed,
      correlationDisclaimer,
      distributionNotes: notes,
      assumptions,
      warnings,
    },
  };
}

function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]; sy += y[i];
    sxx += x[i] * x[i]; syy += y[i] * y[i];
    sxy += x[i] * y[i];
  }
  const cov = sxy / n - (sx / n) * (sy / n);
  const vx = sxx / n - (sx / n) ** 2;
  const vy = syy / n - (sy / n) ** 2;
  if (vx <= 0 || vy <= 0) return 0;
  return cov / Math.sqrt(vx * vy);
}

const EPS_ABS = 1e-9;
