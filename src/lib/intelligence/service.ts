/**
 * Commerce Intelligence Service — motorları orkestre eder.
 * Okuma (GET) endpoint'leri saf hesaplama yapar; DB'ye YAZMAZ.
 * Kalıcı kayıtlar yalnızca `runIntelligentAnalysis()` (POST /api/intelligence/analyze) ile.
 */
import { db } from "@/db";
import {
  anomalyEvents,
  forecastResults,
  forecastAccuracy,
  rfmScores,
  abcXyzClassifications,
  intelligenceSettings,
  auditLogs,
} from "@/db/schema";
import { eq, and, isNull, lte, sql, inArray } from "drizzle-orm";
import { loadSalesBundle, type SalesBundle } from "./repositories";
import { computeProfitability } from "./profitability/profit-engine";
import { computeAbcXyz, CLASS_ACTIONS } from "./inventory/abc-xyz";
import { detectSeriesAnomalies, type AnomalyCandidate } from "./anomalies/anomaly-engine";
import { computeRfm, SEGMENT_ACTIONS } from "./customers/rfm-engine";
import { computeCohorts } from "./customers/cohort-engine";
import { errorMetrics } from "./accuracy/error-metrics";
import { forecastScope, buildScopedSeries, type ForecastScope } from "./forecasting/forecaster";
import { selectModel } from "./forecasting/model-selector";
import { mean } from "./core/statistics";
import { isValidOrder, orderDate, dayKey } from "./types";

export { CLASS_ACTIONS, SEGMENT_ACTIONS };

/* ------------------------------------------------------------------ *
 *  Ayarlar (intelligence_settings) — güvenli varsayılanlarla
 * ------------------------------------------------------------------ */
export const DEFAULT_SETTINGS: Record<string, { value: string; description: string }> = {
  "abc.a_percent": { value: "0.8", description: "ABC A sınıfı kümülatif tüketim değeri sınırı (ör. 0.8 = ilk %80)" },
  "abc.b_percent": { value: "0.95", description: "ABC A+B sınıfı kümülatif sınırı (0.8–0.95 → B)" },
  "xyz.x_max_cv": { value: "0.5", description: "XYZ X sınıfı üst CV sınırı (≤)" },
  "xyz.y_max_cv": { value: "1.0", description: "XYZ Y sınıfı üst CV sınırı (≤); üzeri Z" },
  "anomaly.min_observations": { value: "14", description: "Anomali için gereken asgari geçmiş gün sayısı" },
  "anomaly.window_days": { value: "28", description: "Anomali taban penceresi (gün)" },
  "rfm.period_days": { value: "365", description: "RFM analiz dönemi (gün)" },
  "churn.days": { value: "90", description: "Churn göstergesi için recency eşiği (gün)" },
};

export async function getIntelligenceSettings(): Promise<Record<string, string>> {
  try {
    const rows = await db.select().from(intelligenceSettings);
    const map: Record<string, string> = {};
    for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) map[k] = def.value;
    for (const r of rows) map[r.key] = r.value;
    return map;
  } catch {
    // Tablo henüz yoksa (migration uygulanmamış) varsayılanlarla devam et
    return Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k, d]) => [k, d.value]));
  }
}

export async function putIntelligenceSetting(key: string, value: string, description: string | undefined, actor: string) {
  if (!(key in DEFAULT_SETTINGS)) throw new Error("Bilinmeyen ayar anahtarı.");
  const numVal = Number(value);
  if (!Number.isFinite(numVal) || numVal < 0) throw new Error("Geçersiz değer (pozitif sayı olmalı).");
  if (key.startsWith("abc.") || key.startsWith("xyz.")) {
    if (numVal > 10) throw new Error("Oran değeri çok yüksek.");
  } else if (numVal > 3650) {
    throw new Error("Gün değeri çok yüksek.");
  }
  await db
    .insert(intelligenceSettings)
    .values({ key, value: String(value), description: description ?? DEFAULT_SETTINGS[key].description, updatedAt: new Date() })
    .onConflictDoUpdate({ target: intelligenceSettings.key, set: { value: String(value), updatedAt: new Date() } });
  await db.insert(auditLogs).values({
    userId: actor,
    userName: actor,
    action: "INTELLIGENCE_SETTING_UPDATED",
    entity: "IntelligenceSetting",
    entityId: key,
    details: `Ayar güncellendi: ${key}=${value}`,
  });
}

