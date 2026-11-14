/**
 * CAMPAIGN & ADVERTISING ENGINE — saf hesaplama.
 *
 * Sınırlar (açık):
 * - Sipariş↔kampanya bağı şemada YOKTUR; kampanya analizi (a) promotions sayacı,
 *   (b) satır verisi üzerinden "kampanya penceresi × hedef" eşleştirmesi ile TAHMİNİDİR.
 * - Reklam maliyeti için tek kaynak: `advertising_performance` (manuel giriş).
 *   Girilmemişse ROAS/ROI/CAC HESAPLANMAZ — uydurulmaz.
 * - İndirim etkisi KDV hariç satır geliri üzerindedir.
 */
import { roas, cac, roiPct } from "../core/financial-calculator";
import { buildOpportunity } from "../core/commercial-opportunity-engine";
import type { BuiltOpportunity } from "../core/commercial-opportunity-engine";
import { combinedConfidence } from "../core/confidence-engine";
import { financialImpactScale } from "../core/priority-score";
import { isValidOrder, type OrderItemRow, type OrderRow, type ProductDim } from "../../types";
import type { PromotionRow, AdvertisingRow } from "../data-prep";

export interface CampaignSettings {
  advertisingRoasAlarm: number;  // bu ROAS'ın altı kayıp sinyali
  advertisingMinSpend: number;   // değerlendirme için asgari spend
  highRoasForScaleUp: number;    // bu ROAS üstü "bütçeyi büyüt" fırsatı
  minConversionsForScaleUp: number;
}

export const DEFAULT_CAMPAIGN_SETTINGS: CampaignSettings = {
  advertisingRoasAlarm: 1.0,
  advertisingMinSpend: 100,
  highRoasForScaleUp: 2.0,
  minConversionsForScaleUp: 5,
};

export interface PromotionInsight {
  id: number;
  name: string;
  ruleType: string;
  scope: string; // "Ürün #id", "Kategori #id", "Marka #id", "Tümü/Eşik"
  isActive: boolean;
  usedCount: number;
  daysRunning: number;
  percentValue: number | null;
  fixedValue: number | null;
  estimatedDiscountCost: number | null; // pencere × hedef satırları üzerinden TAHMİNİ
  flag: "OK" | "EXPIRED_BUT_ACTIVE" | "NEVER_USED" | "HIGH_DISCOUNT" | "NO_SCOPE_WARNING";
}

export interface AdvertisingInsight {
  id: number;
  name: string;
  channel: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueAttributed: number;
  ctr: number | null;   // %
  cvr: number | null;   // %
  cac: number | null;
  roas: number | null;
  estimatedContribution: number | null; // gelir × mağaza katkı oranı (tahmin)
  roiPct: number | null;
  flag: "OK" | "LOSING" | "LOW_SAMPLE" | "SCALE_UP";
}

export interface CampaignAnalysis {
  generatedAt: string;
  settings: CampaignSettings;
  storeAvgContributionPct: number | null; // geçerli satırlar üzerinden
  totals: {
    validOrders: number;
    grossMerchRevenue: number;
    discountTotal: number;
    discountRatioPct: number | null;
    adSpend: number;
    adImpressions: number;
    adClicks: number;
    adConversions: number;
    adRevenueAttributed: number;
    adRoas: number | null;
    activePromotions: number;
    activeCoupons: number;
  };
  promotions: PromotionInsight[];
  coupons: Array<{ id: number; code: string; usedCount: number; usageLimit: number | null; utilizationPct: number | null; isActive: boolean; exhausted: boolean }>;
  advertising: AdvertisingInsight[];
  attributionNote: string;
  dataQuality: { status: "VERIFIED" | "PARTIAL" | "INSUFFICIENT_DATA"; notes: string[] };
  opportunities: BuiltOpportunity[];
}

const n = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (v: number) => Number(v.toFixed(2));
const daysBetween = (a: Date, b: Date) => Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000));

