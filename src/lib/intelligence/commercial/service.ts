/**
 * COMMERCE INTELLIGENCE — FAZ 2 Commercial Service.
 * GET uçları saf hesaplama (DB'ye yazmaz); yazma yalnızca runCommercialAnalysis ve
 * fırsat yaşam döngüsü/CRUD aksiyonlarında, tümü audit log'ludur.
 */
import { db } from "@/db";
import {
  commercialOpportunities,
  opportunityHistory,
  opportunityImpactResults,
  advertisingPerformance,
  intelligenceSettings,
  auditLogs,
} from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { cached } from "../service";
import { loadCommercialContext } from "./data-prep";
import { analyzePricing, type PricingAnalysis } from "./pricing/pricing-engine";
import { analyzeCampaigns, type CampaignAnalysis } from "./campaigns/campaigns-engine";
import { analyzeBasket, type BasketAnalysis } from "./basket/basket-engine";
import { analyzeSuppliers, type SupplierAnalysis } from "./suppliers/suppliers-engine";
import { analyzeQuality, type QualityAnalysis } from "./quality/quality-engine";
import { analyzeProcurement, type ProcurementAnalysis } from "./procurement/procurement-engine";
import {
  FAZ2_DEFAULTS, mergeFaz2Settings, parseNumSetting, validateFaz2Setting,
} from "./core/settings";
import { upsertOpportunity, expireStaleOpportunities, completeOpportunity, logHistory, writeAudit } from "./core/opportunity-store";
import { TERMINAL_STATUSES, type OpportunityStatus } from "./core/commercial-opportunity-engine";
import { isValidOrder, orderDate } from "../types";

const n = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (v: number) => Number(v.toFixed(2));
const OPEN_STATUSES: OpportunityStatus[] = ["NEW", "UNDER_REVIEW", "APPROVED", "IN_PROGRESS"];

/* ---------------- Ayarlar ---------------- */

export async function getFaz2Settings(): Promise<Record<string, string>> {
  try {
    const rows = await db.select().from(intelligenceSettings);
    return mergeFaz2Settings(rows);
  } catch {
    return mergeFaz2Settings(null);
  }
}

export async function putFaz2Setting(key: string, value: string, actor: string) {
  const err = validateFaz2Setting(key, value);
  if (err) throw new Error(err);
  await db
    .insert(intelligenceSettings)
    .values({ key, value: String(value), description: FAZ2_DEFAULTS[key].description, updatedAt: new Date() })
    .onConflictDoUpdate({ target: intelligenceSettings.key, set: { value: String(value), updatedAt: new Date() } });
  await db.insert(auditLogs).values({
    userId: actor, userName: actor, action: "INTELLIGENCE_SETTING_UPDATED",
    entity: "IntelligenceSetting", entityId: key, details: `FAZ 2 ayarı güncellendi: ${key}=${value}`,
  });
}

/* ---------------- Analiz yükleyiciler (salt okunur) ---------------- */

async function loadCommon(periodDays: number) {
  const ctx = await loadCommercialContext(periodDays);
  const settings = await getFaz2Settings();
  const productDims = new Map<number, { name: string; sku: string; buyPrice: number; categoryId: number | null; categoryName: string | null }>();
  const catNameById = new Map(ctx.bundle.categories.map((c) => [c.id, c.name]));
  for (const p of ctx.bundle.products) {
    productDims.set(p.id, {
      name: p.name, sku: p.sku, buyPrice: p.buyPrice, categoryId: p.categoryId,
      categoryName: p.categoryId != null ? catNameById.get(p.categoryId) ?? null : null,
    });
  }
  // Son satış tarihi (procurement) — geçerli sipariş kalemlerinden
  const orderDateById = new Map<number, Date>();
  for (const o of ctx.bundle.orders) orderDateById.set(o.id, orderDate(o));
  const lastSaleByProduct = new Map<number, Date>();
  for (const i of ctx.validItems) {
    const t = orderDateById.get(i.orderId);
    if (!t) continue;
    const cur = lastSaleByProduct.get(i.productId);
    if (!cur || t > cur) lastSaleByProduct.set(i.productId, t);
  }
  const categoryByProduct = new Map<number, { id: number | null; name: string | null }>();
  for (const p of ctx.bundle.products) {
    categoryByProduct.set(p.id, { id: p.categoryId, name: p.categoryId != null ? catNameById.get(p.categoryId) ?? null : null });
  }
  return { ctx, settings, productDims, lastSaleByProduct, categoryByProduct };
}