/* ------------------------------------------------------------------ *
 *  Kısa ömürlü bellek önbelleği (5 dk) — GET isteklerinde tekrar
 *  hesaplamasını önler. Standalone tek süreçte anlamlıdır.
 * ------------------------------------------------------------------ */
const cache = new Map<string, { at: number; data: unknown }>();
const TTL_MS = 5 * 60 * 1000;

export function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.data as T);
  return compute().then((data) => {
    cache.set(key, { at: Date.now(), data });
    return data;
  });
}
export function invalidateIntelligenceCache() {
  cache.clear();
}

/* ------------------------------------------------------------------ *
 *  GENEL BAKIŞ
 * ------------------------------------------------------------------ */
export async function getOverview(bundle: SalesBundle) {
  const valid = bundle.orders.filter(isValidOrder);
  const revenue = valid.reduce((s, o) => s + o.grandTotal, 0);
  const openAnomalies = await safeCount(sql`select count(*) as c from ${anomalyEvents} where ${anomalyEvents.status} = 'OPEN'`);
  const persistedForecasts = await safeCount(sql`select count(*) as c from ${forecastResults}`);
  const abcStats = await safeAbcSummary();
  const rfmAgg = await safeRfmSummary();
  const accuracyAgg = await safeAccuracySummary();
  return {
    generatedAt: new Date().toISOString(),
    kpis: {
      validOrders: valid.length,
      totalRevenue: Number(revenue.toFixed(2)),
      persistedForecastAnalyses: persistedForecasts,
      openAnomalies,
      rfmCustomers: rfmAgg.total,
      rfmAtRisk: rfmAgg.atRisk,
      avgBacktestWape: accuracyAgg.avgWape,
      abcAClassCount: abcStats?.A ?? 0,
      xyzZClassCount: abcStats?.Z ?? 0,
    },
    dataNotes: [
      "Canlı veri yoğunluğu düşük (sipariş sayısı sınırlı) — tahmin ve sınıflandırmalarda LOW_DATA uyarılarına dikkat edin.",
      "Maliyet/komisyon/kargo verisi şemada yok — kârlılık sonuçları eksik maliyetle hesaplanır.",
    ],
    classActions: CLASS_ACTIONS,
    segmentActions: SEGMENT_ACTIONS,
  };
}

async function safeCount(q: ReturnType<typeof sql>): Promise<number> {
  try {
    const rows = (await db.all(q)) as Array<{ c: number | string }>;
    return Number(rows[0]?.c ?? 0) || 0;
  } catch {
    return 0; // migration henüz uygulanmadıysa
  }
}
async function safeAbcSummary() {
  try {
    const rows = await db.select().from(abcXyzClassifications);
    const A = rows.filter((r) => r.abcClass === "A").length;
    const Z = rows.filter((r) => r.xyzClass === "Z").length;
    return { A, Z };
  } catch {
    return null;
  }
}
async function safeRfmSummary() {
  try {
    const rows = await db.select().from(rfmScores);
    const total = new Set(rows.map((r) => r.customerId)).size;
    const atRisk = rows.filter((r) => ["At Risk", "Can't Lose Them", "Hibernating", "Lost"].includes(r.segment)).length;
    return { total, atRisk };
  } catch {
    return { total: 0, atRisk: 0 };
  }
}
async function safeAccuracySummary() {
  try {
    const rows = await db.select().from(forecastAccuracy);
    const wapes = rows.map((r) => (r.wape != null ? Number(r.wape) : null)).filter((v): v is number => v != null);
    const avgWape = wapes.length ? Number(mean(wapes).toFixed(2)) : null;
    return { avgWape };
  } catch {
    return { avgWape: null };
  }
}

/* ------------------------------------------------------------------ *
 *  TAHMİN
 * ------------------------------------------------------------------ */
