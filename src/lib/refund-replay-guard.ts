import { sqlite } from "@/db";

export class RefundGuardError extends Error {}
const cents=(value:unknown) => {
  if ((typeof value !== "number" && typeof value !== "string") || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(value))) throw new RefundGuardError("İade tutarı doğrulanamadı; işlem durduruldu.");
  const n=Number(value), amount=Math.round(n*100);
  if (!Number.isFinite(n) || n<0 || !Number.isSafeInteger(amount) || Math.abs(n*100-amount)>0.000001) throw new RefundGuardError("İade tutarı doğrulanamadı; işlem durduruldu.");
  return amount;
};

/** Create/verify a permanent minimal allocation fence under the caller's write transaction.
 * This function does not delete any record, modify stock, or initiate a payment. */
export function retainRefundReplayGuard(returnId:number): void {
  if (!sqlite.inTransaction) throw new RefundGuardError("İade koruması yalnız işlemin içinde oluşturulabilir.");
  if (!Number.isSafeInteger(returnId) || returnId<1) throw new RefundGuardError("İade kimliği geçersiz.");
  const receipt=sqlite.prepare("SELECT id,order_id,status,refund_amount FROM order_returns WHERE id=?").get(returnId) as {id:number;order_id:number;status:string;refund_amount:string|number}|undefined;
  if(!receipt || receipt.status!=="REFUNDED" || !Number.isSafeInteger(receipt.order_id) || receipt.order_id<1) throw new RefundGuardError("Yalnız tamamlanmış iade korunabilir.");
  const rows=sqlite.prepare(`SELECT r.order_item_id,r.quantity,r.refund_amount,i.order_id,i.quantity AS order_quantity FROM order_return_items r
    LEFT JOIN order_items i ON i.id=r.order_item_id WHERE r.return_id=? ORDER BY r.order_item_id`).all(returnId) as {order_item_id:number;quantity:number;refund_amount:string|number;order_id:number|null;order_quantity:number|null}[];
  if(!rows.length || rows.some((r,i)=>!Number.isSafeInteger(r.order_item_id) || r.order_item_id<1 || !Number.isSafeInteger(r.quantity) || r.quantity<1 || r.order_id!==receipt.order_id || !Number.isSafeInteger(r.order_quantity) || !r.order_quantity || r.quantity>r.order_quantity || (i>0 && rows[i-1].order_item_id===r.order_item_id))) throw new RefundGuardError("İade kalemleri tutarsız; işlem durduruldu.");
  const items=rows.map(r=>({orderItemId:r.order_item_id,quantity:r.quantity,refundCents:cents(r.refund_amount)}));
  const total=cents(receipt.refund_amount),sum=items.reduce((n,item)=>n+item.refundCents,0);
  if(!Number.isSafeInteger(sum) || sum!==total) throw new RefundGuardError("İade tutarı kalemlerle uyuşmuyor; işlem durduruldu.");
  const existing=sqlite.prepare('SELECT order_id,refund_cents FROM deleted_refund_guards WHERE return_id=?').get(returnId) as {order_id:number;refund_cents:number}|undefined;
  if(existing) {
    const saved=sqlite.prepare('SELECT order_item_id AS orderItemId,quantity,refund_cents AS refundCents FROM deleted_refund_guard_items WHERE return_id=? ORDER BY order_item_id').all(returnId);
    if(existing.order_id!==receipt.order_id || existing.refund_cents!==total || JSON.stringify(saved)!==JSON.stringify(items)) throw new RefundGuardError("İade koruması eksik veya tutarsız; işlem durduruldu.");
    return;
  }
  sqlite.prepare('INSERT INTO deleted_refund_guards(return_id,order_id,refund_cents) VALUES(?,?,?)').run(returnId,receipt.order_id,total);
  const add=sqlite.prepare('INSERT INTO deleted_refund_guard_items(return_id,order_item_id,quantity,refund_cents) VALUES(?,?,?,?)');
  for(const item of items) add.run(returnId,item.orderItemId,item.quantity,item.refundCents);
}