export async function getPricingAnalysis(): Promise<PricingAnalysis> {
  const periodDays = parseNumSetting(await getFaz2Settings(), "faz2.pricing.period_days");
  return cached(`commercial:pricing:${periodDays}`, async () => {
    const { ctx, settings, productDims } = await loadCommon(periodDays);
    return analyzePricing({
      products: ctx.bundle.products.map((p) => ({
        id: p.id, name: p.name, sku: p.sku, categoryId: p.categoryId,
        categoryName: productDims.get(p.id)?.categoryName ?? null,
        isActive: p.isActive, buyPrice: p.buyPrice, retailPrice: p.retailPrice, campaignPrice: p.campaignPrice,
      })),
      sales: ctx.salesByProduct,
      inventory: new Map([...ctx.availableStockByProduct.entries()].map(([k, v]) => [k, { availableQty: v }])),
      settings: {
        targetMarginPct: parseNumSetting(settings, "faz2.pricing.target_margin_pct"),
        minMarginPct: parseNumSetting(settings, "faz2.pricing.min_margin_pct"),
        minUnitsPeriod: parseNumSetting(settings, "faz2.pricing.min_units_period"),
        periodDays,
        maxSuggestedIncreasePct: parseNumSetting(settings, "faz2.pricing.max_suggested_increase_pct"),
      },
    });
  });
}

export async function getCampaignAnalysis(): Promise<CampaignAnalysis> {
  return cached("commercial:campaigns", async () => {
    const { ctx } = await loadCommon(90);
    return analyzeCampaigns({
      orders: ctx.bundle.orders,
      items: ctx.bundle.items,
      products: ctx.bundle.products,
      promotions: ctx.promotions,
      coupons: ctx.coupons,
      advertising: ctx.advertising,
      settings: {
        advertisingRoasAlarm: parseNumSetting(await getFaz2Settings(), "faz2.advertising.roas_alarm"),
        advertisingMinSpend: parseNumSetting(await getFaz2Settings(), "faz2.advertising.min_spend"),
      },
    });
  });
}

export async function getBasketAnalysis(): Promise<BasketAnalysis> {
  return cached("commercial:basket", async () => {
    const { ctx, settings } = await loadCommon(90);
    return analyzeBasket({
      orders: ctx.bundle.orders,
      items: ctx.bundle.items,
      products: ctx.bundle.products,
      settings: {
        minPairOrders: parseNumSetting(settings, "faz2.basket.min_pair_orders"),
        minLift: parseNumSetting(settings, "faz2.basket.min_lift"),
      },
    });
  });
}

export async function getSupplierAnalysis(): Promise<SupplierAnalysis> {
  return cached("commercial:suppliers", async () => {
    const { ctx, settings, categoryByProduct } = await loadCommon(180);
    return analyzeSuppliers({
      suppliers: ctx.supplierContexts,
      salesByProduct: ctx.salesByProduct,
      categoryByProduct,
      settings: {
        periodDays: parseNumSetting(settings, "faz2.supplier.period_days"),
      },
    });
  });
}

export async function getQualityAnalysis(): Promise<QualityAnalysis> {
  return cached("commercial:quality", async () => {
    const { ctx, settings, productDims } = await loadCommon(90);
    return analyzeQuality({
      salesByProduct: ctx.salesByProduct,
      productDims: new Map([...productDims.entries()].map(([k, v]) => [k, { name: v.name, sku: v.sku }])),
      returnsDetail: ctx.returnsDetail,
      approvedReviewsByProduct: ctx.approvedReviewsByProduct,
      settings: {
        returnRateAlarmPct: parseNumSetting(settings, "faz2.quality.return_rate_alarm_pct"),
        minUnits: parseNumSetting(settings, "faz2.quality.min_units"),
      },
    });
  });
}