export async function getForecast(bundle: SalesBundle, scope: ForecastScope, scopeId: number | null, horizonDays: number) {
  return forecastScope(bundle, scope, scopeId, horizonDays);
}

export async function getTopProductsForForecast(bundle: SalesBundle, limit = 25) {
  const valid = bundle.orders.filter(isValidOrder);
  const orderIds = new Set(valid.map((o) => o.id));
  const revByProduct = new Map<number, number>();
  for (const it of bundle.items) {
    if (!orderIds.has(it.orderId)) continue;
    revByProduct.set(it.productId, (revByProduct.get(it.productId) ?? 0) + it.totalPrice);
  }
  return [...revByProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([productId, revenue]) => ({
      productId,
      revenue: Number(revenue.toFixed(2)),
      name: bundle.products.find((p) => p.id === productId)?.name ?? `Ürün #${productId}`,
    }));
}

/* ------------------------------------------------------------------ *
 *  ANOMALİLER (GET: hesapla + kayıtlı durumlarla birleştir, YAZMA)
 * ------------------------------------------------------------------ */
export async function computeAnomalyCandidates(bundle: SalesBundle): Promise<AnomalyCandidate[]> {
  const out: AnomalyCandidate[] = [];
  const valid = bundle.orders.filter(isValidOrder);
  if (valid.length === 0) return out;

  const byDay = new Map<string, { revenue: number; count: number }>();
  for (const o of valid) {
    const k = dayKey(orderDate(o));
    const e = byDay.get(k) ?? { revenue: 0, count: 0 };
    e.revenue += o.grandTotal;
    e.count += 1;
    byDay.set(k, e);
  }
  const dates = [...byDay.keys()].sort();
  const revenues = dates.map((d) => byDay.get(d)!.revenue);
  const counts = dates.map((d) => byDay.get(d)!.count);
  const baskets = dates.map((d) => (byDay.get(d)!.count ? byDay.get(d)!.revenue / byDay.get(d)!.count : 0));

  const storeCauses = [
    "Kampanya veya sezon etkisi",
    "Mağaza/online kanal kesintisi",
    "Veri giriş veya senkron hatası",
    "Hava/resmi tatil gibi dış etkenler",
  ];
  out.push(...detectSeriesAnomalies({ metric: "DAILY_REVENUE", entityType: "STORE", entityId: "STORE", entityLabel: "Mağaza Geneli", dates, values: revenues, possibleCauses: storeCauses }));
  out.push(...detectSeriesAnomalies({ metric: "DAILY_ORDER_COUNT", entityType: "STORE", entityId: "STORE", entityLabel: "Mağaza Geneli", dates, values: counts, possibleCauses: storeCauses }));
  out.push(...detectSeriesAnomalies({ metric: "AVG_BASKET", entityType: "STORE", entityId: "STORE", entityLabel: "Mağaza Geneli", dates, values: baskets, possibleCauses: storeCauses }));

  // Ürün bazında: en çok ciroya sahip 10 ürün (tarih lookup map ile O(n))
  const orderById = new Map(valid.map((o) => [o.id, o]));
  const revByProduct = new Map<number, number>();
  const qtyByProductDay = new Map<number, Map<string, number>>();
  for (const it of bundle.items) {
    const o = orderById.get(it.orderId);
    if (!o) continue;
    revByProduct.set(it.productId, (revByProduct.get(it.productId) ?? 0) + it.totalPrice);
    const d = dayKey(orderDate(o));
    const m = qtyByProductDay.get(it.productId) ?? new Map<string, number>();
    m.set(d, (m.get(d) ?? 0) + it.quantity);
    qtyByProductDay.set(it.productId, m);
  }
  const top = [...revByProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [productId] of top) {
    const p = bundle.products.find((x) => x.id === productId);
    const dayMap = qtyByProductDay.get(productId)!;
    const pDates = dates; // aynı takvim; o ürün 0 satan günler 0
    const values = pDates.map((d) => dayMap.get(d) ?? 0);
    if (values.reduce((s, v) => s + v, 0) === 0) continue;
    out.push(
      ...detectSeriesAnomalies({
        metric: "PRODUCT_DAILY_QTY",
        entityType: "PRODUCT",
        entityId: String(productId),
        entityLabel: p?.name ?? `Ürün #${productId}`,
        dates: pDates,
        values,
        possibleCauses: ["Stok tükenmesi / tedarik gecikmesi", "Kampanya bitişi veya fiyat değişikliği", "Raf/yer değişikliği veya listeleme hatası", "Sezonsal talep kayması"],
      })
    );
  }
  return out;
}

