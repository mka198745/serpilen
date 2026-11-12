/**
 * Forecaster — günlük seri hazırlama + tahmin + %95 güven aralığı.
 * CI: walk-forward tek adım artıklarının (residual) standart sapması × sqrt(h)
 * × 1.96 (iki taraflı). "Confidence" ile veri kalitesi birbirinden ayrıdır.
 * Gelecek fiyat = sabit varsayılır; fiyat geçmişi şemada yok (raporlanır).
 */
import { selectModel, type ModelSelection } from "./model-selector";
import { getModel, type ForecastModelId } from "./models";
import { stddev } from "../core/statistics";
import { isValidOrder, orderDate, dayKey, zeroFillSeries, type ProductDim } from "../types";
import type { SalesBundle } from "../repositories";

export type ForecastScope = "STORE" | "CATEGORY" | "PRODUCT";

export interface DailyPoint {
  date: string;
  quantity: number;
  revenue: number;
}

export interface ScopedSeries {
  scope: ForecastScope;
  scopeId: number | null;
  scopeLabel: string;
  points: DailyPoint[];
  truncatedHistory: boolean;
}

/** İstenen kapsam için günlük seri üretir (satış olmayan günler 0). */
export function buildScopedSeries(bundle: SalesBundle, scope: ForecastScope, scopeId: number | null): ScopedSeries | null {
  const valid = bundle.orders.filter(isValidOrder);
  const itemsByOrder = new Map<number, typeof bundle.items>();
  for (const it of bundle.items) {
    const arr = itemsByOrder.get(it.orderId) ?? [];
    arr.push(it);
    itemsByOrder.set(it.orderId, arr);
  }
  const productById = new Map(bundle.products.map((p) => [p.id, p]));

  let label = "Mağaza Geneli";
  let productFilter: Set<number> | null = null;
  if (scope === "CATEGORY" && scopeId != null) {
    productFilter = new Set(bundle.products.filter((p) => p.categoryId === scopeId).map((p) => p.id));
    label = bundle.categories.find((c) => c.id === scopeId)?.name ?? `Kategori #${scopeId}`;
  } else if (scope === "PRODUCT" && scopeId != null) {
    productFilter = new Set([scopeId]);
    label = productById.get(scopeId)?.name ?? `Ürün #${scopeId}`;
  } else if (scope === "CATEGORY" || scope === "PRODUCT") {
    return null;
  }

  const qty = new Map<string, number>();
  const rev = new Map<string, number>();
  let first: Date | null = null;
  for (const o of valid) {
    const items = itemsByOrder.get(o.id) ?? [];
    const key = dayKey(orderDate(o));
    for (const it of items) {
      if (productFilter && !productFilter.has(it.productId)) continue;
      const od = orderDate(o);
      if (first == null || od.getTime() < (first as Date).getTime()) first = od;
      qty.set(key, (qty.get(key) ?? 0) + it.quantity);
      rev.set(key, (rev.get(key) ?? 0) + it.totalPrice);
    }
  }
  if (!first) {
    return { scope, scopeId, scopeLabel: label, points: [], truncatedHistory: false };
  }
  const from = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  const to = new Date();
  const qtySeries = zeroFillSeries(from, to, qty);
  const revSeries = zeroFillSeries(from, to, rev);
  const points = qtySeries.map((q, i) => ({ date: q.date, quantity: q.value, revenue: revSeries[i]?.value ?? 0 }));
  // 2 yıldan uzun geçmiş: son 730 günü kullan
  const truncated = points.length > 730;
  return { scope, scopeId, scopeLabel: label, points: truncated ? points.slice(-730) : points, truncatedHistory: truncated };
}

export interface ForecastOutput {
  scope: ForecastScope;
  scopeId: number | null;
  scopeLabel: string;
  history: DailyPoint[];
  forecast: Array<{ date: string; quantity: number; revenue: number; ciLower: number; ciUpper: number }>;
  horizonDays: number;
  model: ForecastModelId | null;
  modelLabel: string | null;
  modelWape: number | null;
  sampleSize: number;
  zeroFraction: number;
  dataQuality: ModelSelection["dataQuality"];
  avgUnitPrice: number;
  note: string;
  priceAssumption: string;
}

