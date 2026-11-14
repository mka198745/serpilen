/**
 * AUTO ölçülebilir KPI hesaplayıcıları — gerçek veriden, uydurma yok.
 * Ölçüm penceresi: hedef döneminin başlangıcından bugüne. Veri yoksa/koşul sağlanmıyorsa null.
 */
import { db } from "@/db";
import { isValidOrder } from "../../types";
import {
  orders, orderItems, orderReturns, products, purchaseOrders, purchaseOrderItems, advertisingPerformance,
} from "@/db/schema";
import { gte, inArray, eq } from "drizzle-orm";

export type GoalKpi =
  | "REVENUE" | "ORDER_COUNT" | "AVG_ORDER_VALUE" | "GROSS_PROFIT" | "CONTRIBUTION_MARGIN"
  | "RETURN_RATE" | "ROAS" | "DEAD_STOCK_VALUE" | "FILL_RATE_PCT" | "ON_TIME_PCT";

export const KPI_LABELS: Record<GoalKpi, string> = {
  REVENUE: "Toplam ciro",
  ORDER_COUNT: "Sipariş adedi",
  AVG_ORDER_VALUE: "Ortalama sipariş tutarı",
  GROSS_PROFIT: "Brüt kâr (alış maliyeti düşülmüş)",
  CONTRIBUTION_MARGIN: "Katkı marjı %",
  RETURN_RATE: "İade / sipariş oranı %",
  ROAS: "Reklam ROAS (manuel advertising_performance)",
  DEAD_STOCK_VALUE: "Ölü stok değeri (90+ gün satışsız)",
  FILL_RATE_PCT: "Tedarikçi fill rate %",
  ON_TIME_PCT: "Zamanında teslim %",
};

/** AUTO ölçümü desteklemeyen KPI'lar (şema/ veri eksik). */
export const KPI_AUTO_SUPPORTED: GoalKpi[] = [
  "REVENUE", "ORDER_COUNT", "AVG_ORDER_VALUE", "GROSS_PROFIT", "CONTRIBUTION_MARGIN", "RETURN_RATE", "ROAS", "DEAD_STOCK_VALUE", "FILL_RATE_PCT",
];
/** ON_TIME_PCT: şemada gerçekleşen teslim tarihi yok → ölçülemez (MANUAL veya gelecek faz). */
export const KPI_UNSUPORTED_NOTE: Partial<Record<GoalKpi, string>> = {
  ON_TIME_PCT: "Şemada gerçekleşen teslim tarihi (deliveredAt) yok; timeliness ölçülemez — değeri elle girin.",
};

