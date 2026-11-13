/**
 * FAZ 2 ayarları — intelligence_settings tablosunda ayrı anahtar önekiyle (faz2.*)
 * tutulur; FAZ 1 ayarlarının doğrulamasına dokunulmaz.
 */
export const FAZ2_DEFAULTS: Record<string, { value: string; description: string; min?: number; max?: number }> = {
  "faz2.pricing.target_margin_pct": { value: "25", description: "Hedef katkı marjı % (fiyat önerisi formülü)", min: 0, max: 95 },
  "faz2.pricing.min_margin_pct": { value: "15", description: "Bu marjın altı 'düşük marj' sayılır", min: 0, max: 95 },
  "faz2.pricing.min_units_period": { value: "5", description: "Öneri için asgari dönem satış adedi", min: 0, max: 100000 },
  "faz2.pricing.period_days": { value: "90", description: "Fiyat analizi dönemi (gün)", min: 7, max: 365 },
  "faz2.pricing.max_suggested_increase_pct": { value: "20", description: "Tek öneride azami fiyat artışı %", min: 1, max: 100 },
  "faz2.advertising.roas_alarm": { value: "1.0", description: "Bu ROAS'ın altındaki reklam kaybı sinyali", min: 0, max: 100 },
  "faz2.advertising.min_spend": { value: "100", description: "Değerlendirme için asgari reklam spend (TL)", min: 0, max: 10000000 },
  "faz2.basket.min_pair_orders": { value: "3", description: "Sepet ilişkisi için asgari birliktelik sayısı", min: 1, max: 10000 },
  "faz2.basket.min_lift": { value: "1.2", description: "Öneri için asgari lift", min: 1, max: 100 },
  "faz2.supplier.period_days": { value: "180", description: "Tedarikçi performans dönemi (gün)", min: 30, max: 730 },
  "faz2.quality.return_rate_alarm_pct": { value: "8", description: "İade oranı alarm eşiği %", min: 0, max: 100 },
  "faz2.quality.min_units": { value: "10", description: "İade analizi için asgari satış adedi", min: 1, max: 100000 },
  "faz2.procurement.dead_stock_days": { value: "90", description: "Bu günden beri satılmayan stok 'ölü stok' adayı", min: 14, max: 730 },
  "faz2.procurement.reorder_cover_days": { value: "21", description: "Reorder noktası: kalan kaplama günü", min: 1, max: 365 },
};

export function mergeFaz2Settings(rows: Array<{ key: string; value: string }> | null | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [k, d] of Object.entries(FAZ2_DEFAULTS)) map[k] = d.value;
  for (const r of rows ?? []) {
    if (r.key in FAZ2_DEFAULTS) map[r.key] = r.value;
  }
  return map;
}

export function parseNumSetting(map: Record<string, string>, key: string): number {
  const v = Number(map[key]);
  return Number.isFinite(v) ? v : Number(FAZ2_DEFAULTS[key]?.value ?? 0);
}

export function validateFaz2Setting(key: string, value: string): string | null {
  const def = FAZ2_DEFAULTS[key];
  if (!def) return "Bilinmeyen FAZ 2 ayar anahtarı.";
  const n = Number(value);
  if (!Number.isFinite(n)) return "Geçersiz değer (sayı olmalı).";
  if (def.min != null && n < def.min) return `Değer en az ${def.min} olmalı.`;
  if (def.max != null && n > def.max) return `Değer en fazla ${def.max} olmalı.`;
  return null;
}