export async function getProcurementAnalysis(): Promise<ProcurementAnalysis> {
  const settings = await getFaz2Settings();
  const periodDays = 90; // analiz penceresi (ürün hızı dönemsel)
  return cached(`commercial:procurement:${periodDays}`, async () => {
    const { ctx, lastSaleByProduct, productDims } = await loadCommon(periodDays);
    return analyzeProcurement({
      bundle: ctx.bundle,
      salesByProduct: ctx.salesByProduct,
      inventory: ctx.availableStockByProduct,
      suppliers: ctx.supplierContexts,
      productDims: new Map([...productDims.entries()].map(([k, v]) => [k, { name: v.name, sku: v.sku, buyPrice: v.buyPrice, categoryId: v.categoryId }])),
      lastSaleByProduct,
      settings: {
        periodDays,
        deadStockDays: parseNumSetting(settings, "faz2.procurement.dead_stock_days"),
        reorderCoverDays: parseNumSetting(settings, "faz2.procurement.reorder_cover_days"),
      },
    });
  });
}

/* ---------------- ORTAK ANALİZ ÇALIŞTIRMA ---------------- */

export interface CommercialRunResult {
  startedAt: string;
  finishedAt: string;
  modules: Array<{ module: string; status: string; opportunitiesGenerated: number; durationMs: number }>;
  upserted: { created: number; updated: number };
  expired: number;
  totalOpenEstimatedProfitImpact: number;
  note: string | null;
}

export async function runCommercialAnalysis(actor: string): Promise<CommercialRunResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const expired = await expireStaleOpportunities(actor);

  const moduleRuns: Array<{ module: string; status: string; opportunitiesGenerated: number; durationMs: number }> = [];
  const allDrafts: Array<{ source: string; draft: import("./core/commercial-opportunity-engine").BuiltOpportunity; status: string }> = [];

  const time = async <T>(module: string, fn: () => Promise<{ dataQuality: { status: string }; opportunities: import("./core/commercial-opportunity-engine").BuiltOpportunity[] }>): Promise<void> => {
    const s = Date.now();
    try {
      const res = await fn();
      for (const draft of res.opportunities) allDrafts.push({ source: module, draft, status: res.dataQuality.status });
      moduleRuns.push({ module, status: res.dataQuality.status, opportunitiesGenerated: res.opportunities.length, durationMs: Date.now() - s });
    } catch (err) {
      console.error(`[commercial:${module}]`, err);
      moduleRuns.push({ module, status: "ERROR", opportunitiesGenerated: 0, durationMs: Date.now() - s });
    }
  };

  await time("pricing", () => getPricingAnalysis());
  await time("campaigns", () => getCampaignAnalysis());
  await time("basket", () => getBasketAnalysis());
  await time("suppliers", () => getSupplierAnalysis());
  await time("quality", () => getQualityAnalysis());
  await time("procurement", () => getProcurementAnalysis());

  let created = 0, updated = 0;
  for (const { draft } of allDrafts) {
    const res = await upsertOpportunity(draft, actor);
    if (res.created) created += 1; else updated += 1;
  }

  const openRows = await db
    .select({ v: commercialOpportunities.estimatedProfitImpact })
    .from(commercialOpportunities)
    .where(inArray(commercialOpportunities.status, OPEN_STATUSES));
  const totalOpenEstimatedProfitImpact = r2(openRows.reduce((s, r) => s + n(r.v), 0));

  await writeAudit("COMMERCIAL_ANALYSIS_RUN", "all", `Ticari optimizasyon analizi çalıştırıldı: ${created} yeni, ${updated} güncellenen, ${expired} süresi dolan fırsat`, actor);

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    modules: moduleRuns,
    upserted: { created, updated },
    expired,
    totalOpenEstimatedProfitImpact,
    note: allDrafts.length === 0 ? "Hiç fırsat üretilmedi — veriler yetersiz ya da eşikler aşılmadı (uydurma üretilmez)." : null,
  };
}

/* ---------------- FIRSAT HAVUZU SORGULARI ---------------- */

