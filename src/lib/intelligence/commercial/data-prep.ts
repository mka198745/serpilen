/**
 * Commercial modül veri hazırlığı — salt okuma.
 * FAZ 1 bundle'ını (satış) + FAZ 2 ek kaynaklarını (iade adetleri, kampanyalar,
 * PO/GDN/tedarikçi, onaylı yorumlar, manuel reklam kayıtları) yükler.
 */
import { db } from "@/db";
import {
  orderReturnItems,
  orderReturns,
  promotions,
  coupons,
  purchaseOrders,
  purchaseOrderItems,
  goodsReceipts,
  goodsReceiptItems,
  suppliers,
  productReviews,
  advertisingPerformance,
} from "@/db/schema";
import { gte, inArray } from "drizzle-orm";
import { loadSalesBundle, type SalesBundle } from "../repositories";
import { isValidOrder, type OrderItemRow } from "../types";

const num = (v: unknown) => Number(v ?? 0) || 0;

export interface ProductSales {
  unitsSold: number;
  grossRevenue: number;
  returnsQty: number;
  returnsValue: number;
}

export interface PromotionRow {
  id: number;
  name: string;
  ruleType: string;
  productId: number | null;
  categoryId: number | null;
  brandId: number | null;
  percentValue: number | null;
  fixedValue: number | null;
  isActive: boolean;
  usedCount: number;
  priority: number;
  startDate: Date | null;
  endDate: Date | null;
  maxDiscount: number | null;
}

export interface SupplierContext {
  id: number;
  name: string;
  leadTimeDays: number;
  paymentTerms: string | null;
  rating: number | null;
  isActive: boolean;
  pos: Array<{
    id: number;
    poNumber: string;
    status: string;
    expectedDate: string | null;
    createdAt: Date;
    totalAmount: number;
    items: Array<{ productId: number; quantity: number; receivedQty: number; unitCost: number }>;
    receipts: Array<{ receiptId: number; createdAt: Date; receiptNumber: string }>;
  }>;
}

export interface AdvertisingRow {
  id: number;
  name: string;
  channel: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueAttributed: number;
  startsOn: string;
  endsOn: string | null;
}

export interface ReturnDetail {
  returnId: number;
  reason: string | null;
  status: string;
  refundAmount: number;
  restock: boolean;
  createdAt: Date;
  items: Array<{ productId: number; quantity: number; refundAmount: number }>;
}

export interface CommercialContext {
  periodDays: number;
  bundle: SalesBundle;
  validItems: OrderItemRow[]; // yalnızca geçerli sipariş kalemleri
  salesByProduct: Map<number, ProductSales>;
  availableStockByProduct: Map<number, number>;
  promotions: PromotionRow[];
  coupons: Array<{ id: number; code: string; discountType: string; discountValue: number; usedCount: number; usageLimit: number | null; isActive: boolean; minCartAmount: number | null; maxDiscount: number | null }>;
  supplierContexts: SupplierContext[];
  approvedReviewsByProduct: Map<number, { count: number; avgRating: number }>;
  advertising: AdvertisingRow[];
  returnsDetail: ReturnDetail[];
  periodOrderCount: number;
}