export async function getAnomalies(bundle: SalesBundle) {
  const candidates = await computeAnomalyCandidates(bundle);
  let stored = new Map<string, typeof anomalyEvents.$inferSelect>();
  try {
    const rows = await db.select().from(anomalyEvents);
    stored = new Map(rows.map((r) => [r.anomalyKey, r]));
  } catch {
    /* tablo yok */
  }
  const merged = candidates.map((c) => {
    const s = stored.get(c.anomalyKey);
    return {
      ...c,
      id: s?.id ?? null,
      status: s?.status ?? "OPEN",
      occurrences: s?.occurrences ?? 1,
      firstSeenAt: s?.firstSeenAt ?? null,
      lastSeenAt: s?.lastSeenAt ?? null,
      deviation: Math.abs(c.deviationPct),
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      open: merged.filter((m) => m.status === "OPEN").length,
      critical: merged.filter((m) => m.severity === "CRITICAL").length,
      high: merged.filter((m) => m.severity === "HIGH").length,
      lowData: merged.filter((m) => m.confidence === "LOW_DATA_CONFIDENCE").length,
    },
    anomalies: merged,
    notes: [
      "Tespit yöntemi: Modified Z (MAD) + IQR + EWMA teyidi; eşiği ürünün kendi geçmişi belirler.",
      "Nedenler OLASI açıklamalardır — motor kanıtlanmamış nedensellik iddia etmez.",
      "Tekrarlı olaylar tek kayıtta birleşir (firstSeen/lastSeen/occurrences).",
    ],
  };
}

/* ------------------------------------------------------------------ *
 *  TAHMİN DOĞRULUĞU — backtest karşılaştırma + kayıtlı değerlendirme
 * ------------------------------------------------------------------ */
export async function getAccuracy(bundle: SalesBundle) {
  // Mağaza geneli serisi üzerinde tüm modelleri aynı test penceresinde karşılaştır
  const store = buildScopedSeries(bundle, "STORE", null);
  const series = store?.points.map((p) => p.quantity) ?? [];
  const selection = selectModel(series, 7, 5);
  const rows = selection.results.map((r) => ({
    model: r.model,
    label: r.label,
    eligible: r.eligible,
    skipReason: r.skipReason ?? null,
    mae: Number(r.metrics.mae.toFixed(3)),
    rmse: Number(r.metrics.rmse.toFixed(3)),
    mape: r.metrics.mape != null ? Number(r.metrics.mape.toFixed(2)) : null,
    wape: r.metrics.wape != null ? Number(r.metrics.wape.toFixed(2)) : null,
    mase: r.metrics.mase != null ? Number(r.metrics.mase.toFixed(3)) : null,
    bias: Number(r.metrics.bias.toFixed(3)),
    sampleSize: r.metrics.sampleSize,
  }));
  const eligibleRows = rows.filter((r) => r.eligible && r.wape != null);
  const best = eligibleRows.length ? eligibleRows.reduce((a, b) => (a.wape! <= b.wape! ? a : b)) : null;

  // Kayıtlı (analyze ile kalıcılaştırılmış) değerlendirmeler
  let persisted: Array<typeof forecastAccuracy.$inferSelect> = [];
  try {
    persisted = await db.select().from(forecastAccuracy).orderBy(sql`${forecastAccuracy.evaluatedAt} desc`).limit(50);
  } catch {
    /* yok */
  }
  return {
    generatedAt: new Date().toISOString(),
    method: "Walk-forward backtesting (son gözlemler tek tek tahmin edildi, aynı test penceresi). MAPE sıfır gerçekleşenlerde hesaplanmaz; WAPE paydası 0 ise null.",
    storeSampleSize: series.length,
    dataQuality: selection.dataQuality,
    models: rows,
    bestModel: best ? { model: best.model, label: best.label, wape: best.wape } : null,
    persisted: persisted.map((p) => ({
      scope: p.scope,
      scopeId: p.scopeId,
      scopeLabel: p.scopeLabel,
      model: p.model,
      horizonDays: p.horizonDays,
      mae: Number(p.mae),
      rmse: Number(p.rmse),
      mape: p.mape != null ? Number(p.mape) : null,
      wape: p.wape != null ? Number(p.wape) : null,
      mase: p.mase != null ? Number(p.mase) : null,
      bias: Number(p.bias),
      sampleSize: p.sampleSize,
      evaluatedAt: p.evaluatedAt,
    })),
    notes: [
      "Backtesting sonucu ≠ gelecek garantisi; örneklem küçükse uyarı gösterilir.",
      "Kayıtlı geçmiş tahminler, gerçekleşen değerlerle 'analyze' çalıştırıldığında otomatik değerlendirilir.",
    ],
  };
}

/* ------------------------------------------------------------------ *
 *  ANALİZ ÇALIŞTIR — kalıcı yazım (tek yazma noktası)
 * ------------------------------------------------------------------ */
export async function runIntelligenceAnalysis(actor: string) {
  const bundle = await loadSalesBundle();
  const settings = await getIntelligenceSettings();
  const done: string[] = [];

  // 0) Önceden KAYDEDİLMİŞ ve tarihi geçmiş tahminleri gerçekleşenle değerlendir
  const evaluated = await evaluatePersistedForecasts(bundle);
  if (evaluated > 0) done.push(`${evaluated} kayıtlı tahmin gerçekleşenle kıyaslandı`);

  // 1) Mağaza geneli tahminler (7/14/30/60/90) + ürün tahminleri (ilk 5)
  for (const horizon of [7, 14, 30, 60, 90]) {
    const out = await getForecast(bundle, "STORE", null, horizon);
    for (const pt of out.forecast) {
      await db.insert(forecastResults).values({
        scope: "STORE",
        scopeId: null,
        scopeLabel: out.scopeLabel,
        granularity: "DAILY",
        horizonDays: horizon,
        forecastDate: pt.date,
        quantity: String(pt.quantity),
        revenue: String(pt.revenue),
        model: out.model ?? "INSUFFICIENT_DATA",
        sampleSize: out.sampleSize,
        ciLower: String(pt.ciLower),
        ciUpper: String(pt.ciUpper),
        modelWape: out.modelWape != null ? String(out.modelWape) : null,
        dataQuality: out.dataQuality,
        modelVersion: "intelligence@1.0.0",
      });
    }
  }
  done.push("Mağaza tahminleri kaydedildi (7/14/30/60/90)");

  // 2) Ürün tahminleri: satışa göre ilk 5 ürün × 7 gün ufku
  const topProducts = await getTopProductsForForecast(bundle, 5);
  for (const tp of topProducts) {
    const out = await getForecast(bundle, "PRODUCT", tp.productId, 7);
    if (out.dataQuality === "INSUFFICIENT_DATA") continue;
    for (const pt of out.forecast) {
      await db.insert(forecastResults).values({
        scope: "PRODUCT",
        scopeId: tp.productId,
        scopeLabel: out.scopeLabel,
        granularity: "DAILY",
        horizonDays: 7,
        forecastDate: pt.date,
        quantity: String(pt.quantity),
        revenue: String(pt.revenue),
        model: out.model ?? "UNKNOWN",
        sampleSize: out.sampleSize,
        ciLower: String(pt.ciLower),
        ciUpper: String(pt.ciUpper),
        modelWape: out.modelWape != null ? String(out.modelWape) : null,
        dataQuality: out.dataQuality,
        modelVersion: "intelligence@1.0.0",
      });
    }
  }
  done.push(`Ürün tahminleri kaydedildi (${topProducts.length} ürün, 7 gün)`);

  // 3) Backtest doğruluk satırları (STORE, tüm uygun modeller)
  const store = buildScopedSeries(bundle, "STORE", null);
  const storeSeries = store?.points.map((p) => p.quantity) ?? [];
  const selection = selectModel(storeSeries, 7, 5);
  for (const r of selection.results) {
    if (!r.eligible) continue;
    await db.insert(forecastAccuracy).values({
      scope: "STORE",
      scopeId: null,
      scopeLabel: "Mağaza Geneli (backtest)",
      model: r.model,
      horizonDays: 1,
      mae: String(r.metrics.mae),
      rmse: String(r.metrics.rmse),
      mape: r.metrics.mape != null ? String(r.metrics.mape) : null,
      wape: r.metrics.wape != null ? String(r.metrics.wape) : null,
      mase: r.metrics.mase != null ? String(r.metrics.mase) : null,
      bias: String(r.metrics.bias),
      sampleSize: r.metrics.sampleSize,
      evaluatedAt: new Date(),
    });
  }
  done.push("Backtest doğruluk metrikleri kaydedildi");

  // 4) ABC-XYZ sınıflandırması — ürün başına tek satır (upsert)
  const abc = computeAbcXyz(bundle, {
    aPercent: Number(settings["abc.a_percent"]),
    bPercent: Number(settings["abc.b_percent"]),
    xMaxCv: Number(settings["xyz.x_max_cv"]),
    yMaxCv: Number(settings["xyz.y_max_cv"]),
  });
  for (const row of abc.rows) {
    await db
      .insert(abcXyzClassifications)
      .values({
        productId: row.productId,
        abcClass: row.abcClass,
        xyzClass: row.xyzClass,
        composite: row.composite,
        annualQty: row.annualQty,
        annualValue: String(row.annualValue),
        avgDailyDemand: String(row.avgDailyDemand),
        demandCv: row.demandCv != null ? String(row.demandCv) : null,
        inventoryValue: String(row.inventoryValue),
        turnover: row.turnover != null ? String(row.turnover) : null,
        daysOfCover: row.daysOfCover != null ? String(row.daysOfCover) : null,
        risk: row.risk,
        calculatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: abcXyzClassifications.productId,
        set: {
          abcClass: row.abcClass,
          xyzClass: row.xyzClass,
          composite: row.composite,
          annualQty: row.annualQty,
          annualValue: String(row.annualValue),
          avgDailyDemand: String(row.avgDailyDemand),
          demandCv: row.demandCv != null ? String(row.demandCv) : null,
          inventoryValue: String(row.inventoryValue),
          turnover: row.turnover != null ? String(row.turnover) : null,
          daysOfCover: row.daysOfCover != null ? String(row.daysOfCover) : null,
          risk: row.risk,
          calculatedAt: new Date(),
        },
      });
  }
  done.push(`ABC-XYZ: ${abc.rows.length} ürün sınıflandırıldı`);

  // 5) RFM — dönem bazında sil+yaz (aynı dönem tekrarında çoğalma yok)
  const rfmPeriod = Number(settings["rfm.period_days"]) || 365;
  const rfm = computeRfm(bundle, rfmPeriod);
  await db.delete(rfmScores).where(eq(rfmScores.periodDays, rfmPeriod));
  for (const row of rfm.rows) {
    await db.insert(rfmScores).values({
      customerId: row.customerId,
      periodDays: rfmPeriod,
      recencyDays: row.recencyDays,
      frequency: row.frequency,
      monetary: String(row.monetary),
      rScore: row.rScore,
      fScore: row.fScore,
      mScore: row.mScore,
      segment: row.segment,
      calculatedAt: new Date(),
    });
  }
  done.push(`RFM: ${rfm.rows.length} müşteri skorlandı`);

  // 6) Anomaliler — dedup: mevcut anahtar güncellenir, yeni anahtar eklenir
  const candidates = await computeAnomalyCandidates(bundle);
  let inserted = 0;
  let updated = 0;
  for (const c of candidates) {
    const existing = await db.select().from(anomalyEvents).where(eq(anomalyEvents.anomalyKey, c.anomalyKey)).limit(1);
    if (existing.length) {
      const e = existing[0];
      await db
        .update(anomalyEvents)
        .set({ lastSeenAt: new Date(), occurrences: e.occurrences + 1, observedValue: String(c.observedValue), deviation: String(Math.abs(c.deviationPct)) })
        .where(eq(anomalyEvents.id, e.id));
      updated++;
    } else {
      await db.insert(anomalyEvents).values({
        anomalyKey: c.anomalyKey,
        metric: c.metric,
        entityType: c.entityType,
        entityId: c.entityId,
        entityLabel: c.entityLabel,
        observedValue: String(c.observedValue),
        expectedValue: String(c.expectedValue),
        deviation: String(Math.abs(c.deviationPct)),
        detectionMethod: c.method,
        severity: c.severity,
        confidence: c.confidence,
        possibleCauses: JSON.stringify(c.possibleCauses),
      });
      inserted++;
    }
  }
  done.push(`Anomaliler: ${inserted} yeni, ${updated} tekrar güncellendi`);

  invalidateIntelligenceCache();

  await db.insert(auditLogs).values({
    userId: actor,
    userName: actor,
    action: "INTELLIGENCE_ANALYSIS_RUN",
    entity: "IntelligenceEngine",
    entityId: "FAZ1",
    details: done.join(" · "),
  });

  return { success: true, steps: done, analyzedAt: new Date().toISOString() };
}

/** Tarihi geçmiş ve henüz değerlendirilmemiş tahminleri gerçekleşenle karşılaştır. */
async function evaluatePersistedForecasts(bundle: SalesBundle): Promise<number> {
  const today = dayKey(new Date());
  let rows: Array<typeof forecastResults.$inferSelect> = [];
  try {
    rows = await db.select().from(forecastResults).where(and(lte(forecastResults.forecastDate, today), isNull(forecastResults.evaluatedAt)));
  } catch {
    return 0;
  }
  if (!rows.length) return 0;

  // Gerçekleşen günlük adet: mağaza geneli ve ürün bazında
  const store = buildScopedSeries(bundle, "STORE", null);
  const actualByDay = new Map(store?.points.map((p) => [p.date, p.quantity]) ?? []);
  const productActual = new Map<string, number>(); // `${productId}:${date}`
  const orderById = new Map(bundle.orders.filter(isValidOrder).map((o) => [o.id, o]));
  for (const it of bundle.items) {
    const o = orderById.get(it.orderId);
    if (!o) continue;
    const k = `${it.productId}:${dayKey(orderDate(o))}`;
    productActual.set(k, (productActual.get(k) ?? 0) + it.quantity);
  }

  // (scope, scopeId, model, horizonDays) bazında grupla
  const groups = new Map<string, Array<{ predicted: number; actual: number }>>();
  for (const r of rows) {
    const actual = r.scope === "STORE" ? actualByDay.get(r.forecastDate) ?? 0 : productActual.get(`${r.scopeId}:${r.forecastDate}`) ?? 0;
    const key = `${r.scope}|${r.scopeId ?? ""}|${r.model}|${r.horizonDays}|${r.scopeLabel}`;
    const arr = groups.get(key) ?? [];
    arr.push({ predicted: Number(r.quantity), actual });
    groups.set(key, arr);
  }

  for (const [key, pairs] of groups) {
    const [scope, scopeIdRaw, model, horizonRaw, scopeLabel] = key.split("|");
    const metrics = errorMetrics(pairs.map((p) => p.predicted), pairs.map((p) => p.actual));
    await db.insert(forecastAccuracy).values({
      scope,
      scopeId: scopeIdRaw === "" ? null : Number(scopeIdRaw),
      scopeLabel: `${scopeLabel} (kayıtlı)`,
      model,
      horizonDays: Number(horizonRaw),
      mae: String(metrics.mae),
      rmse: String(metrics.rmse),
      mape: metrics.mape != null ? String(metrics.mape) : null,
      wape: metrics.wape != null ? String(metrics.wape) : null,
      mase: metrics.mase != null ? String(metrics.mase) : null,
      bias: String(metrics.bias),
      sampleSize: metrics.sampleSize,
      evaluatedAt: new Date(),
    });
  }

  const ids = rows.map((r) => r.id);
  await db.update(forecastResults).set({ evaluatedAt: new Date() }).where(inArray(forecastResults.id, ids));
  return rows.length;
}