export interface OpportunityListItem {
  id: number;
  opportunityKey: string;
  opportunityType: string;
  title: string;
  description: string;
  sourceModule: string;
  severity: string;
  status: string;
  confidenceScore: number;
  dataCoverage: number;
  priorityScore: number;
  estimatedRevenueImpact: number;
  estimatedProfitImpact: number;
  estimatedCostSaving: number;
  estimatedCashImpact: number;
  relatedProductId: number | null;
  relatedSupplierId: number | null;
  relatedCampaignId: number | null;
  ownerName: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

const toItem = (r: typeof commercialOpportunities.$inferSelect): OpportunityListItem => ({
  id: r.id,
  opportunityKey: r.opportunityKey,
  opportunityType: r.opportunityType,
  title: r.title,
  description: r.description,
  sourceModule: r.sourceModule,
  severity: r.severity,
  status: r.status,
  confidenceScore: n(r.confidenceScore),
  dataCoverage: n(r.dataCoverage),
  priorityScore: n(r.priorityScore),
  estimatedRevenueImpact: n(r.estimatedRevenueImpact),
  estimatedProfitImpact: n(r.estimatedProfitImpact),
  estimatedCostSaving: n(r.estimatedCostSaving),
  estimatedCashImpact: n(r.estimatedCashImpact),
  relatedProductId: r.relatedProductId,
  relatedSupplierId: r.relatedSupplierId,
  relatedCampaignId: r.relatedCampaignId,
  ownerName: r.ownerName,
  createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date(r.createdAt).toISOString(),
  updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : new Date(r.updatedAt).toISOString(),
  expiresAt: r.expiresAt ? (r.expiresAt instanceof Date ? r.expiresAt.toISOString() : new Date(r.expiresAt).toISOString()) : null,
});

export async function listOpportunities(filters: {
  status?: string[];
  type?: string;
  sourceModule?: string;
  limit: number;
  offset: number;
}): Promise<{ items: OpportunityListItem[]; total: number }> {
  const conds = [];
  if (filters.status?.length) conds.push(inArray(commercialOpportunities.status, filters.status));
  if (filters.type) conds.push(eq(commercialOpportunities.opportunityType, filters.type));
  if (filters.sourceModule) conds.push(eq(commercialOpportunities.sourceModule, filters.sourceModule));
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select()
    .from(commercialOpportunities)
    .where(where)
    .orderBy(desc(commercialOpportunities.priorityScore), desc(commercialOpportunities.createdAt))
    .limit(filters.limit)
    .offset(filters.offset);
  const [countRow] = await db.select({ c: sql<number>`count(*)` }).from(commercialOpportunities).where(where);
  return { items: rows.map(toItem), total: Number(countRow?.c ?? 0) };
}

export async function getOpportunityDetail(id: number) {
  const [row] = await db.select().from(commercialOpportunities).where(eq(commercialOpportunities.id, id)).limit(1);
  if (!row) return null;
  const history = await db
    .select()
    .from(opportunityHistory)
    .where(eq(opportunityHistory.opportunityId, id))
    .orderBy(desc(opportunityHistory.createdAt))
    .limit(50);
  const impacts = await db
    .select()
    .from(opportunityImpactResults)
    .where(eq(opportunityImpactResults.opportunityId, id))
    .orderBy(desc(opportunityImpactResults.measuredAt))
    .limit(10);
  return {
    item: toItem(row),
    evidence: safeJsonParse(row.evidence),
    assumptions: safeJsonParse(row.assumptions),
    calculationMethod: row.calculationMethod,
    recommendedAction: row.recommendedAction,
    history: history.map((h) => ({
      id: h.id, action: h.action, fromStatus: h.fromStatus, toStatus: h.toStatus, details: h.details,
      actorName: h.actorName,
      createdAt: h.createdAt instanceof Date ? h.createdAt.toISOString() : new Date(h.createdAt).toISOString(),
    })),
    impacts: impacts.map((i) => ({
      id: i.id,
      expectedProfitImpact: n(i.expectedProfitImpact),
      actualProfitImpact: n(i.actualProfitImpact),
      realizationRate: i.realizationRate != null ? n(i.realizationRate) : null,
      evaluationWindowStart: i.evaluationWindowStart,
      evaluationWindowEnd: i.evaluationWindowEnd,
      note: i.note,
      measuredBy: i.measuredBy,
      measuredAt: i.measuredAt instanceof Date ? i.measuredAt.toISOString() : new Date(i.measuredAt).toISOString(),
    })),
  };
}

function safeJsonParse(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [s];
  }
}

/* ---------------- YAŞAM DÖNGÜSÜ ---------------- */

