/**
 * Veri köprüsü — FAZ 1 yükleyicisinden (loadSalesBundle) karar motoruna metrik türetir.
 * Hiçbir hesap uydurma içermez; veri yoksa null döner.
 */
import { isValidOrder } from "../types";
import type { SalesBundle } from "../repositories";
import { inventory } from "@/db/schema";
import { db } from "@/db";
import { eq } from "drizzle-orm";

export interface ProductBaselineMetrics {
  price: number | null;
  unitCost: number | null;
  variableCost: number | null;
  dailyUnits: number | null;
  avgDailyRevenue: number | null;
  revenue30d: number | null;
  cost30d: number | null;
  marginPct30d: number | null;
  avgDailyRevenuePerUnit: number | null;
  stockQty: number | null;
  coverDays: number | null;
  orderCount: number;
  returnRatePct: number | null;
  returnCost30d: number | null;
  rfmSegment: string | null;
  abcxyzClass: string | null;
  forecastMapePct: number | null;
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const dayKey = (d: Date | number | string) => new Date(d).toISOString().slice(0, 10);
const r2 = (n: number) => Number(n.toFixed(2));

export function isValid(o: { status: string }) { return isValidOrder(o as Parameters<typeof isValidOrder>[0]); }

/** Tüm bundle'dan ürün bazında metrik üretir (tek geçiş). */
export function productMetricsFromBundle(bundle: SalesBundle, productId: number): ProductBaselineMetrics {
  const product = bundle.products.find((p) => p.id === productId) ?? null;
  const valid = bundle.orders.filter(isValid);
  const orderById = new Map(valid.map((o) => [o.id, o]));
  const items = bundle.items.filter((i) => i.productId === productId && orderById.has(i.orderId));
  const orderCount = new Set(items.map((i) => i.orderId)).size;

  const daily = new Map<string, { units: number; revenue: number; cost: number }>();
  for (const it of items) {
    const o = orderById.get(it.orderId);
    if (!o) continue;
    const day = dayKey(o.createdAt);
    const b = daily.get(day) ?? { units: 0, revenue: 0, cost: 0 };
    const unitCost = product ? num(product.buyPrice) : 0;
    const price = num(it.unitPrice);
    b.units += it.quantity;
    b.revenue += price * it.quantity;
    b.cost += unitCost * it.quantity;
    daily.set(day, b);
  }
  const sorted = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b));
  const last30 = sorted.slice(-30);
  const rev30 = last30.reduce((s, [, v]) => s + v.revenue, 0);
  const cost30 = last30.reduce((s, [, v]) => s + v.cost, 0);
  const units30 = last30.reduce((s, [, v]) => s + v.units, 0);
  const activeDays = Math.max(1, sorted.length);
  const dailyUnits = sorted.length ? units30 / Math.min(30, activeDays) : null;
  const avgDailyRevenue = sorted.length ? rev30 / Math.min(30, activeDays) : null;
  const marginPct30d = rev30 > 0 ? ((rev30 - cost30) / rev30) * 100 : null;

  // Stok + cover
  const stockQty = (bundle.inventory as Array<{ productId: number; physicalQty: number | string; reservedQty: number | string }>)
    .filter((r) => r.productId === productId)
    .reduce((s, r) => s + num(r.physicalQty) - num(r.reservedQty), 0);
  const coverDays = dailyUnits && dailyUnits > 0 ? stockQty / dailyUnits : null;

  // İade oranı: ürünün iade adedi / satılan adet (kabaca; tam eşleme yok)
  const productItemUnit = items.reduce((s, i) => s + i.quantity, 0);
  const returnRatePct = null; // ürün-iade eşlemesi loadSalesBundle'da YOK — uydurulmaz
  void productItemUnit;

  return {
    price: product ? num(product.retailPrice) : null,
    unitCost: product ? num(product.buyPrice) : null,
    variableCost: null,
    dailyUnits,
    avgDailyRevenue,
    revenue30d: rev30 > 0 ? r2(rev30) : null,
    cost30d: cost30 > 0 ? r2(cost30) : null,
    marginPct30d,
    avgDailyRevenuePerUnit: dailyUnits && dailyUnits > 0 ? r2((avgDailyRevenue ?? 0) / dailyUnits) : null,
    stockQty,
    coverDays,
    orderCount,
    returnRatePct,
    returnCost30d: null,
    rfmSegment: null,
    abcxyzClass: null,
    forecastMapePct: null,
  };
}

