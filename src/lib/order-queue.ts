import { sharedSalesWarehouseId } from "@/lib/shared-sales-warehouse";
import { sqlite } from "@/db";
import { finishPaymentHolds, reservePaymentStock } from "@/lib/inventory-engine";
import { enqueueStockReadyNotice } from "@/lib/order-notifications";
import { releaseOrderDiscounts } from "@/lib/order-discounts";

interface Line { product_id:number; variant_id:number|null; quantity:number }
const key = (l: Line) => `${l.product_id}:${l.variant_id ?? "base"}`;
const linesFor = (orderId:number) => sqlite.prepare("SELECT product_id,variant_id,quantity FROM order_items WHERE order_id=? ORDER BY id").all(orderId) as Line[];

/** Per-product FIFO: unrelated orders may proceed, but never overtake an older order sharing a line. */
export function hasEarlierStockWait(items: Array<{productId:unknown;variantId?:unknown}>): boolean {
  const query = sqlite.prepare(`SELECT 1 FROM orders o JOIN order_items i ON i.order_id=o.id
    WHERE o.status='BACKORDER' AND i.product_id=? AND i.variant_id IS ? LIMIT 1`);
  return items.some(item => !!query.get(Number(item.productId),item.variantId ? Number(item.variantId) : null));
}

export function stockAvailableFor(items: Array<{productId:unknown;variantId?:unknown;quantity:unknown}>): boolean {
  return availability(items.map(i=>({product_id:Number(i.productId),variant_id:i.variantId ? Number(i.variantId) : null,quantity:Number(i.quantity)})));
}
function availability(lines:Line[]): boolean {
  const totals = new Map<string,{line:Line;qty:number}>();
  for (const line of lines) {
    const id = key(line), current = totals.get(id);
    totals.set(id,{line,qty:(current?.qty ?? 0)+line.quantity});
  }
  const warehouseId = sharedSalesWarehouseId();
  if (!warehouseId) return false;
  const stock = sqlite.prepare("SELECT physical_qty,reserved_qty FROM inventory WHERE warehouse_id=? AND product_id=? AND variant_id IS ? LIMIT 2");
  for (const {line,qty} of totals.values()) {
    const rows = stock.all(warehouseId,line.product_id,line.variant_id) as {physical_qty:number;reserved_qty:number}[];
    if (rows.length !== 1 || rows[0].physical_qty-rows[0].reserved_qty < qty) return false;
  }
  return true;
}

/** Only call while holding an immediate SQLite write transaction. */
export function processOrderQueueSync() {
  if (!sqlite.inTransaction) throw new Error("queue processing requires a write transaction");
  const expired = sqlite.prepare(`SELECT DISTINCT o.id,o.order_number FROM orders o JOIN inventory_reservations r ON r.reference_id=CAST(o.id AS TEXT)
    WHERE o.status='PENDING' AND o.order_type='ONLINE_B2C' AND r.reference_type='PAYMENT_HOLD' AND r.status='ACTIVE' AND r.expires_at<=unixepoch()`).all() as {id:number;order_number:string}[];
  for (const order of expired) {
    finishPaymentHolds(order.id,"RELEASED",order.order_number,"Sistem");
    releaseOrderDiscounts(order.id);
    sqlite.prepare("UPDATE orders SET status='CANCELLED',payment_status='CANCELLED' WHERE id=? AND status='PENDING'").run(order.id);
    sqlite.prepare("INSERT INTO order_status_history(order_id,from_status,to_status,note,changed_by) VALUES(?,'PENDING','CANCELLED',?,'Sistem')").run(order.id,"24 saatlik ödeme süresi doldu; stok ve indirim hakları serbest bırakıldı. Geç gelen havale için banka kontrolü gereklidir.");
  }
  const blocked = new Set<string>();
  const waiting = sqlite.prepare("SELECT id,order_number FROM orders WHERE status='BACKORDER' AND order_type='ONLINE_B2C' ORDER BY id").all() as {id:number;order_number:string}[];
  let promoted = 0;
  for (const order of waiting) {
    const lines = linesFor(order.id);
    if (!lines.length) { console.error("Backorder has no items",order.id); continue; }
    if (lines.some(line => blocked.has(key(line))) || !availability(lines)) { for (const line of lines) blocked.add(key(line)); continue; }
    const warehouseId = sharedSalesWarehouseId();
    if (!warehouseId) throw new Error("Ortak satış deposu seçilmemiş.");
    for (const line of lines) reservePaymentStock({warehouseId,productId:line.product_id,variantId:line.variant_id,qty:line.quantity,referenceId:String(order.id),createdBy:"Sistem"});
    sqlite.prepare("UPDATE orders SET status='PENDING' WHERE id=? AND status='BACKORDER'").run(order.id);
    sqlite.prepare("INSERT INTO order_status_history(order_id,from_status,to_status,note,changed_by) VALUES(?,'BACKORDER','PENDING',?,'Sistem')").run(order.id,"Stok ayrıldı; havale için 24 saat süre başladı. E-posta bildirimi kuyruğa alındı.");
    enqueueStockReadyNotice(order.id);
    promoted++;
  }
  return {expired:expired.length,promoted};
}

export function processOrderQueue() { return sqlite.transaction(processOrderQueueSync).immediate(); }
