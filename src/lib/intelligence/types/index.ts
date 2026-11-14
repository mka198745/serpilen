/** Paylaşılan saf tipler — intelligence motorları DB şemasından bağımsızdır. */

export interface OrderRow {
  id: number;
  orderNumber: string;
  orderType: string; // POS | ONLINE_B2C
  customerId: number | null;
  customerName: string | null;
  status: string;
  paymentMethod: string;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  grandTotal: number;
  createdAt: Date | number;
}

export interface OrderItemRow {
  orderId: number;
  productId: number;
  variantId: number | null;
  productName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
}

export interface RefundRow {
  orderId: number;
  productId: number | null;
  refundAmount: number;
  createdAt: Date | number;
}

export interface ProductDim {
  id: number;
  name: string;
  sku: string;
  categoryId: number | null;
  brandId: number | null;
  buyPrice: number;
  retailPrice: number;
  campaignPrice: number | null;
  isActive: boolean;
}

export interface InventoryRow {
  productId: number;
  variantId: number | null;
  warehouseId: number;
  physicalQty: number;
  reservedQty: number;
}

export interface CustomerDim {
  id: number;
  name: string;
  createdAt: Date | number;
}

/** İptal/iade hariç geçerli sipariş mi? */
export const INVALID_ORDER_STATUSES = ["CANCELLED", "REFUNDED"];
export function isValidOrder(o: Pick<OrderRow, "status">): boolean {
  return !INVALID_ORDER_STATUSES.includes(o.status);
}

export function orderDate(o: Pick<OrderRow, "createdAt">): Date {
  return o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
}

/** Günlük anahtar (YYYY-MM-DD, sunucu yerel saati — mağaza Türkiye'de). */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Sıfır günleriyle doldurulmuş günlük seri üretir. */
export function zeroFillSeries(from: Date, to: Date, values: Map<string, number>): Array<{ date: string; value: number }> {
  const out: Array<{ date: string; value: number }> = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cur <= end) {
    const key = dayKey(cur);
    out.push({ date: key, value: values.get(key) ?? 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
