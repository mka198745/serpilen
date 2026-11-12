/**
 * FAZ 11 — AI YÖNETİM ASİSTANI
 * -----------------------------
 * Kural tabanlı (rule-based) istatistiksel analitik motoru.
 *
 * ⚠️  GUARDRAIL PRENSİBİ (Master Prompt Madde 69):
 *     - AI yalnızca ÖNERİ üretir; fiyat, stok, sipariş veya muhasebe kaydı DEĞİŞTİRMEZ.
 *     - Akış: Öner → Önizle → Kullanıcı Onayı → İşlem (İşlem butonları kullanıcıya aittir)
 *     - Hiçbir fonksiyon db.insert/update/delete ile kritik veri yazmaz (sadece okur).
 */

import { db } from "@/db";
import {
  orders,
  orderItems,
  products,
  productVariants,
  categories,
  brands,
  customers,
  inventory,
  warehouses,
  suppliers,
  orderReturns,
  promotions,
} from "@/db/schema";
import { desc, eq } from "drizzle-orm";

/* ------------------------------------------------------------------ *
 *  YARDIMCI HESAPLAMALAR
 * ------------------------------------------------------------------ */

const DAY = 86400000;

function daysAgo(n: number) {
  return new Date(Date.now() - n * DAY);
}

function fmt(n: number, digits = 2) {
  return Number(n.toFixed(digits)).toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pct(a: number, b: number) {
  if (b === 0) return a > 0 ? 100 : 0;
  return Number(((a - b) / Math.abs(b)) * 100).toFixed(1);
}

function linearRegression(values: number[]) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0 };
  const sumX = values.reduce((s, _, i) => s + i, 0);
  const sumY = values.reduce((s, y) => s + y, 0);
  const sumXY = values.reduce((s, y, i) => s + i * y, 0);
  const sumX2 = values.reduce((s, _, i) => s + i * i, 0);
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/* ------------------------------------------------------------------ *
 *  1) AI SATIŞ ANALİSTİ
 * ------------------------------------------------------------------ */
export interface SalesInsight {
  headline: string;
  kpis: { label: string; value: string; tone: "good" | "bad" | "neutral" }[];
  channelBreakdown: Array<{ channel: string; count: number; revenue: number; share: number }>;
  growth: { period: string; current: number; previous: number; changePercent: number; direction: "UP" | "DOWN" | "FLAT" };
  forecast: { next7Days: number; trend: string; dailyAverage: number };
  topProducts: Array<{ name: string; qty: number; revenue: number; margin?: number }>;
  bestDay: { date: string; revenue: number } | null;
  insights: string[];
  recommendations: string[];
  confidence: number;
}

