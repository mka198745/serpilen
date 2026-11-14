/** Sentetik veri üretici — testler canlı DB'ye DOKUNMAZ. */
import type { SalesBundle } from "@/lib/intelligence/repositories";
import type { OrderRow, OrderItemRow, RefundRow, ProductDim, InventoryRow, CustomerDim } from "@/lib/intelligence/types";

export function makeProduct(over: Partial<ProductDim> & { id: number }): ProductDim {
  return {
    name: `Ürün ${over.id}`,
    sku: `SKU-${over.id}`,
    categoryId: 1,
    brandId: 1,
    buyPrice: 50,
    retailPrice: 100,
    campaignPrice: null,
    isActive: true,
    ...over,
  };
}

export function makeOrder(over: Partial<OrderRow> & { id: number; createdAt: Date | number }): OrderRow {
  return {
    orderNumber: `OR-${over.id}`,
    orderType: "ONLINE_B2C",
    customerId: 100 + over.id,
    customerName: `Müşteri ${over.id}`,
    status: "PAID",
    paymentMethod: "CREDIT_CARD",
    subtotal: 0,
    discountTotal: 0,
    shippingTotal: 0,
    grandTotal: 0,
    ...over,
  };
}

export function makeBundle(parts: {
  orders?: OrderRow[];
  items?: OrderItemRow[];
  refunds?: RefundRow[];
  products?: ProductDim[];
  categories?: Array<{ id: number; name: string }>;
  brands?: Array<{ id: number; name: string }>;
  customers?: CustomerDim[];
  inventory?: InventoryRow[];
}): SalesBundle {
  return {
    orders: parts.orders ?? [],
    items: parts.items ?? [],
    refunds: parts.refunds ?? [],
    products: parts.products ?? [],
    categories: parts.categories ?? [{ id: 1, name: "Genel" }],
    brands: parts.brands ?? [{ id: 1, name: "Genel Marka" }],
    customers: parts.customers ?? [],
    inventory: parts.inventory ?? [],
  };
}

/** N günlük, her gün aynı adet satılan ürün serisi (deterministik). */
export function steadyBundle(days: number, qty: number, productId = 1): SalesBundle {
  const orders: OrderRow[] = [];
  const items: OrderItemRow[] = [];
  const start = new Date();
  start.setDate(start.getDate() - days);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    orders.push(
      makeOrder({
        id: i + 1,
        createdAt: d,
        subtotal: qty * 100,
        grandTotal: qty * 100,
        customerId: 100,
      })
    );
    items.push({
      orderId: i + 1,
      productId,
      variantId: null,
      productName: `Ürün ${productId}`,
      sku: `SKU-${productId}`,
      unitPrice: 100,
      quantity: qty,
      totalPrice: qty * 100,
    });
  }
  return makeBundle({
    orders,
    items,
    products: [makeProduct({ id: productId, buyPrice: 40 })],
    inventory: [{ productId, variantId: null, warehouseId: 1, physicalQty: days * qty * 2, reservedQty: 0 }],
    customers: [{ id: 100, name: "Müşteri 100", createdAt: start }],
  });
}