export function analyzeCampaigns(opts: {
  orders: OrderRow[];
  items: OrderItemRow[];
  products: ProductDim[];
  promotions: PromotionRow[];
  coupons: Array<{ id: number; code: string; discountType: string; discountValue: number; usedCount: number; usageLimit: number | null; isActive: boolean; minCartAmount: number | null; maxDiscount: number | null }>;
  advertising: AdvertisingRow[];
  settings?: Partial<CampaignSettings>;
}): CampaignAnalysis {
  const settings: CampaignSettings = { ...DEFAULT_CAMPAIGN_SETTINGS, ...(opts.settings ?? {}) };
  const notes: string[] = [];
  const validOrders = opts.orders.filter(isValidOrder);
  const validOrderIds = new Set(validOrders.map((o) => o.id));
  const validItems = opts.items.filter((i) => validOrderIds.has(i.orderId));
  const productById = new Map(opts.products.map((p) => [p.id, p]));

  const grossMerch = validItems.reduce((s, i) => s + i.totalPrice, 0);
  const discountTotal = validOrders.reduce((s, o) => s + o.discountTotal, 0);
  const discountRatio = grossMerch + discountTotal > 0 ? (discountTotal / (grossMerch + discountTotal)) * 100 : null;

  // Mağaza ortalama katkı oranı: Σ qty×(birim fiyat − alış) / Σ qty×birim fiyat  [KDV hariç]
  let contribNum = 0;
  let contribDen = 0;
  let costKnownLines = 0;
  for (const i of validItems) {
    const p = productById.get(i.productId);
    if (!p || n(p.buyPrice) <= 0) continue;
    costKnownLines += 1;
    contribNum += i.quantity * (i.unitPrice - n(p.buyPrice));
    contribDen += i.quantity * i.unitPrice;
  }
  const storeAvgContributionPct = contribDen > 0 ? r2((contribNum / contribDen) * 100) : null;
  if (costKnownLines < validItems.length) {
    notes.push(`Maliyet kapsanan kalem ${costKnownLines}/${validItems.length}; reklam katkı tahmini yalnızca maliyeti bilinen kalemlere dayanır.`);
  }

  // --- Kampanya sağlığı (TAHMİNİ pencere × hedef atfı) ---
  const now = new Date();
  const promoInsights: PromotionInsight[] = opts.promotions.map((p) => {
    const start = p.startDate ?? now;
    const daysRunning = daysBetween(start, p.endDate && p.endDate < now ? p.endDate : now) + 1;
    let scope = "Tümü/Eşik";
    if (p.productId) scope = `Ürün #${p.productId}`;
    else if (p.categoryId) scope = `Kategori #${p.categoryId}`;
    else if (p.brandId) scope = `Marka #${p.brandId}`;

    // Pencere × hedef üzerinden tahmini indirim maliyeti
    let estimatedDiscountCost: number | null = null;
    const inWindow = (i: OrderItemRow) => {
      const o = validOrders.find((x) => x.id === i.orderId);
      if (!o) return false;
      const t = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
      if (t < start) return false;
      if (p.endDate && t > p.endDate) return false;
      return true;
    };
    const scoped = validItems.filter((i) => {
      if (!inWindow(i)) return false;
      if (p.productId) return i.productId === p.productId;
      if (p.categoryId) return productById.get(i.productId)?.categoryId === p.categoryId;
      if (p.brandId) return productById.get(i.productId)?.brandId === p.brandId;
      return true; // scope'suz kampanyada tüm satırlar (alt sınır değil, kaba üst tahmin)
    });
    if (p.percentValue != null) {
      estimatedDiscountCost = r2(scoped.reduce((s, i) => s + (i.totalPrice * n(p.percentValue)) / 100, 0));
    } else if (p.fixedValue != null) {
      estimatedDiscountCost = r2(scoped.reduce((s, i) => s + Math.min(i.unitPrice * i.quantity, n(p.fixedValue) * i.quantity), 0));
    }

    let flag: PromotionInsight["flag"] = "OK";
    const expiredButActive = p.isActive && p.endDate != null && p.endDate < now;
    if (expiredButActive) flag = "EXPIRED_BUT_ACTIVE";
    else if (p.isActive && daysRunning >= 21 && p.usedCount === 0) flag = "NEVER_USED";
    else if (p.percentValue != null && n(p.percentValue) >= 30) flag = "HIGH_DISCOUNT";
    if (scope === "Tümü/Eşik") flag = flag === "OK" ? "NO_SCOPE_WARNING" : flag;

    return {
      id: p.id,
      name: p.name,
      ruleType: p.ruleType,
      scope,
      isActive: p.isActive,
      usedCount: n(p.usedCount),
      daysRunning,
      percentValue: p.percentValue,
      fixedValue: p.fixedValue,
      estimatedDiscountCost,
      flag,
    };
  });

  // --- Kupon sağlığı ---
  const couponInsights = opts.coupons.map((c) => {
    const utilization = c.usageLimit != null && c.usageLimit > 0 ? r2((n(c.usedCount) / c.usageLimit) * 100) : null;
    const exhausted = c.usageLimit != null && n(c.usedCount) >= c.usageLimit;
    return { id: c.id, code: c.code, usedCount: n(c.usedCount), usageLimit: c.usageLimit ?? null, utilizationPct: utilization, isActive: c.isActive, exhausted };
  });

  // --- Reklam performansı (manuel) ---
  const adInsights: AdvertisingInsight[] = opts.advertising.map((a) => {
    const impressions = Math.max(0, a.impressions);
    const clicks = Math.max(0, a.clicks);
    const conversions = Math.max(0, a.conversions);
    const spend = Math.max(0, a.spend);
    const ctr = impressions > 0 ? r2((clicks / impressions) * 100) : null;
    const cvr = clicks > 0 ? r2((conversions / clicks) * 100) : null;
    const cacV = cac(spend, conversions);
    const roasV = roas(a.revenueAttributed, spend);
    const estContrib = storeAvgContributionPct != null ? r2(a.revenueAttributed * (storeAvgContributionPct / 100)) : null;
    const roi = estContrib != null ? roiPct(estContrib, spend) : null;
    let flag: AdvertisingInsight["flag"] = "OK";
    if (spend >= settings.advertisingMinSpend && conversions < 1) flag = "LOW_SAMPLE";
    else if (roasV != null && roasV < settings.advertisingRoasAlarm && spend >= settings.advertisingMinSpend) flag = "LOSING";
    else if (roasV != null && roasV >= settings.highRoasForScaleUp && conversions >= settings.minConversionsForScaleUp) flag = "SCALE_UP";
    return {
      id: a.id, name: a.name, channel: a.channel, spend: r2(spend), impressions, clicks, conversions,
      revenueAttributed: r2(a.revenueAttributed), ctr, cvr,
      cac: cacV != null ? r2(cacV) : null,
      roas: roasV != null ? r2(roasV) : null,
      estimatedContribution: estContrib,
      roiPct: roi != null ? r2(roi) : null,
      flag,
    };
  });

  const adSpend = opts.advertising.reduce((s, a) => s + Math.max(0, a.spend), 0);
  const adRevenue = opts.advertising.reduce((s, a) => s + Math.max(0, a.revenueAttributed), 0);
  const totals = {
    validOrders: validOrders.length,
    grossMerchRevenue: r2(grossMerch),
    discountTotal: r2(discountTotal),
    discountRatioPct: discountRatio != null ? r2(discountRatio) : null,
    adSpend: r2(adSpend),
    adImpressions: opts.advertising.reduce((s, a) => s + Math.max(0, a.impressions), 0),
    adClicks: opts.advertising.reduce((s, a) => s + Math.max(0, a.clicks), 0),
    adConversions: opts.advertising.reduce((s, a) => s + Math.max(0, a.conversions), 0),
    adRevenueAttributed: r2(adRevenue),
    adRoas: roas(adRevenue, adSpend),
    activePromotions: opts.promotions.filter((p) => p.isActive).length,
    activeCoupons: opts.coupons.filter((c) => c.isActive).length,
  };

  const notesAttribution =
    "Kampanya atfı: sipariş↔kampanya bağı şemada yoktur. İndirim maliyetleri 'kampanya penceresi × hedef ürün/kategori' eşleştirmesiyle TAHMİNİDİR; kupon/promo sayaçları kümülatif gerçek sayılardır.";

  const status: "VERIFIED" | "PARTIAL" | "INSUFFICIENT_DATA" =
    validOrders.length === 0 ? "INSUFFICIENT_DATA"
    : adSpend > 0 ? "PARTIAL" // reklam verisi de manuel olduğu için tam VERIFIED denmez
    : "PARTIAL";
  if (validOrders.length === 0) notes.push("Geçerli sipariş yok — kampanya etkisi hesaplanamaz.");
  if (adSpend === 0) notes.push("Reklam verisi girilmemiş — ROAS/ROI/CAC/CAC gösterilemez (uydurulmaz). Manuel reklam girişi gerekir.");

  // --- Fırsatlar ---
  const opportunities: BuiltOpportunity[] = [];
  const period = { start: daysAgoISO(90), end: new Date().toISOString().slice(0, 10) };

  for (const ad of adInsights) {
    if (ad.flag === "LOSING") {
      const lossSaving = storeAvgContributionPct != null
        ? Math.max(0, ad.spend - ad.revenueAttributed * (storeAvgContributionPct / 100))
        : ad.spend;
      const est = r2(lossSaving);
      opportunities.push(buildOpportunity({
        opportunityKey: `ADVERTISING_OPTIMIZATION|ad:${ad.id}|losing`,
        opportunityType: "ADVERTISING_OPTIMIZATION",
        title: `"${ad.name}" reklam harcaması geri dönmüyor — durdurma değerlendirmesi`,
        description: `Spend ${ad.spend} TL, atfedilen gelir ${ad.revenueAttributed} TL, ROAS ${ad.roas}. Asgari eşik ${settings.advertisingRoasAlarm} altında.`,
        sourceModule: "campaigns",
        relatedCampaignId: null,
        estimatedCostSaving: est,
        estimatedProfitImpact: est,
        confidenceScore: combinedConfidence(80, Math.max(ad.conversions + ad.clicks, 1), 50),
        dataCoverage: storeAvgContributionPct != null ? 70 : 45,
        priorityInputs: {
          financialImpact: financialImpactScale(est, 40000),
          feasibility: 90,
          urgency: 75,
          strategic: 55,
        },
        evidence: [
          `ROAS ${ad.roas} < ${settings.advertisingRoasAlarm} (asgari)`,
          `Spend ${ad.spend} TL · Gelir atfı ${ad.revenueAttributed} TL · Dönüşüm ${ad.conversions}`,
          storeAvgContributionPct != null ? `Mağaza katkı oranı varsayımıyla reklamın katkı maliyeti ≈ ${r2(ad.spend - ad.revenueAttributed * (storeAvgContributionPct / 100))} TL` : "Mağaza katkı oranı ölçülemedi (maliyet verisi eksik)",
        ],
        assumptions: [
          "Atfedilen gelir yönetici girişiyle gelir; platform atfı farklı olabilir.",
          "Katkı payı = maliyeti bilinen geçerli satırlar üzerinden mağaza ortalamasıdır.",
        ],
        calculationMethod: "tasarruf = max(0, spend − atfedilen gelir × mağaza katkı oranı). Veri yoksa spend tamamen tasarruf sayılır.",
        recommendedAction: "Reklamı durdurma veya bütçeyi/krekf metni/hedeflemeyi düzeltme kararı alın; 1 hafta sonra yeniden ölçün.",
        dataPeriodStart: period.start,
        dataPeriodEnd: period.end,
        expiresInDays: 14,
      }));
    }

    if (ad.flag === "SCALE_UP" && storeAvgContributionPct != null) {
      const attributedProfit = ad.revenueAttributed * (storeAvgContributionPct / 100);
      const est = r2(Math.max(0, attributedProfit - ad.spend) * 0.15); // temkinli: %15 hacim artışı varsayımı
      opportunities.push(buildOpportunity({
        opportunityKey: `CAMPAIGN_OPPORTUNITY|ad:${ad.id}|scale_up`,
        opportunityType: "CAMPAIGN_OPPORTUNITY",
        title: `"${ad.name}" kârlı çalışıyor — bütçe artışı adayı`,
        description: `ROAS ${ad.roas} (≥ ${settings.highRoasForScaleUp}), ${ad.conversions} dönüşüm. Bütçe artışı sınırlı ve kademeli olmalı.`,
        sourceModule: "campaigns",
        estimatedRevenueImpact: r2(ad.revenueAttributed * 0.15),
        estimatedProfitImpact: est,
        confidenceScore: combinedConfidence(70, ad.conversions, 30),
        dataCoverage: 65,
        priorityInputs: {
          financialImpact: financialImpactScale(est, 40000),
          feasibility: 70,
          urgency: 40,
          strategic: 70,
        },
        evidence: [
          `ROAS ${ad.roas} ≥ ${settings.highRoasForScaleUp}`,
          `Spend ${ad.spend} TL → gelir atfı ${ad.revenueAttributed} TL`,
          `Dönüşüm ${ad.conversions} · CAC ${ad.cac ?? "n/a"} TL`,
        ],
        assumptions: [
          "Hacim artışı temkinli %15 varsayılır; doygunluk ölçülmemiştir.",
          "ROAS artışla aynı kalmaz — marjinal getiriler düşebilir.",
        ],
        calculationMethod: "kazanç = max(0, gelir × katkı oranı − spend) × %15 hacim artışı varsayımı.",
        recommendedAction: "Bütçeyi %15-25 artırın, 2 hafta sonra ROAS'ı yeniden ölçün; düşüşte geri çekin.",
        dataPeriodStart: period.start,
        dataPeriodEnd: period.end,
        expiresInDays: 30,
      }));
    }
  }

  for (const p of promoInsights) {
    if (p.flag === "EXPIRED_BUT_ACTIVE") {
      opportunities.push(buildOpportunity({
        opportunityKey: `CAMPAIGN_OPPORTUNITY|promotion:${p.id}|expired_still_active`,
        opportunityType: "CAMPAIGN_OPPORTUNITY",
        title: `"${p.name}" kampanyası bitti ama hâlâ aktif`,
        description: "Kampanya bitiş tarihi geçti ancak isActive=true. Beklenmeyen indirimler marjı aşındırıyor olabilir.",
        sourceModule: "campaigns",
        relatedCampaignId: p.id,
        estimatedProfitImpact: 0,
        estimatedCostSaving: 0,
        confidenceScore: 90,
        dataCoverage: 90,
        priorityInputs: { financialImpact: 20, feasibility: 100, urgency: 70, strategic: 40 },
        evidence: ["Kampanya bitiş tarihi geçmiş", "isActive=true"],
        assumptions: ["Aktif kalması sistemsel hata olarak yorumlandı."],
        calculationMethod: "Zamansal kontrol: endDate < now && isActive.",
        recommendedAction: "Kampanyayı pasifleştirin veya bitiş tarihini güncelleyin (yönetici onayıyla).",
        dataPeriodStart: period.start,
        dataPeriodEnd: period.end,
        expiresInDays: 7,
      }));
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    settings,
    storeAvgContributionPct,
    totals,
    promotions: promoInsights,
    coupons: couponInsights,
    advertising: adInsights,
    attributionNote: notesAttribution,
    dataQuality: { status, notes },
    opportunities,
  };
}

function daysAgoISO(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}
