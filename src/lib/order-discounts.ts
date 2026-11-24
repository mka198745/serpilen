import { sqlite } from "@/db";

/** Called only under the order's SQLite write lock. */
export function claimOrderDiscounts(orderId: number, couponId: number | null, promotionIds: number[]) {
  if (!sqlite.inTransaction) throw new Error("discount claims require transaction");
  const insert = sqlite.prepare("INSERT INTO order_discount_claims(order_id,kind,target_id) VALUES(?,?,?)");
  if (couponId !== null) insert.run(orderId, "COUPON", couponId);
  for (const id of new Set(promotionIds)) insert.run(orderId, "PROMOTION", id);
}

/** Claims are released once, in the same transaction as cancellation. */
export function releaseOrderDiscounts(orderId: number) {
  if (!sqlite.inTransaction) throw new Error("discount release requires transaction");
  const rows = sqlite.prepare("SELECT id,kind,target_id FROM order_discount_claims WHERE order_id=? AND status='ACTIVE'").all(orderId) as {id:number;kind:string;target_id:number}[];
  for (const r of rows) {
    const table = r.kind === "COUPON" ? "coupons" : r.kind === "PROMOTION" ? "promotions" : null;
    if (!table) throw new Error("Unknown order discount claim");
    const changed = sqlite.prepare(`UPDATE ${table} SET used_count=used_count-1 WHERE id=? AND used_count>0`).run(r.target_id);
    if (changed.changes !== 1) throw new Error("Order discount claim is inconsistent");
    sqlite.prepare("UPDATE order_discount_claims SET status='RELEASED' WHERE id=?").run(r.id);
  }
}
