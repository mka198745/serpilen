/**
 * Repository katmanı: motorlara ham satırları verir. Filtreleme/seçim SQL'de,
 * hesaplama JS'te. Mevcut şemaya dokunmaz; salt okuma.
 */
import { db } from "@/db";
import {
  orders,
  orderItems,
  orderReturns,
  orderReturnItems,
  products,
  categories,
  brands,
  customers,
  inventory,
} from "@/db/schema";
import { gte, inArray } from "drizzle-orm";
import type { OrderRow, OrderItemRow, RefundRow, ProductDim, InventoryRow, CustomerDim } from "./types";

const num = (v: unknown) => Number(v ?? 0) || 0;

export async function loadSalesBundle(daysBack?: number) {
  const since = daysBack ? new Date(Date.now() - daysBack * 86400000) : null;
  const orderRows = since
    ? await db.select().from(orders).where(gte(orders.createdAt, since))
    : await db.select().from(orders);
  const orderIds = orderRows.map((o) => o.id);
  const itemRows = orderIds.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
    : [];
  const returnRows = await db.select().from(orderReturns);
  const returnIds = returnRows.map((r) => r.id);
  const returnItemRows = returnIds.length
    ? await db.select().from(orderReturnItems).where(inArray(orderReturnItems.returnId, returnIds))
    : [];
  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      categoryId: products.categoryId,
      brandId: products.brandId,
      buyPrice: products.buyPrice,
      retailPrice: products.retailPrice,
      campaignPrice: products.campaignPrice,
      isActive: products.isActive,
    })
    .from(products);
  const categoryRows = await db.select({ id: categories.id, name: categories.name }).from(categories);
  const brandRows = await db.select({ id: brands.id, name: brands.name }).from(brands);
  const customerRows = await db.select({ id: customers.id, name: customers.name, createdAt: customers.createdAt }).from(customers);
  const inventoryRows = await db
    .select({
      productId: inventory.productId,
      variantId: inventory.variantId,
      warehouseId: inventory.warehouseId,
      physicalQty: inventory.physicalQty,
      reservedQty: inventory.reservedQty,
    })
    .from(inventory);

  const mappedOrders: OrderRow[] = orderRows.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    orderType: o.orderType,
    customerId: o.customerId ?? null,
    customerName: o.customerName,
    status: o.status,
    paymentMethod: o.paymentMethod,
    subtotal: num(o.subtotal),
    discountTotal: num(o.discountTotal),
    shippingTotal: num(o.shippingTotal),
    grandTotal: num(o.grandTotal),
    createdAt: o.createdAt,
  }));

  const mappedItems: OrderItemRow[] = itemRows.map((i) => ({
    orderId: i.orderId,
    productId: i.productId,
    variantId: i.variantId ?? null,
    productName: i.productName,
    sku: i.sku,
    unitPrice: num(i.unitPrice),
    quantity: i.quantity,
    totalPrice: num(i.totalPrice),
  }));

  // İade satırlarını ürün bazında netleştirir
  const refunds: RefundRow[] = [];
  for (const r of returnRows) {
    if (r.status === "REJECTED" || r.status === "REQUESTED") continue; // gerçekleşmemiş iade
    const items = returnItemRows.filter((ri) => ri.returnId === r.id);
    if (items.length) {
      for (const ri of items) {
        refunds.push({ orderId: r.orderId, productId: ri.productId, refundAmount: num(ri.refundAmount), createdAt: r.createdAt });
      }
    } else {
      refunds.push({ orderId: r.orderId, productId: null, refundAmount: num(r.refundAmount), createdAt: r.createdAt });
    }
  }

  const mappedProducts: ProductDim[] = productRows.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    categoryId: p.categoryId ?? null,
    brandId: p.brandId ?? null,
    buyPrice: num(p.buyPrice),
    retailPrice: num(p.retailPrice),
    campaignPrice: p.campaignPrice != null ? num(p.campaignPrice) : null,
    isActive: p.isActive,
  }));

  return {
    orders: mappedOrders,
    items: mappedItems,
    refunds,
    products: mappedProducts,
    categories: categoryRows,
    brands: brandRows,
    customers: customerRows as CustomerDim[],
    inventory: inventoryRows as InventoryRow[],
  };
}
export type SalesBundle = Awaited<ReturnType<typeof loadSalesBundle>>;