export interface KpiMeasurement {
  kpi: GoalKpi;
  value: number | null;
  unit: string;
  windowStart: string;
  windowEnd: string;
  /** Günlük seri (forecast için) — eski → yeni */
  dailySeries?: Array<{ day: string; value: number }> | null;
  note?: string | null;
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Hedef dönemi için KPI ölçer. */
export async function measureKpi(kpi: GoalKpi, startDate: string, endDate?: string | null): Promise<KpiMeasurement> {
  const now = new Date();
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : now;
  const windowEnd = dayKey(end > now ? now : end);
  const base = { kpi, windowStart: dayKey(start), windowEnd };

  if (kpi === "ON_TIME_PCT") {
    return { ...base, value: null, unit: "%", dailySeries: null, note: KPI_UNSUPORTED_NOTE.ON_TIME_PCT ?? "Ölçülemez." };
  }

  // Sipariş kümesi (valid: iptal edilmemiş/tamamlanmamış iadeler hariç tutulmaz — status üzerinden isValidOrder)
  const orderRows = await db.select().from(orders).where(gte(orders.createdAt, start));
  const validOrders = orderRows.filter(isValidOrder);
  const orderIds = validOrders.map((o) => o.id);
  const itemRows = orderIds.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)) : [];

  // Ürün maliyetleri
  const productIds = [...new Set(itemRows.map((i) => i.productId))];
  const productRows = productIds.length
    ? await db.select({ id: products.id, buyPrice: products.buyPrice }).from(products).where(inArray(products.id, productIds))
    : [];
  const costById = new Map(productRows.map((p) => [p.id, num(p.buyPrice)]));

  // Günlük ciro serisi
  const daily = new Map<string, { revenue: number; units: number; gross: number }>();
  const itemsByOrder = new Map<number, typeof itemRows>();
  for (const it of itemRows) {
    const list = itemsByOrder.get(it.orderId) ?? [];
    list.push(it);
    itemsByOrder.set(it.orderId, list);
  }
  for (const o of validOrders) {
    const day = dayKey(o.createdAt);
    const bucket = daily.get(day) ?? { revenue: 0, units: 0, gross: 0 };
    const items = itemsByOrder.get(o.id) ?? [];
    for (const it of items) {
      const revenue = num(it.totalPrice ?? num(it.unitPrice) * it.quantity);
      bucket.revenue += revenue;
      bucket.units += it.quantity;
      bucket.gross += revenue - (costById.get(it.productId) ?? 0) * it.quantity;
    }
    daily.set(day, bucket);
  }
  const dailySeries = [...daily.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day, value: v.revenue }));

  const revenue = [...daily.values()].reduce((s, v) => s + v.revenue, 0);
  const gross = [...daily.values()].reduce((s, v) => s + v.gross, 0);
  const orderCount = validOrders.length;

  switch (kpi) {
    case "REVENUE":
      return { ...base, value: r2(revenue), unit: "TL", dailySeries };
    case "ORDER_COUNT":
      return { ...base, value: orderCount, unit: "adet", dailySeries: dailySeries.map((d) => ({ day: d.day, value: 1 })) };
    case "AVG_ORDER_VALUE":
      return { ...base, value: orderCount > 0 ? r2(revenue / orderCount) : null, unit: "TL", dailySeries };
    case "GROSS_PROFIT":
      return { ...base, value: r2(gross), unit: "TL", dailySeries: [...daily.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([day, v]) => ({ day, value: v.gross })) };
    case "CONTRIBUTION_MARGIN":
      return { ...base, value: revenue > 0 ? r2((gross / revenue) * 100) : null, unit: "%", dailySeries: [...daily.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([day, v]) => ({ day, value: v.revenue > 0 ? (v.gross / v.revenue) * 100 : 0 })) };
    case "RETURN_RATE": {
      const windowStartIso = start;
      const returnRows = await db.select().from(orderReturns).where(gte(orderReturns.createdAt, windowStartIso));
      const rate = orderCount > 0 ? (returnRows.length / orderCount) * 100 : null;
      return { ...base, value: rate != null ? r2(rate) : null, unit: "%", dailySeries: null, note: orderCount === 0 ? "Sipariş yok — oran hesaplanamadı." : null };
    }
    case "ROAS": {
      const adRows = await db.select().from(advertisingPerformance);
      const startKey = dayKey(start);
      const relevant = adRows.filter((r) => {
        const end = r.endsOn ?? r.startsOn;
        return end >= startKey || r.startsOn <= windowEnd;
      });
      const spend = relevant.reduce((s, r) => s + num(r.spend), 0);
      const attributed = relevant.reduce((s, r) => s + num(r.revenueAttributed), 0);
      if (spend <= 0) {
        return { ...base, value: null, unit: "x", dailySeries: null, note: "advertising_performance kaydı yok — ROAS uydurulmaz." };
      }
      return { ...base, value: r2(attributed / spend), unit: "x", dailySeries: null, note: "advertising_performance (manuel giriş) üzerinden." };
    }
    case "DEAD_STOCK_VALUE": {
      // 90 gün satışı olmayan stok × alış fiyatı — procurement ile aynı tanım
      const cutoff = new Date(now.getTime() - 90 * 86400000);
      const recentOrderIds = orderRows.filter((o) => o.createdAt >= cutoff).map((o) => o.id);
      const recentItems = recentOrderIds.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, recentOrderIds)) : [];
      const soldRecently = new Set(recentItems.map((i) => i.productId));
      const allProducts = await db.select({ id: products.id, buyPrice: products.buyPrice, isActive: products.isActive }).from(products);
      const invRows = await db.query.inventory.findMany({ columns: { productId: true, physicalQty: true, reservedQty: true } });
      const qtyByProduct = new Map<number, number>();
      for (const r of invRows) qtyByProduct.set(r.productId, (qtyByProduct.get(r.productId) ?? 0) + num(r.physicalQty) - num(r.reservedQty));
      let value = 0;
      for (const p of allProducts) {
        if (p.isActive && !soldRecently.has(p.id)) {
          value += Math.max(0, qtyByProduct.get(p.id) ?? 0) * num(p.buyPrice);
        }
      }
      return { ...base, value: r2(value), unit: "TL", dailySeries: null };
    }
    case "FILL_RATE_PCT": {
      const poRows = await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(gte(purchaseOrders.createdAt, start));
      const poIds = poRows.map((p) => p.id);
      const poItems = poIds.length ? await db.select().from(purchaseOrderItems).where(inArray(purchaseOrderItems.purchaseOrderId, poIds)) : [];
      const ordered = poItems.reduce((s, i) => s + i.quantity, 0);
      const received = poItems.reduce((s, i) => s + (i.receivedQty ?? 0), 0);
      if (ordered <= 0) return { ...base, value: null, unit: "%", dailySeries: null, note: "Dönemde mal kabul yok — hesaplanamadı." };
      return { ...base, value: r2((received / ordered) * 100), unit: "%", dailySeries: null };
    }
    default:
      return { ...base, value: null, unit: "", dailySeries: null, note: "Bilinmeyen KPI." };
  }
}
const r2 = (n: number) => Number(n.toFixed(2));