export async function loadCommercialContext(periodDays: number): Promise<CommercialContext> {
  const bundle = await loadSalesBundle(periodDays);
  const validOrders = bundle.orders.filter(isValidOrder);
  const validIds = new Set(validOrders.map((o) => o.id));
  const validItems = bundle.items.filter((i) => validIds.has(i.orderId));

  // Ürün bazında satış + iade (adet dahil — repositories iade adedi vermez)
  const salesByProduct = new Map<number, ProductSales>();
  for (const it of validItems) {
    const cur = salesByProduct.get(it.productId) ?? { unitsSold: 0, grossRevenue: 0, returnsQty: 0, returnsValue: 0 };
    cur.unitsSold += it.quantity;
    cur.grossRevenue += it.totalPrice;
    salesByProduct.set(it.productId, cur);
  }
  const since = new Date(Date.now() - periodDays * 86400000);
  const returnRows = await db.select().from(orderReturns);
  const allReturnIds = returnRows.map((r) => r.id);
  const returnItemRows = allReturnIds.length
    ? await db.select().from(orderReturnItems).where(inArray(orderReturnItems.returnId, allReturnIds))
    : [];
  const returnsDetail: ReturnDetail[] = returnRows.map((r) => ({
    returnId: r.id,
    reason: r.reason ?? null,
    status: r.status,
    refundAmount: num(r.refundAmount),
    restock: r.restock,
    createdAt: r.createdAt,
    items: returnItemRows
      .filter((ri) => ri.returnId === r.id)
      .map((ri) => ({ productId: ri.productId, quantity: ri.quantity, refundAmount: num(ri.refundAmount) })),
  }));
  for (const r of returnsDetail) {
    if (r.status === "REJECTED" || r.status === "REQUESTED") continue; // gerçekleşmemiş iade
    if (r.createdAt < since) continue; // dönem penceresi
    for (const ri of r.items) {
      const cur = salesByProduct.get(ri.productId) ?? { unitsSold: 0, grossRevenue: 0, returnsQty: 0, returnsValue: 0 };
      cur.returnsQty += ri.quantity;
      cur.returnsValue += ri.refundAmount;
      salesByProduct.set(ri.productId, cur);
    }
  }

  // Kullanılabilir stok (fiziksel − rezerve)
  const availableStockByProduct = new Map<number, number>();
  for (const inv of bundle.inventory) {
    const cur = availableStockByProduct.get(inv.productId) ?? 0;
    availableStockByProduct.set(inv.productId, cur + Math.max(0, inv.physicalQty - inv.reservedQty));
  }

  // Kampanyalar & kuponlar
  const promoRows = await db.select().from(promotions);
  const promoMapped: PromotionRow[] = promoRows.map((p) => ({
    id: p.id,
    name: p.name,
    ruleType: p.ruleType,
    productId: p.productId ?? null,
    categoryId: p.categoryId ?? null,
    brandId: p.brandId ?? null,
    percentValue: p.percentValue != null ? num(p.percentValue) : null,
    fixedValue: p.fixedValue != null ? num(p.fixedValue) : null,
    isActive: p.isActive,
    usedCount: num(p.usedCount),
    priority: p.priority,
    startDate: p.startDate ?? null,
    endDate: p.endDate ?? null,
    maxDiscount: p.maxDiscount != null ? num(p.maxDiscount) : null,
  }));
  const couponRows = await db.select().from(coupons);
  const couponMapped = couponRows.map((c) => ({
    id: c.id,
    code: c.code,
    discountType: c.discountType,
    discountValue: num(c.discountValue),
    usedCount: num(c.usedCount),
    usageLimit: c.usageLimit ?? null,
    isActive: c.isActive,
    minCartAmount: c.minCartAmount != null ? num(c.minCartAmount) : null,
    maxDiscount: c.maxDiscount != null ? num(c.maxDiscount) : null,
  }));

  // Tedarikçi + PO + GDN (dönem penceresi)
  const sincePo = new Date(Date.now() - 365 * 86400000); // PO'lar yıllık pencerede
  const supplierRows = await db.select().from(suppliers);
  const poRows = await db.select().from(purchaseOrders).where(gte(purchaseOrders.createdAt, sincePo));
  const poIds = poRows.map((p) => p.id);
  const poItemRows = poIds.length ? await db.select().from(purchaseOrderItems).where(inArray(purchaseOrderItems.purchaseOrderId, poIds)) : [];
  const receiptRows = poIds.length ? await db.select().from(goodsReceipts).where(inArray(goodsReceipts.purchaseOrderId, poIds)) : [];
  const receiptIds = receiptRows.map((r) => r.id);
  const receiptItemRows = receiptIds.length ? await db.select().from(goodsReceiptItems).where(inArray(goodsReceiptItems.receiptId, receiptIds)) : [];

  const supplierContexts: SupplierContext[] = supplierRows.map((s) => ({
    id: s.id,
    name: s.name,
    leadTimeDays: s.leadTimeDays,
    paymentTerms: s.paymentTerms ?? null,
    rating: s.rating != null ? num(s.rating) : null,
    isActive: s.isActive,
    pos: poRows
      .filter((po) => po.supplierId === s.id)
      .map((po) => ({
        id: po.id,
        poNumber: po.poNumber,
        status: po.status,
        expectedDate: po.expectedDate ?? null,
        createdAt: po.createdAt,
        totalAmount: num(po.totalAmount),
        items: poItemRows
          .filter((it) => it.purchaseOrderId === po.id)
          .map((it) => ({ productId: it.productId, quantity: it.quantity, receivedQty: it.receivedQty, unitCost: num(it.unitCost) })),
        receipts: receiptRows
          .filter((rc) => rc.purchaseOrderId === po.id)
          .map((rc) => ({ receiptId: rc.id, createdAt: rc.createdAt, receiptNumber: rc.receiptNumber })),
      })),
  }));

  // Onaylı yorumlar (kalite sinyali)
  const reviewRows = await db.select().from(productReviews);
  const approvedReviewsByProduct = new Map<number, { count: number; avgRating: number }>();
  const tmp = new Map<number, { sum: number; count: number }>();
  for (const r of reviewRows) {
    if (r.status !== "APPROVED") continue;
    const cur = tmp.get(r.productId) ?? { sum: 0, count: 0 };
    cur.sum += r.rating;
    cur.count += 1;
    tmp.set(r.productId, cur);
  }
  for (const [pid, v] of tmp) {
    approvedReviewsByProduct.set(pid, { count: v.count, avgRating: Number((v.sum / v.count).toFixed(2)) });
  }

  // Manuel reklam kayıtları
  const adRows = await db.select().from(advertisingPerformance);
  const advertising: AdvertisingRow[] = adRows.map((a) => ({
    id: a.id,
    name: a.name,
    channel: a.channel,
    spend: num(a.spend),
    impressions: a.impressions,
    clicks: a.clicks,
    conversions: a.conversions,
    revenueAttributed: num(a.revenueAttributed),
    startsOn: a.startsOn,
    endsOn: a.endsOn ?? null,
  }));

  return {
    periodDays,
    bundle,
    validItems,
    salesByProduct,
    availableStockByProduct,
    promotions: promoMapped,
    coupons: couponMapped,
    supplierContexts,
    approvedReviewsByProduct,
    advertising,
    returnsDetail,
    periodOrderCount: validOrders.length,
  };
}