export function forecastScope(bundle: SalesBundle, scope: ForecastScope, scopeId: number | null, horizonDays: number): ForecastOutput {
  const series = buildScopedSeries(bundle, scope, scopeId);
  const empty: ForecastOutput = {
    scope,
    scopeId,
    scopeLabel: scopeId != null ? `#${scopeId}` : "Mağaza Geneli",
    history: [],
    forecast: [],
    horizonDays,
    model: null,
    modelLabel: null,
    modelWape: null,
    sampleSize: 0,
    zeroFraction: 1,
    dataQuality: "INSUFFICIENT_DATA",
    avgUnitPrice: 0,
    note: "Yeterli satış geçmişi yok — tahmin üretilmedi.",
    priceAssumption: "Fiyatlar sabit varsayıldı (fiyat geçmişi şemada tutulmuyor).",
  };
  if (!series || series.points.length === 0) return empty;

  const qtySeries = series.points.map((p) => p.quantity);
  const revSeries = series.points.map((p) => p.revenue);
  const selection = selectModel(qtySeries, 7, 5);

  // Birim fiyat: son 90 gün gerçekleşen ortalama (fallback: tüm dönem / cari fiyat)
  const last90 = series.points.slice(-90);
  const qty90 = last90.reduce((s, p) => s + p.quantity, 0);
  const rev90 = last90.reduce((s, p) => s + p.revenue, 0);
  const avgUnitPrice = qty90 > 0 ? rev90 / qty90 : revSeries.reduce((s, v) => s + v, 0) / Math.max(1, qtySeries.reduce((s, v) => s + v, 0)) || 0;

  if (!selection.chosen) {
    return {
      ...empty,
      scopeLabel: series.scopeLabel,
      history: series.points.slice(-90),
      zeroFraction: selection.zeroFraction,
      sampleSize: selection.sampleSize,
      note: selection.note,
    };
  }

  const model = getModel(selection.chosen);
  const qtyForecast = model.forecast(qtySeries, horizonDays, 7);
  const revForecast = model.forecast(revSeries, horizonDays, 7);

  // CI: walk-forward artıklarının std'si × sqrt(h) × 1.96
  const residuals: number[] = [];
  const n = qtySeries.length;
  const testSize = Math.min(10, Math.floor(n / 3));
  for (let t = n - testSize; t < n; t++) {
    const train = qtySeries.slice(0, t);
    const pred = model.forecast(train, 1, 7)[0];
    residuals.push(qtySeries[t] - pred);
  }
  const sigma = stddev(residuals, true) || stddev(qtySeries, true);
  const z = 1.96; // %95 — çift kuyruk

  const start = new Date();
  start.setDate(start.getDate() + 1);
  const forecast = qtyForecast.map((q, h) => {
    const d = new Date(start);
    d.setDate(d.getDate() + h);
    const band = z * sigma * Math.sqrt(h + 1);
    // Ciro tahminini seçilen modelin kendi ciro serisinden üret; qty×fiyat ile tutarlılık için fiyat oranıyla düzelt
    const modelRev = revForecast[h];
    const priceFloorRev = q * avgUnitPrice;
    return {
      date: dayKey(d),
      quantity: Number(q.toFixed(2)),
      revenue: Number(((modelRev + priceFloorRev) / 2).toFixed(2)),
      ciLower: Number(Math.max(0, q - band).toFixed(2)),
      ciUpper: Number((q + band).toFixed(2)),
    };
  });

  return {
    scope,
    scopeId,
    scopeLabel: series.scopeLabel,
    history: series.points.slice(-90),
    forecast,
    horizonDays,
    model: selection.chosen,
    modelLabel: selection.chosenLabel,
    modelWape: selection.chosenMetrics?.wape != null ? Number(selection.chosenMetrics.wape.toFixed(2)) : null,
    sampleSize: selection.sampleSize,
    zeroFraction: Number(selection.zeroFraction.toFixed(3)),
    dataQuality: selection.dataQuality,
    avgUnitPrice: Number(avgUnitPrice.toFixed(2)),
    note: selection.note,
    priceAssumption: "Fiyatlar sabit varsayıldı (fiyat geçmişi şemada yok). Ciro = model ciro tahmini ile (adet × son 90g ortalama birim fiyat) ortalaması.",
  };
}

/** Fiyat varsayımı notunu ürün düzeyinde üretir. */
export function productPriceNote(p: ProductDim | undefined): string {
  return p?.campaignPrice != null
    ? `Kampanya fiyatı (${p.campaignPrice}) geçerli; tahminde sabit fiyat varsayılır.`
    : "Tahminde sabit fiyat varsayılır (fiyat geçmişi yok).";
}