/** Genel (mağaza geneli) baseline — ürün bağımsız kararlar için. */
export function globalBaselineFromBundle(bundle: SalesBundle): ProductBaselineMetrics {
  const valid = bundle.orders.filter(isValid);
  const orderIds = new Set(valid.map((o) => o.id));
  const items = bundle.items.filter((i) => orderIds.has(i.orderId));
  const itemsByOrder = new Map<number, typeof items>();
  for (const it of items) {
    const list = itemsByOrder.get(it.orderId) ?? [];
    list.push(it);
    itemsByOrder.set(it.orderId, list);
  }
  // Ürün maliyet haritası
  const costById = new Map(bundle.products.map((p) => [p.id, num(p.buyPrice)]));
  const daily = new Map<string, { units: number; revenue: number; cost: number }>();
  for (const o of valid) {
    const day = dayKey(o.createdAt);
    const b = daily.get(day) ?? { units: 0, revenue: 0, cost: 0 };
    const oItems = itemsByOrder.get(o.id) ?? [];
    for (const it of oItems) {
      const price = num(it.unitPrice);
      b.units += it.quantity;
      b.revenue += price * it.quantity;
      b.cost += (costById.get(it.productId) ?? 0) * it.quantity;
    }
    daily.set(day, b);
  }
  const sorted = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b));
  const last30 = sorted.slice(-30);
  const rev30 = last30.reduce((s, [, v]) => s + v.revenue, 0);
  const cost30 = last30.reduce((s, [, v]) => s + v.cost, 0);
  const units30 = last30.reduce((s, [, v]) => s + v.units, 0);
  const activeDays = Math.max(1, Math.min(30, sorted.length));
  const dailyUnits = sorted.length ? units30 / activeDays : null;
  const avgDailyRevenue = sorted.length ? rev30 / activeDays : null;
  // Mağaza geneli kararlar için: gerçekleşen ağırlıklı ortalama birim fiyat/maliyet
  // (ciro/adet, maliyeti/adet). Gerçek kayıtların agregatıdır — tahmin değildir.
  // Ürün bilgisi hiç yoksa ürün kart ortalamasına, o da yoksa null'a düşer.
  const retailPrices = bundle.products.map((p) => num(p.retailPrice)).filter((v) => v > 0);
  const buyPrices = bundle.products.map((p) => num(p.buyPrice)).filter((v) => v > 0);
  const price = units30 > 0 ? r2(rev30 / units30) : retailPrices.length ? r2(retailPrices.reduce((a, b) => a + b, 0) / retailPrices.length) : null;
  const unitCost = units30 > 0 && cost30 > 0 ? r2(cost30 / units30) : buyPrices.length ? r2(buyPrices.reduce((a, b) => a + b, 0) / buyPrices.length) : null;
  // Toplam stok (mağaza geneli) — fiziksel − rezerve
  const stockQty = (bundle.inventory as Array<{ productId: number; physicalQty: number | string; reservedQty: number | string }>)
    .reduce((sum, r) => sum + num(r.physicalQty) - num(r.reservedQty), 0);
  const coverDays = dailyUnits && dailyUnits > 0 ? r2(stockQty / dailyUnits) : null;
  return {
    price,
    unitCost,
    variableCost: null,
    dailyUnits,
    avgDailyRevenue,
    revenue30d: rev30 > 0 ? r2(rev30) : null,
    cost30d: cost30 > 0 ? r2(cost30) : null,
    marginPct30d: rev30 > 0 ? r2(((rev30 - cost30) / rev30) * 100) : null,
    avgDailyRevenuePerUnit: price,
    stockQty: Number.isFinite(stockQty) ? r2(stockQty) : null,
    coverDays,
    orderCount: valid.length,
    returnRatePct: null,
    returnCost30d: null,
    rfmSegment: null,
    abcxyzClass: null,
    forecastMapePct: null,
  };
}

/** Günlük net satış serisi (Early Warning için). */
export function dailyNetSalesFromBundle(bundle: SalesBundle): Array<{ day: string; net: number; units: number }> {
  const valid = bundle.orders.filter(isValid);
  const orderIds = new Set(valid.map((o) => o.id));
  const items = bundle.items.filter((i) => orderIds.has(i.orderId));
  const unitsByOrder = new Map<number, number>();
  for (const it of items) unitsByOrder.set(it.orderId, (unitsByOrder.get(it.orderId) ?? 0) + it.quantity);
  const daily = new Map<string, { net: number; units: number }>();
  for (const o of valid) {
    const day = dayKey(o.createdAt);
    const b = daily.get(day) ?? { net: 0, units: 0 };
    b.net += num(o.grandTotal);
    b.units += unitsByOrder.get(o.id) ?? 0;
    daily.set(day, b);
  }
  return [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, net: r2(v.net), units: v.units }));
}

/** Günlük marj % serisi (maliyeti bilinen ürünlerle; hiç yoksa [] döner — uydurma YOK). */
export function dailyMarginPctFromBundle(bundle: SalesBundle): Array<{ day: string; marginPct: number | null }> {
  const valid = bundle.orders.filter(isValid);
  const orderIds = new Set(valid.map((o) => o.id));
  const items = bundle.items.filter((i) => orderIds.has(i.orderId));
  const itemsByOrder = new Map<number, typeof items>();
  for (const it of items) {
    const list = itemsByOrder.get(it.orderId) ?? [];
    list.push(it);
    itemsByOrder.set(it.orderId, list);
  }
  const costById = new Map(bundle.products.map((p) => [p.id, num(p.buyPrice)]));
  const daily = new Map<string, { rev: number; cost: number; known: number }>();
  for (const o of valid) {
    const day = dayKey(o.createdAt);
    const b = daily.get(day) ?? { rev: 0, cost: 0, known: 0 };
    for (const it of itemsByOrder.get(o.id) ?? []) {
      const price = num(it.unitPrice);
      const revenue = price * it.quantity;
      b.rev += revenue;
      const cost = costById.get(it.productId);
      if (cost != null) { b.cost += cost * it.quantity; b.known += revenue; }
    }
    daily.set(day, b);
  }
  const out: Array<{ day: string; marginPct: number | null }> = [];
  for (const [day, v] of [...daily.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (v.known <= 0) { out.push({ day, marginPct: null }); continue; }
    out.push({ day, marginPct: r2(((v.known - v.cost) / v.known) * 100) });
  }
  return out;
}
