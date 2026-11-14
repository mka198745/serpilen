/**
 * MC dağırımları — kullanıcının AÇIKÇA SEÇTİĞİ dağılım; otomatik seçim YOK.
 * Parametreler geçersizse hata; sessiz düzeltme YOK.
 */
import { nextNormal, normalCdf, type Prng } from "./prng";

export const DISTRIBUTION_TYPES = ["normal", "lognormal", "uniform", "triangular", "poisson", "empirical"] as const;
export type DistributionType = (typeof DISTRIBUTION_TYPES)[number];

export interface DistributionSpec {
  type: DistributionType;
  params: Record<string, number>;
  /**ampirik dizisi — yalnız empirical */
  samples?: number[];
}

export interface DistributionValidation {
  ok: boolean;
  errors: string[];
}

export function validateDistribution(spec: DistributionSpec): DistributionValidation {
  const e: string[] = [];
  const p = spec.params ?? {};
  switch (spec.type) {
    case "normal":
      if (!(p.mean != null && Number.isFinite(p.mean))) e.push("normal.mean zorunludur.");
      if (!(p.stddev != null && p.stddev > 0)) e.push("normal.stddev > 0 olmalı.");
      break;
    case "lognormal":
      if (p.mu == null || !Number.isFinite(p.mu)) e.push("lognormal.mu (alttaki normal ortalama) zorunludur.");
      if (!(p.sigma != null && p.sigma > 0)) e.push("lognormal.sigma > 0 olmalı.");
      break;
    case "uniform":
      if (p.min == null || p.max == null || !(p.min < p.max)) e.push("uniform.min < uniform.max olmalı.");
      break;
    case "triangular":
      if (p.min == null || p.mode == null || p.max == null) e.push("triangular.min/mode/max zorunlu.");
      else if (!(p.min <= p.mode && p.mode <= p.max && p.min < p.max)) e.push("triangular: min ≤ mode ≤ max ve min < max olmalı.");
      break;
    case "poisson":
      if (!(p.lambda != null && p.lambda > 0)) e.push("poisson.lambda > 0 olmalı.");
      break;
    case "empirical": {
      const s = spec.samples ?? [];
      if (s.length < 5) e.push("empirical dağılım en az 5 gözlem gerektirir.");
      break;
    }
    default:
      e.push(`Bilinmeyen dağılım: ${(spec as DistributionSpec).type}`);
  }
  return { ok: e.length === 0, errors: e };
}

/** Tek örnek — deterministik sırayla tüketilir. */
export function sample(spec: DistributionSpec, rand: Prng): number {
  const p = spec.params;
  switch (spec.type) {
    case "normal":
      return p.mean + p.stddev * nextNormal(rand);
    case "lognormal":
      return Math.exp(p.mu + p.sigma * nextNormal(rand));
    case "uniform":
      return p.min + rand() * (p.max - p.min);
    case "triangular": {
      const u = rand();
      const f = (p.mode - p.min) / (p.max - p.min);
      if (u < f) return p.min + Math.sqrt(u * (p.max - p.min) * (p.mode - p.min));
      return p.max - Math.sqrt((1 - u) * (p.max - p.min) * (p.max - p.mode));
    }
    case "poisson": {
      // Knuth's multiplicative gerçekleme — küçük/orta λ için
      const L = Math.exp(-p.lambda);
      let k = 0;
      let prod = 1;
      do { k++; prod *= rand(); } while (prod > L);
      return k - 1;
    }
    case "empirical": {
      const s = [...(spec.samples ?? [])].sort((a, b) => a - b);
      if (!s.length) return NaN;
      // Ters CDF (yaklaşık, eşit kütle)
      const idx = Math.min(s.length - 1, Math.floor(rand() * s.length));
      return s[idx];
    }
  }
}

/** Korelasyon desteği: Gaussian copula — z (standart normal) → u ∈ (0,1) → dağılımın ters CDF'i. */
export function sampleFromZ(spec: DistributionSpec, z: number, rand: Prng): number {
  const p = spec.params;
  switch (spec.type) {
    case "normal":
      return p.mean + p.stddev * z;
    case "lognormal":
      return Math.exp(p.mu + p.sigma * z);
    case "uniform": {
      const u = clamp01(normalCdf(z));
      return p.min + u * (p.max - p.min);
    }
    case "triangular": {
      const u = clamp01(normalCdf(z));
      const f = (p.mode - p.min) / (p.max - p.min);
      if (u < f) return p.min + Math.sqrt(u * (p.max - p.min) * (p.mode - p.min));
      return p.max - Math.sqrt((1 - u) * (p.max - p.min) * (p.max - p.mode));
    }
    case "poisson": {
      // Poisson için z→λ kümelemesi anlamlı değil; bağımsız Poisson örneklenir (not edilecek)
      void z;
      return sample(spec, rand);
    }
    case "empirical": {
      // Ampirik için z sırasını ölçüye çevir: u = Φ(z), sonra ters CDF
      const s = [...(spec.samples ?? [])].sort((a, b) => a - b);
      if (!s.length) return NaN;
      const u = clamp01(normalCdf(z));
      const idx = Math.min(s.length - 1, Math.floor(u * s.length));
      return s[idx];
    }
  }
}

const clamp01 = (x: number) => Math.min(1 - 1e-9, Math.max(1e-9, x));