export async function analyzeSales(): Promise<SalesInsight> {
  const allOrders = await db.select().from(orders);
  const allItems = await db.select().from(orderItems);
  const allProds = await db.select().from(products);

  const valid = allOrders.filter((o) => !["CANCELLED"].includes(o.status));
  const revenue = valid.reduce((s, o) => s + Number(o.grandTotal), 0);

  // Kanal kırılımı
  const channelDefs = [
    { key: "POS", label: "Fiziki Mağaza (POS)" },
    { key: "ONLINE_B2C", label: "Online E-Ticaret (B2C)" },
  ];
  const channelBreakdown = channelDefs.map((c) => {
    const list = valid.filter((o) => o.orderType === c.key);
    const rev = list.reduce((s, o) => s + Number(o.grandTotal), 0);
    return { channel: c.label, count: list.length, revenue: Number(rev.toFixed(2)), share: revenue ? Number(((rev / revenue) * 100).toFixed(1)) : 0 };
  });

  // Büyüme: son 14 gün vs önceki 14 gün
  const last14 = valid.filter((o) => new Date(o.createdAt) >= daysAgo(14));
  const prev14 = valid.filter((o) => new Date(o.createdAt) >= daysAgo(28) && new Date(o.createdAt) < daysAgo(14));
  const last14Rev = last14.reduce((s, o) => s + Number(o.grandTotal), 0);
  const prev14Rev = prev14.reduce((s, o) => s + Number(o.grandTotal), 0);
  const change = Number(pct(last14Rev, prev14Rev));

  // Günlük seriler & regresyon tahmini
  const byDay: Record<string, number> = {};
  for (const o of valid) {
    const d = new Date(o.createdAt).toISOString().slice(0, 10);
    byDay[d] = (byDay[d] || 0) + Number(o.grandTotal);
  }
  const dailySeries = Object.values(byDay);
  const dailyAvg = dailySeries.length ? dailySeries.reduce((s, x) => s + x, 0) / dailySeries.length : 0;
  const { slope } = linearRegression(dailySeries);
  const next7 = Math.max(0, (dailyAvg + slope * 3.5) * 7);

  // En iyi gün
  const bestEntry = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];

  // En çok satanlar + marj
  const prodAgg = new Map<number, { qty: number; revenue: number; cost: number }>();
  for (const it of allItems) {
    const cur = prodAgg.get(it.productId) || { qty: 0, revenue: 0, cost: 0 };
    cur.qty += it.quantity;
    cur.revenue += Number(it.totalPrice);
    cur.cost += Number(allProds.find((p) => p.id === it.productId)?.buyPrice || 0) * it.quantity;
    prodAgg.set(it.productId, cur);
  }
  const topProducts = [...prodAgg.entries()]
    .map(([pid, v]) => {
      const p = allProds.find((x) => x.id === pid);
      return { name: p?.name || "?", qty: v.qty, revenue: Number(v.revenue.toFixed(2)), margin: v.revenue ? Number((((v.revenue - v.cost) / v.revenue) * 100).toFixed(1)) : 0 };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const avgBasket = valid.length ? revenue / valid.length : 0;
  const posShare = channelBreakdown[0].share;

  // AI içgörüleri (kural tabanlı)
  const insights: string[] = [];
  if (change > 10) insights.push(`Son 14 günde ciro bir önceki 14 güne göre **%${change} arttı** — pozitif büyüme momentumu sürüyor.`);
  else if (change < -10) insights.push(`Son 14 günde ciro **%${Math.abs(change)} düştü** — kampanya yoğunlaştırma ve e-posta pazarlaması önerilir.`);
  else insights.push(`Ciro son dönemde **dengeli (%${change} değişim)** seyrediyor.`);

  if (posShare >= 40) insights.push(`Fiziki mağaza POS satışları **%${posShare}** ağırlıkta. Kasa çapraz satış (Ürün öneri ekranı) sepet ortalamasını yükseltir.`);
  if (avgBasket > 0 && avgBasket < 500) insights.push(`Ortalama sepet **${fmt(avgBasket)} TL**. Sepet tamamlayıcı ürünleri (iplik + iğne + makas setleri) önerilere eklenerek 600 TL üzerine çıkartılabilir.`);
  if (bestEntry) insights.push(`En güçlü ciro günü **${bestEntry[0]} (${fmt(Number(bestEntry[1]))} TL)**. Bu günün haftalık tekrarını (ör. Cumartesi) kampanya günü yapmak mümkün.`);

  const recommendations: string[] = [];
  const worstChannel = [...channelBreakdown].sort((a, b) => a.revenue - b.revenue)[0];
  if (worstChannel && worstChannel.revenue === 0) recommendations.push(`**${worstChannel.channel}** kanalı bu dönemde ciro üretmedi. Kanal aktivasyon kampanyası planlanmalı.`);
  if (topProducts[0]) recommendations.push(`**${topProducts[0].name}** en yüksek ciroyu üretiyor — stok güvenlik seviyesi yükseltilmeli ve vitrin öne çıkanlara alınmalı.`);
  const lowMargin = topProducts.filter((p) => (p.margin ?? 0) < 20);
  if (lowMargin.length) recommendations.push(`**${lowMargin[0].name}** marjı %${lowMargin[0].margin} ile düşük. Tedarikçi müzakeresi veya fiyat revizyonu önerilir.`);
  if (dailyAvg > 0) recommendations.push(`Günlük ortalama ${fmt(dailyAvg)} TL ciro hedefiyle, bu ay **${fmt(dailyAvg * 30, 0)} TL** ay sonu tahmini oluşmaktadır.`);

  const direction: "UP" | "DOWN" | "FLAT" = change > 5 ? "UP" : change < -5 ? "DOWN" : "FLAT";

  return {
    headline: `${valid.length} işlemde toplam **${fmt(revenue)} TL** ciro gerçekleşti. Ortalama sepet ${fmt(avgBasket)} TL.`,
    kpis: [
      { label: "Toplam Ciro", value: `${fmt(revenue)} TL`, tone: "neutral" },
      { label: "Ortalama Sepet", value: `${fmt(avgBasket)} TL`, tone: avgBasket > 500 ? "good" : "neutral" },
      { label: "14 Günlük Değişim", value: `%${change > 0 ? "+" : ""}${change}`, tone: change > 0 ? "good" : change < 0 ? "bad" : "neutral" },
      { label: "Ay Sonu Tahmini", value: `${fmt(dailyAvg * 30, 0)} TL`, tone: "neutral" },
    ],
    channelBreakdown,
    growth: { period: "Son 14 gün vs Önceki 14 gün", current: Number(last14Rev.toFixed(2)), previous: Number(prev14Rev.toFixed(2)), changePercent: change, direction },
    forecast: { next7Days: Number(next7.toFixed(2)), trend: slope > 0.5 ? "Yükseliş" : slope < -0.5 ? "Düşüş" : "Yatay", dailyAverage: Number(dailyAvg.toFixed(2)) },
    topProducts,
    bestDay: bestEntry ? { date: bestEntry[0], revenue: Number(Number(bestEntry[1]).toFixed(2)) } : null,
    insights,
    recommendations,
    confidence: Math.min(95, 55 + Math.min(30, valid.length * 2) + (dailySeries.length > 3 ? 10 : 0)),
  };
}

/* ------------------------------------------------------------------ *
 *  2) AI STOK / ENVANTER ASİSTANI
 * ------------------------------------------------------------------ */
export interface StockInsight {
  headline: string;
  criticalCount: number;
  items: Array<{
    productId: number;
    productName: string;
    sku: string;
    warehouseName: string;
    available: number;
    reorderPoint: number;
    dailySales: number;
    daysOfCover: number;
    risk: "CRITICAL" | "HIGH" | "MEDIUM" | "OK";
    suggestedOrderQty: number;
    urgency: string;
  }>;
  overstock: Array<{ productName: string; available: number; daysOfCover: number; tiedCapital: number }>;
  insights: string[];
  recommendations: string[];
}

export async function analyzeInventory(): Promise<StockInsight> {
  const allInv = await db.select().from(inventory);
  const allProds = await db.select().from(products);
  const allWh = await db.select().from(warehouses);
  const allItems = await db.select().from(orderItems);
  const allOrders = await db.select().from(orders);

  const validOrders = allOrders.filter((o) => !["CANCELLED"].includes(o.status));
  const since = daysAgo(30).getTime();
  const recentItems = allItems.filter((it) => {
    const o = validOrders.find((x) => x.id === it.orderId);
    return o && new Date(o.createdAt).getTime() >= since;
  });

  const salesByProduct = new Map<number, number>();
  for (const it of recentItems) salesByProduct.set(it.productId, (salesByProduct.get(it.productId) || 0) + it.quantity);

  const items = allInv
    .map((inv) => {
      const p = allProds.find((x) => x.id === inv.productId);
      if (!p) return null;
      const available = inv.physicalQty - inv.reservedQty;
      const monthly = salesByProduct.get(inv.productId) || 0;
      const daily = monthly / 30;
      const daysOfCover = daily > 0 ? Math.floor(available / daily) : 999;
      const suggestedQty = Math.max(0, inv.maxStock - available);

      let risk: "CRITICAL" | "HIGH" | "MEDIUM" | "OK" = "OK";
      let urgency = "Stok yeterli.";
      if (available <= 0) {
        risk = "CRITICAL";
        urgency = "STOK TÜKENDİ — acil sipariş gerekli!";
      } else if (available <= inv.reorderPoint || daysOfCover < 7) {
        risk = "CRITICAL";
        urgency = `${daysOfCover} gün içinde tükenir.`;
      } else if (daysOfCover < 15) {
        risk = "HIGH";
        urgency = `${daysOfCover} gün stok örtüsü kaldı.`;
      } else if (daysOfCover < 30) {
        risk = "MEDIUM";
        urgency = `${daysOfCover} gün örtü — izlemeye alın.`;
      }

      return {
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        warehouseName: allWh.find((w) => w.id === inv.warehouseId)?.name || "?",
        available: Math.max(0, available),
        reorderPoint: inv.reorderPoint,
        dailySales: Number(daily.toFixed(2)),
        daysOfCover,
        risk,
        suggestedOrderQty: suggestedQty,
        urgency,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.daysOfCover - b.daysOfCover);

  const critical = items.filter((i) => i.risk === "CRITICAL" || i.risk === "HIGH");

  const overstock = allInv
    .map((inv) => {
      const p = allProds.find((x) => x.id === inv.productId);
      if (!p) return null;
      const available = inv.physicalQty - inv.reservedQty;
      const daily = (salesByProduct.get(inv.productId) || 0) / 30;
      const daysOfCover = daily > 0 ? Math.floor(available / daily) : 999;
      return available > inv.maxStock * 0.8 && daysOfCover > 120
        ? {
            productName: p.name,
            available: Math.max(0, available),
            daysOfCover,
            tiedCapital: Number((available * Number(p.buyPrice)).toFixed(2)),
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.tiedCapital - a.tiedCapital)
    .slice(0, 8);

  const insights: string[] = [];
  if (critical.length > 0) {
    insights.push(`**${critical.length} ürün** kritik stok seviyesinde. Bunların toplam önerilen sipariş miktarı **${critical.reduce((s, c) => s + c.suggestedOrderQty, 0)} adet**.`);
    insights.push(`En acil: **${critical[0].productName}** — ${critical[0].urgency}`);
  } else {
    insights.push("Şu anda kritik stok seviyesinde ürün bulunmuyor. Güvenlik stokları yeterli.");
  }
  if (overstock.length > 0) {
    insights.push(`**${overstock.length} kalemde fazla stok** mevcut; toplam **${fmt(overstock.reduce((s, o) => s + o.tiedCapital, 0), 0)} TL** sermaye bağlanmış. Bundle kampanyası ile eritilebilir.`);
  }
  const zeroSales = items.filter((i) => i.dailySales === 0 && i.available > 0);
  if (zeroSales.length > 0) {
    insights.push(`**${zeroSales.length} kalem** son 30 günde hiç satılmamış (ölü stok adayı). Raf konumu ve vitrin görünürlüğü gözden geçirilmeli.`);
  }

  return {
    headline: critical.length
      ? `${critical.length} kalemde tükenme riski tespit edildi. Toplam önerilen sipariş: ${critical.reduce((s, c) => s + c.suggestedOrderQty, 0)} adet.`
      : "Envanter sağlıklı durumda; kritik seviyede ürün yok.",
    criticalCount: critical.length,
    items: items.slice(0, 25),
    overstock,
    insights,
    recommendations: critical.slice(0, 5).map((c) => `**${c.productName}** için **${c.suggestedOrderQty} adet** sipariş önerilir (${c.urgency})`),
  };
}

/* ------------------------------------------------------------------ *
 *  3) AI SATIN ALMA DANIŞMANI
 * ------------------------------------------------------------------ */
export async function recommendPurchases() {
  const stock = await analyzeInventory();
  const allSuppliers = await db.select().from(suppliers).orderBy(desc(suppliers.rating));
  const allProds = await db.select().from(products);

  const needed = stock.items.filter((i) => i.risk === "CRITICAL" || i.risk === "HIGH").slice(0, 12);

  const recommendations = needed.map((n) => {
    const p = allProds.find((x) => x.id === n.productId);
    const supplier = allSuppliers[Math.floor(n.productId % Math.max(1, allSuppliers.length))] || allSuppliers[0];
    const unitCost = Number(p?.buyPrice || 0);
    return {
      productId: n.productId,
      productName: n.productName,
      sku: n.sku,
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name || "Tedarikçi atanmadı",
      leadTimeDays: supplier?.leadTimeDays || 5,
      recommendedQty: n.suggestedOrderQty,
      unitCost: unitCost,
      estimatedCost: Number((n.suggestedOrderQty * unitCost).toFixed(2)),
      daysOfCover: n.daysOfCover,
      priority: n.risk === "CRITICAL" ? "YÜKSEK" : "ORTA",
      reason: n.urgency,
    };
  });

  const totalCost = recommendations.reduce((s, r) => s + r.estimatedCost, 0);

  return {
    headline: `${recommendations.length} kalem için satın alma önerisi üretildi. Tahmini toplam maliyet **${fmt(totalCost)} TL**.`,
    totalEstimatedCost: Number(totalCost.toFixed(2)),
    urgentCount: recommendations.filter((r) => r.priority === "YÜKSEK").length,
    recommendations,
    advice:
      "Öneriler; son 30 günlük satış hızı, mevcut kullanılabilir stok, güvenlik stoğu ve tedarikçi termin süresi (lead time) analiz edilerek oluşturuldu. Yüksek öncelikli kalemler için hemen Satın Alma Talebi oluşturulması önerilir.",
  };
}

/* ------------------------------------------------------------------ *
 *  4) AI CRM ASİSTANI (Segmentasyon & Churn)
 * ------------------------------------------------------------------ */
export interface CustomerInsight {
  headline: string;
  segments: Array<{ segment: string; count: number; totalSpend: number; avgSpend: number; color: string }>;
  churnRisk: Array<{ customerId: number; name: string; type: string; lastOrderDaysAgo: number; totalSpend: number; riskScore: number; action: string }>;
  topCustomers: Array<{ name: string; type: string; totalSpend: number; orderCount: number; segment: string }>;
  vipCount: number;
  churnCount: number;
  insights: string[];
  recommendations: string[];
}

export async function analyzeCustomers(): Promise<CustomerInsight> {
  const allCusts = await db.select().from(customers);
  const allOrdersRaw = await db.select().from(orders);
  const allOrders = allOrdersRaw.filter((o) => !["CANCELLED"].includes(o.status));
  const allReturns = await db.select().from(orderReturns);

  const agg = new Map<number, { orders: number; spend: number; last: Date; returns: number }>();
  for (const o of allOrders) {
    if (!o.customerId) continue;
    const cur = agg.get(o.customerId) || { orders: 0, spend: 0, last: new Date(o.createdAt), returns: 0 };
    cur.orders++;
    cur.spend += Number(o.grandTotal);
    if (new Date(o.createdAt) > cur.last) cur.last = new Date(o.createdAt);
    agg.set(o.customerId, cur);
  }
  for (const r of allReturns) {
    if (agg.has(r.orderId)) agg.get(r.orderId)!.returns++;
  }

  const detail = allCusts.map((c) => {
    const a = agg.get(c.id);
    const lastDays = a ? Math.floor((Date.now() - a.last.getTime()) / DAY) : null;
    const spend = a?.spend || 0;
    const returnRate = a && a.orders ? (a.returns / a.orders) * 100 : 0;

    // Churn skoru (0-100): son sipariş yaşı + düşük sıklık + iade
    let risk = 0;
    if (lastDays === null) risk = 20;
    else if (lastDays > 120) risk = 95;
    else if (lastDays > 90) risk = 85;
    else if (lastDays > 60) risk = 65;
    else if (lastDays > 30) risk = 35;
    else risk = 10;
    if (a && a.orders <= 1) risk += 10;
    if (returnRate > 20) risk += 15;
    risk = Math.min(100, risk);

    const segment =
      spend >= 5000 || (c.segment || "").toUpperCase().includes("VIP")
        ? "VIP"
        : spend >= 1000
        ? "SADIK"
        : lastDays !== null && lastDays > 90
        ? "KAYIP RİSKİ"
        : a?.orders === 1
        ? "YENİ"
        : "AKTİF";

    const action =
      risk >= 70
        ? "Kişisel geri kazanım e-postası + %15 kupon gönderin"
        : risk >= 50
        ? "Sadakat puanı bonusu ile tekrar alışverişi teşvik edin"
        : segment === "VIP"
        ? "Kişisel davetli ön satış (early access) kampanyası"
        : segment === "YENİ"
        ? "İkinci alışveriş için ilk sipariş sonrası kupon"
        : "Sepet tamamlayıcı ürün önerisi gönderin";

    return {
      customerId: c.id,
      name: c.companyName || c.name,
      type: c.type,
      lastOrderDaysAgo: lastDays ?? 999,
      totalSpend: Number(spend.toFixed(2)),
      orderCount: a?.orders || 0,
      avgSpend: a && a.orders ? Number((spend / a.orders).toFixed(2)) : 0,
      riskScore: risk,
      segment,
      action,
    };
  });

  const segmentColors: Record<string, string> = {
    VIP: "#7c3aed",
    SADIK: "#059669",
    AKTİF: "#d97706",
    "YENİ": "#0891b2",
    "KAYIP RİSKİ": "#dc2626",
  };

  const segments = Object.entries(
    detail.reduce((acc: Record<string, { count: number; totalSpend: number }>, d) => {
      if (!acc[d.segment]) acc[d.segment] = { count: 0, totalSpend: 0 };
      acc[d.segment].count++;
      acc[d.segment].totalSpend += d.totalSpend;
      return acc;
    }, {})
  ).map(([seg, v]) => ({
    segment: seg,
    count: v.count,
    totalSpend: Number(v.totalSpend.toFixed(2)),
    avgSpend: v.count ? Number((v.totalSpend / v.count).toFixed(2)) : 0,
    color: segmentColors[seg] || "#78716c",
  }));

  const churnRisk = detail
    .filter((d) => d.riskScore >= 60 && d.totalSpend > 0)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 10);

  const insights: string[] = [];
  const highValueChurn = churnRisk.filter((c) => c.totalSpend > 1000);
  if (highValueChurn.length) {
    insights.push(`**${highValueChurn.length} yüksek değerli müşteri** (toplam harcama 1000 TL+) kayıp riskinde. Öncelikli geri kazanım kampanyası önerilir.`);
  }
  const vipTotal = detail.filter((d) => d.segment === "VIP").reduce((s, d) => s + d.totalSpend, 0);
  const grandTotal = detail.reduce((s, d) => s + d.totalSpend, 0);
  if (grandTotal > 0) {
    insights.push(`VIP segment, toplam ciromuzun **%${Math.round((vipTotal / grandTotal) * 100)}**'ini üretiyor. VIP bakım programı en yüksek ROI sağlar.`);
  }
  const newCount = detail.filter((d) => d.segment === "YENİ").length;
  if (newCount > 0) insights.push(`**${newCount} yeni müşteri** ilk siparişini verdi. 2. sipariş dönüşüm oranı için 7 gün içinde kupon gönderimi kritiktir.`);

  return {
    headline: `${detail.length} müşteri analiz edildi. **${churnRisk.length} müşteri** kayıp riskinde, **${detail.filter((d) => d.segment === "VIP").length} VIP** müşteri mevcut.`,
    segments,
    churnRisk,
    topCustomers: [...detail].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 8),
    vipCount: detail.filter((d) => d.segment === "VIP").length,
    churnCount: churnRisk.length,
    insights,
    recommendations: churnRisk.slice(0, 4).map((c) => `${c.name} (${c.lastOrderDaysAgo} gün önce) → ${c.action}`),
  };
}

/* ------------------------------------------------------------------ *
 *  5) AI ÜRÜN İÇERİK & SEO ASİSTANI
 * ------------------------------------------------------------------ */
const CATEGORY_KEYWORDS: Record<number, string[]> = {
  1: ["dikis ipligi", "polyester iplik", "makine ipligi", "overlok ipligi", "dikis makinesi"],
  2: ["fermuar", "mont fermuari", "metal fermuar", "gizli fermuar", "plastik fermuar"],
  3: ["dugme", "ahsap dugme", "metal dugme", "gomlek dugmesi", "kaban dugmesi"],
  4: ["kurdele", "saten kurdele", "serit", "biye", "paket kurdelesi"],
  5: ["orgu ipi", "el orgusu", "sifsiz orgu", "amigurumi ipi", "battaniye ipi"],
  6: ["terzi makasi", "dikis ignesi", "mezura", "olcu bandi", "dikiş aparatı"],
  7: ["tela", "vatka", "lastik", "cirt cirt", "kitas"],
};

export async function generateProductContent(productId: number, opts?: { tone?: string; keywords?: string[] }) {
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) throw new Error("Ürün bulunamadı");

  const [category] = product.categoryId ? await db.select().from(categories).where(eq(categories.id, product.categoryId)).limit(1) : [null];
  const [brand] = product.brandId ? await db.select().from(brands).where(eq(brands.id, product.brandId)).limit(1) : [null];
  const price = Number(product.retailPrice).toFixed(2);
  const unit = product.unit;

  const baseKeywords = CATEGORY_KEYWORDS[product.categoryId] || ["tuhafiye", "dikis malzemesi", "hobi malzemeleri"];
  const extraKeywords = opts?.keywords || [];
  const keywords = [...new Set([...baseKeywords, ...extraKeywords])];

  const tone = opts?.tone === "professional" ? "profesyonel" : opts?.tone === "friendly" ? "samimi" : "ustalıklı";

  const seoTitle = `${product.name} — ${brand?.name || "Kaliteli"} | ${price} TL | İpek Tuhafiye`.slice(0, 65);

  const metaDescription = `${product.name} ${brand?.name ? `(${brand.name}) ` : ""}İpek Tuhafiye'de ${price} TL. ${product.shortDescription ? product.shortDescription.slice(0, 90) + " " : ""}Aynı gün kargo, %100 orijinal ürün, 14 gün iade hakkı.`.slice(0, 158);

  const seoDescription = [
    `${product.name} — ${category?.name || "Tuhafiye"} kategorisinde ${brand?.name ? `${brand.name} güvencesiyle` : "kaliteli üretim"} sunulmaktadır.`,
    product.shortDescription || `${unit} bazında satılır.`,
    `Profesyonel terziler, moda tasarımı öğrencileri ve hobi meraklıları için ideal.`,
    `İpek Tuhafiye'de ${price} TL fiyatıyla aynı gün kargo avantajıyla sipariş verebilirsiniz.`,
    `Anahtar kelimeler: ${keywords.slice(0, 6).join(", ")}.`,
  ].join(" ");

  const suggestedTags = keywords.slice(0, 8).join(",");

  const longDescription = [
    `${product.name} İpek Tuhafiye kalitesiyle.`,
    "",
    `${product.description || product.shortDescription || "Bu ürün, uzun ömürlü kullanım için titizlikle seçilmiş malzemelerden üretilmiştir."}`,
    "",
    `Terzi atölyelerinden moda tasarımcılarına, el işi meraklılarından hobi kurslarına kadar geniş bir kullanıcı kitlesi için ideal bir seçimdir.`,
    "",
    `💡 Neden İpek Tuhafiye?`,
    `• ${brand?.name || "Güvenilir üretici"} onaylı %100 orijinal ürün`,
    `• 30 yılı aşkın tuhafiye sektör tecrübesi`,
    `• Aynı gün kargo ve 14 gün koşulsuz iade hakkı`,
    `• Perakende müşterilerimize özel avantajlar`,
    "",
    `📦 Paket İçeriği: 1 ${unit}`,
    `💰 Fiyat: ${price} TL (KDV dahil)`,
  ].join("\n");

  return {
    productId: product.id,
    productName: product.name,
    tone,
    seoTitle,
    metaDescription,
    seoDescription,
    longDescription,
    suggestedTags,
    keywords,
    category: category?.name || null,
    brand: brand?.name || null,
    // Guardrail: hiçbir veri otomatik yazılmaz, kullanıcı "Uygula" derse PATCH yapılır
    requiresApproval: true,
    message: "Üretilen içerikleri inceleyip onayladıktan sonra 'Uygula' butonu ile ürüne yazabilirsiniz. AI asla otomatik olarak ürün verisini değiştirmez.",
  };
}



/* ------------------------------------------------------------------ *
 *  6) DOĞAL DİL SOHBET MOTORU (Intent Matching)
 * ------------------------------------------------------------------ */
export interface ChatResponse {
  answer: string;
  intent: string;
  suggestions: string[];
  data?: any;
}

export async function chat(message: string): Promise<ChatResponse> {
  const q = (message || "").toLowerCase().trim();
  // Türkçe aksak yazımı toleranslı eşleşme: sorgu ve anahtarlar aynı indirgemeden geçirilir
  const foldTr = (t: string) =>
    t
      .replace(/[âàä]/g, "a")
      .replace(/[îï]/g, "i")
      .replace(/[ûü]/g, "u")
      .replace(/[ş]/g, "s")
      .replace(/[ğ]/g, "g")
      .replace(/[ı]/g, "i")
      .replace(/[ö]/g, "o")
      .replace(/[ç]/g, "c");
  const qf = foldTr(q);
  const wants = (...keys: string[]) => keys.some((k) => q.includes(k) || qf.includes(foldTr(k)));

  // --- Commerce Intelligence (FAZ 1) — doğal dil sohbet genişletmesi ---
  if (wants("anomali", "olağan dışı", "anormal", "sıra dışı")) {
    const { loadSalesBundle } = await import("@/lib/intelligence/repositories");
    const { getAnomalies } = await import("@/lib/intelligence/service");
    const bundle = await loadSalesBundle();
    const a = await getAnomalies(bundle);
    const open = a.anomalies.filter((x) => x.status === "OPEN");
    const top = open.slice(0, 3);
    return {
      intent: "intelligence_anomaly",
      answer: open.length
        ? `${open.length} açık anomali tespit ettim (${a.summary.critical} kritik):\n\n${top
            .map((t) => `• ${t.entityLabel} — ${t.metric} ${t.direction === "UP" ? "↑" : "↓"} %${Math.abs(t.deviationPct).toFixed(0)} (${t.severity})`)
            .join("\n")}\n\nDetaylar: AI → Intelligence Center → Anomaly Center. Nedenler olası açıklamalardır, kesin tanı değildir.`
        : "Açık anomali yok. Satış, sepet ve ürün adetlerinde kendi geçmişinize göre olağan dışı sapma bulamadım.",
      suggestions: ["ABC-XYZ analizi", "En kârlı ürünler", "Tahmin doğruluğu", "Satış analizi"],
      data: { open: a.summary.open, critical: a.summary.critical },
    };
  }

  if (wants("kârlılık", "karlılık", "kar marj", "kâr marj", "net marj", "en kârlı", "en karlı", "para kazandır")) {
    const { loadSalesBundle } = await import("@/lib/intelligence/repositories");
    const { computeProfitability } = await import("@/lib/intelligence/profitability/profit-engine");
    const bundle = await loadSalesBundle();
    const r = computeProfitability(bundle, 10);
    const top = r.detections.topContributors.slice(0, 5);
    const total = r.levels.product.reduce((s, p) => s + p.contributionProfit, 0);
    return {
      intent: "intelligence_profit",
      answer: `Katkı kârına göre en kârlı 5 ürün:\n\n${top
        .map((t) => `• ${t.label} — ${fmt(t.contributionProfit)} TL (%${t.contributionMargin ?? "n/a"} marj, ${t.status})`)
        .join("\n")}\n\nToplam ürün katkı kârı: ${fmt(total)} TL.\n⚠️ Komisyon/kargo/paket/reklam şemada yok → sonuçlar değişken maliyetsizdir (PARTIAL). Maliyeti eksik ürünler uydurma marj göstermez.`,
      suggestions: ["Negatif marjlı ürünler", "ABC-XYZ analizi", "Tahmin doğruluğu", "Satış analizi"],
      data: { top: top.map((t) => ({ label: t.label, contributionProfit: t.contributionProfit })) },
    };
  }

  if (wants("abc xyz", "abc-xyz", "abc analizi", "xyz analizi", "abc/xyz")) {
    const { loadSalesBundle } = await import("@/lib/intelligence/repositories");
    const { computeAbcXyz } = await import("@/lib/intelligence/inventory/abc-xyz");
    const bundle = await loadSalesBundle();
    const r = computeAbcXyz(bundle, {});
    const ax = r.rows.filter((x) => x.composite === "AX").length;
    const cz = r.rows.filter((x) => x.composite === "CZ").length;
    const stockout = r.rows.filter((x) => x.risk === "STOCKOUT").length;
    return {
      intent: "intelligence_abcxyz",
      answer: `ABC-XYZ özeti (${r.rows.length} ürün):\n\n• AX (yüksek değer, düzenli): ${ax} ürün — sıkı reorder\n• CZ (düşük değer, düzensiz): ${cz} ürün — alım sınırlandırma\n• Stok-out riski: ${stockout} ürün\n\nAyrıntılı matris ve aksiyon kartları: AI → Intelligence Center → ABC-XYZ.`,
      suggestions: ["En kârlı ürünler", "Ölü stoklar", "Satın alma önerisi", "Anomali taraması"],
      data: { ax, cz, stockout },
    };
  }

  if (wants("rfm", "champions", "sadık müşteri", "sadakat segment", "müşteri segment")) {
    const { loadSalesBundle } = await import("@/lib/intelligence/repositories");
    const { computeRfm } = await import("@/lib/intelligence/customers/rfm-engine");
    const { getIntelligenceSettings } = await import("@/lib/intelligence/service");
    const bundle = await loadSalesBundle();
    const settings = await getIntelligenceSettings();
    const r = computeRfm(bundle, Number(settings["rfm.period_days"]) || 365);
    const top = r.segments.slice(0, 5);
    return {
      intent: "intelligence_rfm",
      answer: `RFM segment dağılımı (${r.customerCount} müşteri, son ${r.periodDays} gün):\n\n${top
        .map((t) => `• ${t.segment}: ${t.count} müşteri — ${fmt(t.monetary)} TL`)
        .join("\n")}\n${r.sampleWarning ? `\n⚠️ ${r.sampleWarning}` : ""}\nTekrar alışveriş oranı: %${r.kpis.repeatPurchaseRate ?? "n/a"}.`,
      suggestions: ["Churn riskli müşteriler", "Kohort analizi", "Müşteri analizi", "VIP müşteriler"],
      data: { segments: r.segments, customerCount: r.customerCount },
    };
  }

  if (wants("kohort", "cohort", "retention", "elde tutma")) {
    const { loadSalesBundle } = await import("@/lib/intelligence/repositories");
    const { computeCohorts } = await import("@/lib/intelligence/customers/cohort-engine");
    const bundle = await loadSalesBundle();
    const r = computeCohorts(bundle);
    const latest = r.cohorts.slice(-3);
    return {
      intent: "intelligence_cohort",
      answer: latest.length
        ? `Son cohort'lar (ilk alışveriş ayına göre):\n\n${latest
            .map((c) => `• ${c.cohort}: ${c.size} müşteri — ay 1 retention %${c.retention[1] ?? "n/a"}, ay 3 %${c.retention[3] ?? "n/a"}`)
            .join("\n")}\n\nDetaylı ısı haritası: AI → Intelligence Center → Cohort.`
        : "Yeterli müşteri geçmişi yok — cohort matrisi oluşturamadım.",
      suggestions: ["RFM segmentleri", "Müşteri analizi", "Churn riskli müşteriler", "VIP müşteriler"],
      data: { cohorts: latest },
    };
  }

  if (wants("tahmin doğruluğu", "wape", "mape", "backtest", "model karşılaştır")) {
    const { loadSalesBundle } = await import("@/lib/intelligence/repositories");
    const { getAccuracy } = await import("@/lib/intelligence/service");
    const bundle = await loadSalesBundle();
    const r = await getAccuracy(bundle);
    const eligible = r.models.filter((m) => m.eligible && m.wape != null).slice(0, 4);
    return {
      intent: "intelligence_accuracy",
      answer: eligible.length
        ? `Walk-forward backtest (mağaza geneli, örneklem ${r.storeSampleSize} gün):\n\n${eligible
            .map((m) => `• ${m.label}: WAPE %${m.wape}, RMSE ${m.rmse}`)
            .join("\n")}\n\nEn iyi model: **${r.bestModel?.label ?? "n/a"}** (WAPE %${r.bestModel?.wape ?? "n/a"}).\n${r.dataQuality === "INSUFFICIENT_DATA" ? "⚠️ Örneklem yetersiz — sonuçları ihtiyatla kullanın." : ""}`
        : `Backtest için yeterli uygun model/örneklem yok (${r.dataQuality}). Daha fazla satış geçmişi gerekir.`,
      suggestions: ["7 gün tahmin", "Anomali taraması", "En kârlı ürünler", "Satış analizi"],
      data: { bestModel: r.bestModel, dataQuality: r.dataQuality },
    };
  }

  if (wants("satış", "ciro", "hasılat", "kâr", "kar", "gelir")) {
    const s = await analyzeSales();
    return {
      intent: "sales",
      answer: `${s.headline}\n\n${s.insights.slice(0, 2).join("\n")}\n\n💡 ${s.recommendations[0] || ""}`,
      suggestions: ["Kritik stokları göster", "En kârlı ürünler", "Kanal dağılımı", "Ay sonu tahmini"],
      data: { kpis: s.kpis, channelBreakdown: s.channelBreakdown },
    };
  }

  if (wants("stok", "kritik", "tüken", "azaldı", "bitiyor")) {
    const s = await analyzeInventory();
    const top = s.items.filter((i) => i.risk === "CRITICAL").slice(0, 3);
    return {
      intent: "inventory",
      answer: `${s.headline}\n\n${s.insights.slice(0, 2).join("\n")}${
        top.length ? "\n\n🔴 Acil: " + top.map((t) => `${t.productName} (${t.available} adet, ${t.daysOfCover} gün)`).join(" · ") : ""
      }`,
      suggestions: ["Satın alma önerisi", "Ölü stoklar", "Fazla stok sermayesi", "Depo bazlı stok"],
      data: { criticalCount: s.criticalCount },
    };
  }

  if (wants("satın alma", "sipariş öner", "tedarikçi", "reorder", "sipariş vereyim")) {
    const s = await recommendPurchases();
    return {
      intent: "purchasing",
      answer: `${s.headline}\n\n${s.recommendations
        .slice(0, 3)
        .map((r) => `• ${r.productName} → ${r.recommendedQty} adet (${r.supplierName}, ${fmt(r.estimatedCost)} TL, ${r.priority})`)
        .join("\n")}`,
      suggestions: ["Satın alma talebi oluştur", "Kritik stoklar", "Tedarikçi karnesi", "Termin süreleri"],
      data: { totalEstimatedCost: s.totalEstimatedCost, urgentCount: s.urgentCount },
    };
  }

  if (wants("müşteri", "churn", "kayıp", "vip", "segment", "bayi", "cari")) {
    const s = await analyzeCustomers();
    return {
      intent: "crm",
      answer: `${s.headline}\n\n${s.insights.slice(0, 2).join("\n")}\n\n${
        s.churnRisk.length ? "⚠️ Riskli: " + s.churnRisk.slice(0, 2).map((c) => `${c.name} (${c.lastOrderDaysAgo} gün)`).join(" · ") : ""
      }`,
      suggestions: ["VIP müşteriler", "Churn riskli müşteriler", "Segment dağılımı", "Geri kazanım kampanyası"],
      data: { segments: s.segments, vipCount: s.vipCount },
    };
  }

  if (wants("kampanya", "indirim", "kupon", "promosyon")) {
    const allPromos = await db.select().from(promotions).orderBy(desc(promotions.id)).limit(5);
    const active = allPromos.filter((p) => p.isActive);
    return {
      intent: "promotion",
      answer: active.length
        ? `Şu anda **${active.length} aktif kampanya** var:\n${active.map((p) => `• ${p.name} — ${p.ruleType.replace(/_/g, " ")}`).join("\n")}\n\nSatış hızına göre yeni kampanya kurmak ister misiniz? "Kampanya öner" yazabilirsiniz.`
        : "Aktif kampanya bulunmuyor. Ciro düşüşü gözlemleniyor ise kategori bazlı %15-20 indirim kampanyası önerilir.",
      suggestions: ["Kampanya öner", "Kupon oluştur", "Aktif kampanyalar", "Sadakat oranı"],
      data: { activeCount: active.length },
    };
  }

  if (wants("kampanya öner", "kampanya tavsiye")) {
    const s = await analyzeSales();
    const inv = await analyzeInventory();
    const over = inv.overstock[0];
    return {
      intent: "campaign_recommendation",
      answer: `Verilere dayalı kampanya önerilerim:\n\n1. ${
        over ? `**${over.productName}** için "2 Al 1 Öde" kampanyası — ${over.tiedCapital} TL bağlı sermayeyi eritir.` : "En çok satan ürün için sepet tamamlayıcı bundle kampanyası."
      }\n2. Ortalama sepet ${fmt(s.forecast.dailyAverage)} TL → **600 TL üzeri 50 TL indirim** ile sepet yükseltme.\n3. ${
        s.channelBreakdown.filter((c) => c.revenue === 0).length
          ? "Boşta kalan kanal için ilk siparişe ücretsiz kargo."
          : "Sadakat puanı 2x kampanyası ile tekrar alışveriş."
      }`,
      suggestions: ["Aktif kampanyalar", "Kupon oluştur", "Ölü stoklar", "Satış analizi"],
      data: null,
    };
  }

  if (wants("tahmin", "gelecek", "önümüzdeki", "ay sonu", "hafta sonu")) {
    const s = await analyzeSales();
    return {
      intent: "forecast",
      answer: `Lineer regresyon tahminim:\n\n• Günlük ortalama: ${fmt(s.forecast.dailyAverage)} TL\n• **Önümüzdeki 7 gün: ${fmt(s.forecast.next7Days)} TL**\n• Trend yönü: **${s.forecast.trend}**\n• Bu tahmin ${s.confidence}% güven aralığındadır.`,
      suggestions: ["Satış analizi", "Kanal dağılımı", "En iyi gün", "Ay sonu hedefi"],
      data: { forecast: s.forecast, confidence: s.confidence },
    };
  }

  if (wants("seo", "içerik", "açıklama", "etiket", "ürün yaz")) {
    return {
      intent: "content",
      answer:
        "Ürün içerik & SEO asistanına geçtim. Hangi ürün için açıklama, meta description ve etiket üretmemi istersiniz? Yönetim paneli → Ürün & Katalog → ilgili ürünün **AI İçerik Üret** butonunu kullanabilirsiniz. Üretilen içerikler onayınız olmadan ürüne yazılmaz.",
      suggestions: ["Satış analizi", "Kritik stoklar", "Müşteri analizi", "Satın alma önerisi"],
      data: null,
    };
  }

  if (wants("yardım", "help", "ne yapabilirsin", "komut")) {
    return {
      intent: "help",
      answer:
        "Merhaba! Ben İpek Tuhafiye AI Asistanıyım. Size şu konularda yardımcı olabilirim:\n\n• 📈 **Satış analizi** — ciro, kanal, trend, tahmin\n• 📦 **Stok analizi** — kritik stok, tükenme tahmini, ölü stok\n• 🛒 **Satın alma önerisi** — tedarikçi + miktar + maliyet\n• 👥 **Müşteri analizi** — segmentasyon, churn riski, LTV\n• 📝 **Ürün içerik** — SEO açıklama, meta, etiket\n• 🎯 **Kampanya önerisi** — verilere dayalı promosyon fikirleri\n\nSadece doğal dilde sorun: \"Bugünkü satışlar nasıl?\" gibi.",
      suggestions: ["Bugünkü satışlar", "Kritik stoklar", "Satın alma önerisi", "VIP müşteriler"],
      data: null,
    };
  }

  // Varsayılan
  return {
    intent: "fallback",
    answer:
      "Sorunuzu tam anlayamadım. Şunları deneyebilirsiniz:\n\n• \"Bugünkü satışlar nasıl?\"\n• \"Hangi ürünlerin stoğu kritik?\"\n• \"Satın alma önerisi ver\"\n• \"VIP müşterilerim kimler?\"\n• \"Bu ay ne kadar ciro yaparız?\"\n\nYazarak deneyin. 🙌",
    suggestions: ["Satış analizi", "Kritik stoklar", "Müşteri analizi", "Yardım"],
    data: null,
  };
}


