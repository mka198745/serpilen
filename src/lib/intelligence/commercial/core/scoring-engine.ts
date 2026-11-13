/**
 * Ağırlıklı skor motoru — eksik kriterleri SIFIR saymaz;
 * eksikleri ağırlıklarından düşürerek kalanına yeniden normalize eder.
 * Böylece "veri yok" hiçbir zaman "başarısız" gibi puanlanmaz; kapsama raporlanır.
 */
export interface ScoreCriterion {
  key: string;
  weight: number;
  score: number | null; // 0-100; null = veri yok
}

export interface WeightedScoreResult {
  score: number | null; // null = hiç kriter yok
  coverage: number; // değerlendirilen ağırlık payı (0-100)
  used: Array<{ key: string; weight: number; score: number }>;
  missing: string[];
}

export function weightedScore(criteria: ScoreCriterion[]): WeightedScoreResult {
  const totalWeight = criteria.reduce((s, c) => s + Math.max(0, c.weight), 0);
  if (totalWeight <= 0) return { score: null, coverage: 0, used: [], missing: criteria.map((c) => c.key) };
  const used: WeightedScoreResult["used"] = [];
  const missing: string[] = [];
  let usedWeight = 0;
  let acc = 0;
  for (const c of criteria) {
    const w = Math.max(0, c.weight);
    if (c.score == null) {
      missing.push(c.key);
      continue;
    }
    usedWeight += w;
    acc += w * Math.min(100, Math.max(0, c.score));
    used.push({ key: c.key, weight: w, score: Math.min(100, Math.max(0, c.score)) });
  }
  if (usedWeight <= 0) return { score: null, coverage: 0, used: [], missing };
  return {
    score: Number((acc / usedWeight).toFixed(1)),
    coverage: Number(((usedWeight / totalWeight) * 100).toFixed(1)),
    used,
    missing,
  };
}
