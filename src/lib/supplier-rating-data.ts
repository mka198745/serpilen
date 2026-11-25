import { sqlite } from "@/db";
import { calculateSupplierRating, type SupplierRatingOrder } from "@/lib/supplier-rating";

type Supplier = {id:number;paymentTerms:string|null;isActive:boolean};
const calendarDate = (seconds:number) => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(seconds*1000));

/** Never infer pre-migration supplier-return history from an absence of records. */
export function supplierRatings(suppliers: Supplier[]) {
  return sqlite.transaction(() => {
    const result = new Map<number, ReturnType<typeof calculateSupplierRating>>();
    const orderQuery=sqlite.prepare("SELECT id,created_at,expected_date FROM purchase_orders WHERE supplier_id=? AND status='RECEIVED'");
    const itemsQuery=sqlite.prepare('SELECT id,product_id,variant_id,quantity,received_qty FROM purchase_order_items WHERE purchase_order_id=?');
    const receiptQuery=sqlite.prepare(`SELECT r.id AS receipt_id,r.created_at,r.warehouse_id,ri.purchase_order_item_id,ri.product_id,ri.variant_id,ri.qty,
      (SELECT coalesce(sum(sri.qty),0) FROM supplier_return_items sri WHERE sri.receipt_item_id=ri.id) AS returned
      FROM goods_receipts r JOIN goods_receipt_items ri ON ri.receipt_id=r.id WHERE r.purchase_order_id=?`);
    const poWh=sqlite.prepare('SELECT warehouse_id FROM purchase_orders WHERE id=?');
    const coverage=sqlite.prepare('SELECT expected_date FROM supplier_order_coverage WHERE purchase_order_id=?');
    for (const supplier of suppliers) {
      const rows=orderQuery.all(supplier.id) as {id:number;created_at:number;expected_date:string|null}[];
      const orders:SupplierRatingOrder[]=rows.map(po=>{
        const items=itemsQuery.all(po.id) as {id:number;product_id:number;variant_id:number|null;quantity:number;received_qty:number}[];
        const receipt=receiptQuery.all(po.id) as {receipt_id:number;created_at:number;warehouse_id:number;purchase_order_item_id:number;product_id:number;variant_id:number|null;qty:number;returned:number}[];
        const snapshot=coverage.get(po.id) as {expected_date:string|null}|undefined;
        const warehouse=(poWh.get(po.id) as {warehouse_id:number}).warehouse_id;
        const valid=items.length>0 && receipt.length>0 && Number.isSafeInteger(po.created_at) && po.created_at>0 &&
          receipt.every(r=>Number.isSafeInteger(r.created_at)&&r.created_at>=po.created_at&&r.created_at<=Math.floor(Date.now()/1000)+60&&Number.isSafeInteger(r.qty)&&r.qty>0&&Number.isSafeInteger(r.returned)&&r.returned>=0&&r.returned<=r.qty&&r.warehouse_id===warehouse&&items.some(i=>i.id===r.purchase_order_item_id&&i.product_id===r.product_id&&i.variant_id===r.variant_id)) &&
          items.every(i=>Number.isSafeInteger(i.quantity)&&i.quantity>0&&i.received_qty===i.quantity&&receipt.filter(r=>r.purchase_order_item_id===i.id).reduce((n,r)=>n+r.qty,0)===i.received_qty);
        const timestamp=valid ? Math.max(...receipt.map(r=>r.created_at)) : null;
        return {id:po.id,completedAt:timestamp,completionSequence:timestamp?Math.max(...receipt.filter(r=>r.created_at===timestamp).map(r=>r.receipt_id)):0,completedDate:timestamp?calendarDate(timestamp):null,expectedDate:snapshot ? snapshot.expected_date : po.expected_date,
          receivedQty:valid?receipt.reduce((n,r)=>n+r.qty,0):null,returnedQty:valid?receipt.reduce((n,r)=>n+r.returned,0):null,returnsCovered:!!snapshot};
      });
      result.set(supplier.id,calculateSupplierRating(orders,supplier.paymentTerms,suppliers.filter(s=>s.id!==supplier.id&&s.isActive).map(s=>s.paymentTerms)));
    }
    return result;
  }).deferred();
}