const TRANSITIONS: Record<string, { from: OpportunityStatus[]; to: OpportunityStatus; action: string }> = {
  review: { from: ["NEW"], to: "UNDER_REVIEW", action: "REVIEWED" },
  approve: { from: ["NEW", "UNDER_REVIEW"], to: "APPROVED", action: "APPROVED" },
  reject: { from: ["NEW", "UNDER_REVIEW", "APPROVED", "IN_PROGRESS"], to: "REJECTED", action: "REJECTED" },
  start: { from: ["APPROVED"], to: "IN_PROGRESS", action: "ASSIGNED" }, // aksiyon = uygulama başlangıcı
  cancel: { from: ["NEW", "UNDER_REVIEW", "APPROVED", "IN_PROGRESS"], to: "CANCELLED", action: "CANCELLED" },
  reopen: { from: ["REJECTED", "CANCELLED", "EXPIRED"], to: "NEW", action: "REOPENED" },
};

export async function transitionOpportunity(opts: { id: number; action: string; actor: string; note?: string; ownerName?: string }) {
  const t = TRANSITIONS[opts.action];
  if (!t) throw new Error("Geçersiz aksiyon.");
  const [row] = await db.select().from(commercialOpportunities).where(eq(commercialOpportunities.id, opts.id)).limit(1);
  if (!row) throw new Error("Fırsat bulunamadı.");
  const from = row.status as OpportunityStatus;
  if (!t.from.includes(from)) {
    throw new Error(`"${from}" durumundan "${opts.action}" yapılamaz.`);
  }
  const set: Record<string, unknown> = { status: t.to, updatedAt: new Date() };
  if (opts.ownerName) set.ownerName = opts.ownerName;
  await db.update(commercialOpportunities).set(set).where(eq(commercialOpportunities.id, row.id));
  const details = opts.note ? `${t.action}: ${opts.note}` : t.action;
  await logHistory(row.id, t.action, from, t.to, details, opts.actor);
  await writeAudit(`COMMERCIAL_OPPORTUNITY_${t.action}`, row.id, `Fırsat #${row.id}: ${from} → ${t.to}${opts.note ? ` (${opts.note})` : ""}`, opts.actor);
  return { id: row.id, from, to: t.to };
}

export async function completeOpportunityWithImpact(opts: { id: number; actualProfitImpact: number; note?: string; windowStart?: string; windowEnd?: string; actor: string }) {
  return completeOpportunity({
    id: opts.id,
    actualProfitImpact: opts.actualProfitImpact,
    note: opts.note,
    evaluationWindowStart: opts.windowStart,
    evaluationWindowEnd: opts.windowEnd,
    actor: opts.actor,
  });
}

/* ---------------- ÖZET (Dashboard/sekme KPI'ları) ---------------- */

export async function getCommercialSummary() {
  const byStatusRows = await db
    .select({ status: commercialOpportunities.status, c: sql<number>`count(*)`, profit: sql<number>`coalesce(sum(${commercialOpportunities.estimatedProfitImpact}),0)`, cash: sql<number>`coalesce(sum(${commercialOpportunities.estimatedCashImpact}),0)` })
    .from(commercialOpportunities)
    .groupBy(commercialOpportunities.status);
  const counts: Record<string, number> = {};
  let openProfit = 0, openCash = 0, openCount = 0;
  for (const r of byStatusRows) {
    counts[r.status] = Number(r.c);
    if (OPEN_STATUSES.includes(r.status as OpportunityStatus)) {
      openCount += Number(r.c);
      openProfit += n(r.profit);
      openCash += n(r.cash);
    }
  }
  const topRows = await db
    .select()
    .from(commercialOpportunities)
    .where(inArray(commercialOpportunities.status, OPEN_STATUSES))
    .orderBy(desc(commercialOpportunities.priorityScore), desc(commercialOpportunities.createdAt))
    .limit(5);
  const recentCompleted = await db
    .select({
      id: opportunityImpactResults.opportunityId,
      realizationRate: opportunityImpactResults.realizationRate,
      actualProfitImpact: opportunityImpactResults.actualProfitImpact,
      measuredAt: opportunityImpactResults.measuredAt,
    })
    .from(opportunityImpactResults)
    .orderBy(desc(opportunityImpactResults.measuredAt))
    .limit(5);
  const byModuleRows = await db
    .select({ m: commercialOpportunities.sourceModule, c: sql<number>`count(*)` })
    .from(commercialOpportunities)
    .where(inArray(commercialOpportunities.status, OPEN_STATUSES))
    .groupBy(commercialOpportunities.sourceModule);
  return {
    generatedAt: new Date().toISOString(),
    openCount,
    openEstimatedProfitImpact: r2(openProfit),
    openEstimatedCashImpact: r2(openCash),
    countsByStatus: counts,
    openByModule: Object.fromEntries(byModuleRows.map((r) => [r.m, Number(r.c)])),
    topPriorities: topRows.map(toItem),
    recentCompleted: recentCompleted.map((r) => ({
      opportunityId: r.id,
      realizationRate: r.realizationRate != null ? n(r.realizationRate) : null,
      actualProfitImpact: n(r.actualProfitImpact),
      measuredAt: r.measuredAt instanceof Date ? r.measuredAt.toISOString() : new Date(r.measuredAt).toISOString(),
    })),
    terminalStatuses: TERMINAL_STATUSES,
  };
}

