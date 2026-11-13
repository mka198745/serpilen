/**
 * FAZ 3 ayarları — intelligence_settings tablosunda "faz3.*" önekiyle tutulur.
 * FAZ 1/2 doğrulama mantığına dokunulmaz (birlikte yaşarlar).
 */
export const FAZ3_DEFAULTS: Record<string, { value: string; description: string; min?: number; max?: number }> = {
  // Karar değerlendirme kriteri ağırlıkları (toplam 100 önerilir; normalize edilir)
  "faz3.criteria.expected_profit": { value: "20", description: "Değerlendirme ağırlığı: beklenen kâr etkisi", min: 0, max: 100 },
  "faz3.criteria.expected_revenue": { value: "10", description: "Değerlendirme ağırlığı: beklenen ciro etkisi", min: 0, max: 100 },
  "faz3.criteria.cash_impact": { value: "10", description: "Değerlendirme ağırlığı: nakit etkisi", min: 0, max: 100 },
  "faz3.criteria.risk": { value: "15", description: "Değerlendirme ağırlığı: risk (düşük risk = yüksek puan)", min: 0, max: 100 },
  "faz3.criteria.implementation_ease": { value: "10", description: "Değerlendirme ağırlığı: uygulama kolaylığı", min: 0, max: 100 },
  "faz3.criteria.data_confidence": { value: "10", description: "Değerlendirme ağırlığı: veri güveni", min: 0, max: 100 },
  "faz3.criteria.strategic_fit": { value: "10", description: "Değerlendirme ağırlığı: hedeflere uyum", min: 0, max: 100 },
  "faz3.criteria.customer_impact": { value: "5", description: "Değerlendirme ağırlığı: müşteri etkisi", min: 0, max: 100 },
  "faz3.criteria.operational_feasibility": { value: "5", description: "Değerlendirme ağırlığı: operasyonel uygunluk", min: 0, max: 100 },
  "faz3.criteria.reversibility": { value: "3", description: "Değerlendirme ağırlığı: geri alınabilirlik", min: 0, max: 100 },
  "faz3.criteria.cost": { value: "2", description: "Değerlendirme ağırlığı: maliyet (düşük = yüksek puan)", min: 0, max: 100 },

  // MCDA
  "faz3.mcda.method": { value: "WEIGHTED_SCORING", description: "MCDA yöntemi (ilk sürüm: WEIGHTED_SCORING + cost-benefit)", min: 0, max: 0 },
  "faz3.mcda.max_price_increase_pct": { value: "20", description: "Fiyat önerisinde azami artış % (iş kuralı)", min: 1, max: 100 },

  // Güven ve kapsama
  "faz3.confidence.min_coverage_for_high": { value: "75", description: "Yüksek güven için asgari veri kapsama %", min: 1, max: 100 },
  "faz3.confidence.min_sample_for_forecast_days": { value: "14", description: "Tahmin için asgari gün sayısı", min: 3, max: 365 },

  // Erken uyarı
  "faz3.earlywarning.min_confidence_for_critical": { value: "60", description: "Kritik/yüksek skor basmak için asgari veri güveni", min: 0, max: 100 },
  "faz3.earlywarning.repeat_escalation_count": { value: "3", description: "Bu tekrar sayısında severity bir kademe yükselir", min: 2, max: 20 },
  "faz3.earlywarning.expire_days": { value: "30", description: "Bu kadar gündür görülmeyen açık uyarı EXPIRED olur", min: 7, max: 365 },
  "faz3.earlywarning.sales_drop_pct": { value: "25", description: "Satış düşüş alarmı eşiği % (son 7g vs önceki 28g)", min: 5, max: 95 },
  "faz3.earlywarning.margin_drop_pct": { value: "20", description: "Marj kötüleşmesi alarmı eşiği %", min: 5, max: 95 },
  "faz3.earlywarning.return_rate_alarm_pct": { value: "10", description: "İade oranı alarmı %", min: 1, max: 100 },
  "faz3.earlywarning.stockout_cover_days": { value: "7", description: "Stok-out riski için kaplama günü eşiği", min: 1, max: 90 },
  "faz3.earlywarning.overstock_cover_days": { value: "120", description: "Aşırı stok alarmı kaplama günü eşiği", min: 30, max: 730 },
  "faz3.earlywarning.roas_alarm": { value: "1.0", description: "Reklam israfı ROAS eşiği", min: 0, max: 100 },
  "faz3.earlywarning.supplier_late_pct": { value: "30", description: "Tedarikçi gecikme oranı alarmı %", min: 1, max: 100 },
  "faz3.earlywarning.forecast_deviation_pct": { value: "30", description: "Tahmin-gerçekleşme sapma alarmı %", min: 5, max: 100 },
  // Risk puanı ağırlıkları
  "faz3.risk.weight_probability": { value: "30", description: "Risk puanı ağırlığı: olasılık %", min: 0, max: 100 },
  "faz3.risk.weight_impact": { value: "30", description: "Risk puanı ağırlığı: etki %", min: 0, max: 100 },
  "faz3.risk.weight_urgency": { value: "20", description: "Risk puanı ağırlığı: aciliyet %", min: 0, max: 100 },
  "faz3.risk.weight_exposure": { value: "10", description: "Risk puanı ağırlığı: maruziyet %", min: 0, max: 100 },
  "faz3.risk.weight_reliability": { value: "10", description: "Risk puanı ağırlığı: veri güvenilirliği %", min: 0, max: 100 },

  // Monte Carlo
  "faz3.montecarlo.max_iterations": { value: "10000", description: "Yönetici tavanı: en yüksek MC iterasyon", min: 100, max: 50000 },
  "faz3.montecarlo.min_iterations": { value: "100", description: "Asgari MC iterasyon", min: 50, max: 1000 },
  "faz3.montecarlo.outlier_clip_pct": { value: "0.5", description: "Her kuyruktan kırpılacak yüzde (aşırı değer kontrolü)", min: 0, max: 5 },

  // Hedefler
  "faz3.goals.forecast_min_days": { value: "14", description: "Hedef tahmini için asgari gün verisi", min: 7, max: 365 },
  "faz3.goals.dead_stock_kpi": { value: "DEAD_STOCK_VALUE", description: "Ölü stok KPI anahtarı (AUTO ölçüm)", min: 0, max: 0 },

  // Orkestrasyon
  "faz3.orchestrator.mode": { value: "MANUAL", description: "Orkestrasyon modu — ilk sürüm yalnız MANUAL", min: 0, max: 0 },
};