/* ---------------- REKLAM (manuel giriş) ---------------- */

export async function listAdvertising() {
  const rows = await db.select().from(advertisingPerformance).orderBy(desc(advertisingPerformance.createdAt));
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    channel: a.channel,
    spend: n(a.spend),
    impressions: a.impressions,
    clicks: a.clicks,
    conversions: a.conversions,
    revenueAttributed: n(a.revenueAttributed),
    startsOn: a.startsOn,
    endsOn: a.endsOn,
    enteredBy: a.enteredBy,
    notes: a.notes,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : new Date(a.createdAt).toISOString(),
  }));
}

const AD_CHANNELS = ["GOOGLE_ADS", "META_ADS", "INSTAGRAM", "TIKTOK", "E_MAIL", "FLYER", "OTHER"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function addAdvertising(input: Record<string, unknown>, actor: string) {
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("Reklam adı zorunlu.");
  const channel = String(input.channel ?? "OTHER").toUpperCase();
  if (!(AD_CHANNELS as readonly string[]).includes(channel)) throw new Error("Geçersiz kanal.");
  const numField = (key: string, min = 0) => {
    const v = Number(input[key] ?? 0);
    if (!Number.isFinite(v) || v < min) throw new Error(`${key} geçersiz (≥ ${min} sayı olmalı).`);
    return v;
  };
  const spend = numField("spend");
  const impressions = Math.round(numField("impressions"));
  const clicks = Math.round(numField("clicks"));
  const conversions = Math.round(numField("conversions"));
  const revenueAttributed = numField("revenueAttributed");
  const startsOn = String(input.startsOn ?? "").trim();
  if (!DATE_RE.test(startsOn)) throw new Error("startsOn YYYY-MM-DD olmalı.");
  const endsOnRaw = input.endsOn == null || input.endsOn === "" ? null : String(input.endsOn).trim();
  if (endsOnRaw && !DATE_RE.test(endsOnRaw)) throw new Error("endsOn YYYY-MM-DD olmalı.");
  if (endsOnRaw && endsOnRaw < startsOn) throw new Error("endsOn, startsOn'dan önce olamaz.");
  const notesRaw = input.notes == null ? null : String(input.notes).trim().slice(0, 500);
  const [inserted] = await db
    .insert(advertisingPerformance)
    .values({ name, channel, spend: String(r2(spend)), impressions, clicks, conversions, revenueAttributed: String(r2(revenueAttributed)), startsOn, endsOn: endsOnRaw, enteredBy: actor, notes: notesRaw })
    .returning({ id: advertisingPerformance.id });
  await writeAudit("ADVERTISING_ENTRY_ADDED", inserted.id, `Reklam girdisi: "${name}" (${channel}) spend ${r2(spend)} TL`, actor);
  return { id: inserted.id };
}

export async function deleteAdvertising(id: number, actor: string) {
  const [row] = await db.select().from(advertisingPerformance).where(eq(advertisingPerformance.id, id)).limit(1);
  if (!row) throw new Error("Kayıt bulunamadı.");
  await db.delete(advertisingPerformance).where(eq(advertisingPerformance.id, id));
  await writeAudit("ADVERTISING_ENTRY_REMOVED", id, `Reklam girdisi silindi: "${row.name}"`, actor);
  return { id };
}