export function mergeFaz3Settings(rows: Array<{ key: string; value: string }> | null | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [k, d] of Object.entries(FAZ3_DEFAULTS)) map[k] = d.value;
  for (const r of rows ?? []) {
    if (r.key in FAZ3_DEFAULTS) map[r.key] = r.value;
  }
  return map;
}

export function parseNumSetting(map: Record<string, string>, key: string): number {
  const v = Number(map[key]);
  return Number.isFinite(v) ? v : Number(FAZ3_DEFAULTS[key]?.value ?? 0);
}

export function validateFaz3Setting(key: string, value: string): string | null {
  const def = FAZ3_DEFAULTS[key];
  if (!def) return "Bilinmeyen FAZ 3 ayar anahtarı.";
  if (key === "faz3.mcda.method" || key === "faz3.goals.dead_stock_kpi" || key === "faz3.orchestrator.mode") {
    return value === def.value ? null : `Bu anahtar yalnızca "${def.value}" olabilir (bu sürümde).`;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return "Geçersiz değer (sayı olmalı).";
  if (def.min != null && n < def.min) return `Değer en az ${def.min} olmalı.`;
  if (def.max != null && n > def.max) return `Değer en fazla ${def.max} olmalı.`;
  return null;
}

/** Değerlendirme kriteri ağırlıklarını ayarlardan okur. */
export const CRITERION_WEIGHT_KEYS = [
  "expected_profit",
  "expected_revenue",
  "cash_impact",
  "risk",
  "implementation_ease",
  "data_confidence",
  "strategic_fit",
  "customer_impact",
  "operational_feasibility",
  "reversibility",
  "cost",
] as const;

export const CRITERION_LABELS: Record<(typeof CRITERION_WEIGHT_KEYS)[number], string> = {
  expected_profit: "Beklenen kâr etkisi",
  expected_revenue: "Beklenen ciro etkisi",
  cash_impact: "Nakit etkisi",
  risk: "Risk düzeyi",
  implementation_ease: "Uygulama kolaylığı",
  data_confidence: "Veri güveni",
  strategic_fit: "Hedeflere uyum",
  customer_impact: "Müşteri etkisi",
  operational_feasibility: "Operasyonel uygunluk",
  reversibility: "Geri alınabilirlik",
  cost: "Maliyet",
};

export function criterionWeights(map: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of CRITERION_WEIGHT_KEYS) out[k] = Math.max(0, parseNumSetting(map, `faz3.criteria.${k}`));
  return out;
}
