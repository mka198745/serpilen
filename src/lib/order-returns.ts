import { randomUUID } from "node:crypto";
import { sqlite } from "@/db";
import { adjustInventorySync } from "@/lib/inventory-engine";
import { processOrderQueueSync } from "@/lib/order-queue";

export class ReturnError extends Error { constructor(message:string, public status=409) { super(message); } }
type Order = { id:number; order_number:string; status:string; payment_status:string; grand_total:number|string; customer_id:number|null };
type Item = { id:number;product_id:number;variant_id:number|null;product_name:string;quantity:number;total_price:number|string };
type Return = {id:number;return_number:string;order_id:number;status:string;refund_amount:number|string;restock:number;warehouse_id:number|null};
type Actor = {id:number;name:string};
const cents = (value:unknown) => { const n = Math.round(Number(value)*100); if (!Number.isSafeInteger(n) || n < 0) throw new ReturnError("Sipariş tutarları tutarsız; manuel inceleme gerekli."); return n; };
const money = (n:number) => (n/100).toFixed(2);
function orderById(id:number):Order {
  const o=sqlite.prepare("SELECT id,order_number,status,payment_status,grand_total,customer_id FROM orders WHERE id=?").get(id) as Order|undefined;
  if (!o) throw new ReturnError("Sipariş bulunamadı.",404);
  return o;
}
function currentReturn(id:number):Return {
  const r=sqlite.prepare("SELECT * FROM order_returns WHERE id=?").get(id) as Return|undefined;
  if (!r) throw new ReturnError("İade kaydı bulunamadı.",404);
  return r;
}
function audit(actor:Actor, action:string, id:number, details:string) {
  sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,?,'OrderReturn',?,?)").run(String(actor.id),actor.name,action,String(id),details);
}
function ensureEligible(order:Order) {
  if (order.payment_status !== "PAID" || !["DELIVERED","RETURN_REQUESTED"].includes(order.status)) throw new ReturnError("Yalnız ödenmiş ve teslim edilmiş siparişler iade edilebilir.");
}

/** Caller holds the SQLite immediate transaction. Existing active requests reserve their quantities. */
export function createReturn(orderId:number, raw:unknown, warehouseId:number, restock:boolean, reason:string, actor:Actor, approved=false) {
  const order=orderById(orderId); ensureEligible(order);
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) throw new ReturnError("İade edilecek kalemleri seçin.",422);
  if (!Number.isSafeInteger(warehouseId) || !sqlite.prepare("SELECT id FROM warehouses WHERE id=? AND is_active=1").get(warehouseId)) throw new ReturnError("Geçersiz iade deposu.",422);
  const req=new Map<number,number>();
  for(const x of raw) {
    const id=Number(x?.orderItemId), quantity=Number(x?.quantity);
    if (!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(quantity)||quantity<=0||req.has(id)) throw new ReturnError("Geçersiz veya tekrarlanan iade kalemi.",422);
    req.set(id,quantity);
  }
  const all=sqlite.prepare("SELECT id,product_id,variant_id,product_name,quantity,total_price FROM order_items WHERE order_id=? ORDER BY id").all(orderId) as Item[];
  if (!all.length || [...req.keys()].some(id=>!all.some(it=>it.id===id))) throw new ReturnError("İade kalemi bu siparişe ait değil.",422);
  const amounts=all.map(it=>cents(it.total_price));const subtotal=amounts.reduce((a,b)=>a+b,0), total=cents(order.grand_total);
  if (!Number.isSafeInteger(subtotal) || subtotal<=0 || !Number.isSafeInteger(subtotal*total)) throw new ReturnError("Sipariş tutarları otomatik iade için uygun değil; manuel inceleme gerekli.");
  const already=sqlite.prepare(`SELECT COALESCE(SUM(ri.quantity),0) qty FROM order_return_items ri JOIN order_returns r ON r.id=ri.return_id WHERE ri.order_item_id=? AND r.status<>'REJECTED'`);
  const booked=sqlite.prepare("SELECT COALESCE(SUM(CAST(refund_amount AS REAL)),0) total FROM order_returns WHERE order_id=? AND status<>'REJECTED'").get(orderId) as {total:number};
  const rows:Array<{item:Item;quantity:number;refund:number}>=[];let cumulative=0;
  for(let i=0;i<all.length;i++) {
    const it=all[i],lineTotal=amounts[i],lineStart=cumulative;cumulative+=lineTotal;
    const lineBudget=Math.round(cumulative*total/subtotal)-Math.round(lineStart*total/subtotal);
    if (!req.has(it.id)) continue;
    const used=Number((already.get(it.id) as {qty:number}).qty),qty=req.get(it.id)!;
    if (!Number.isSafeInteger(used)||used<0||!Number.isSafeInteger(it.quantity)||it.quantity<=0||used+qty>it.quantity) throw new ReturnError("İade adedi, önceki taleplerle birlikte satın alınan adedi aşıyor.");
    const refund=Math.round((used+qty)*lineBudget/it.quantity)-Math.round(used*lineBudget/it.quantity);
    rows.push({item:it,quantity:qty,refund});
  }
  const amount=rows.reduce((n,r)=>n+r.refund,0);
  if (cents(booked.total)+amount > total) throw new ReturnError("Önceki iadelerle birlikte iade tutarı sipariş tutarını aşıyor.");
  const returnNumber=`IAD-${randomUUID().replace(/-/g,"").slice(0,16).toUpperCase()}`;
  const result=sqlite.prepare("INSERT INTO order_returns(return_number,order_id,order_number,reason,status,refund_amount,restock,warehouse_id,created_by) VALUES(?,?,?,?,?,?,?,?,?)").run(returnNumber,order.id,order.order_number,reason.slice(0,500),approved?"APPROVED":"REQUESTED",money(amount),restock?1:0,warehouseId,actor.name);
  const returnId=Number(result.lastInsertRowid),insert=sqlite.prepare("INSERT INTO order_return_items(return_id,order_item_id,product_id,variant_id,product_name,quantity,refund_amount) VALUES(?,?,?,?,?,?,?)");
  for(const r of rows) insert.run(returnId,r.item.id,r.item.product_id,r.item.variant_id,r.item.product_name,r.quantity,money(r.refund));
  if(order.status==='DELIVERED') {
    sqlite.prepare("UPDATE orders SET status='RETURN_REQUESTED' WHERE id=?").run(orderId);
    sqlite.prepare("INSERT INTO order_status_history(order_id,from_status,to_status,note,changed_by) VALUES(?,'DELIVERED','RETURN_REQUESTED',?,?)").run(orderId,`İade talebi ${returnNumber}`,actor.name);
  }
  audit(actor,"RETURN_CREATED",returnId,`${returnNumber}: ${money(amount)} TL`);
  return {id:returnId,returnNumber,refundAmount:money(amount),status:approved?"APPROVED":"REQUESTED"};
}

export function approveReturn(id:number,actor:Actor) {
  const r=currentReturn(id);ensureEligible(orderById(r.order_id));
  if(r.status!=="REQUESTED") throw new ReturnError("Yalnız talep aşamasındaki iade onaylanabilir.");
  sqlite.prepare("UPDATE order_returns SET status='APPROVED' WHERE id=?").run(id);audit(actor,"RETURN_APPROVED",id,r.return_number);
}
export function rejectReturn(id:number,actor:Actor) {
  const r=currentReturn(id);ensureEligible(orderById(r.order_id));
  if (!["REQUESTED","APPROVED"].includes(r.status)) throw new ReturnError("Teslim alınmış veya tamamlanmış iade reddedilemez.");
  // The cent allocation uses ordered quantity slots. Removing an earlier slot
  // while a later request survives would change its rounding allocation.
  const later = sqlite.prepare(`SELECT 1 FROM order_return_items mine JOIN order_return_items other ON other.order_item_id=mine.order_item_id JOIN order_returns later ON later.id=other.return_id WHERE mine.return_id=? AND later.id>? AND later.status<>'REJECTED' LIMIT 1`).get(id,id);
  if (later) throw new ReturnError("Bu kalem için daha sonra oluşturulmuş aktif iade var; tutar bütünlüğü için önce sonraki talepleri sonuçlandırın veya manuel inceleyin.");
  sqlite.prepare("UPDATE order_returns SET status='REJECTED',resolved_at=unixepoch() WHERE id=?").run(id);audit(actor,"RETURN_REJECTED",id,r.return_number);
  restoreOrderStatus(r.order_id,actor.name);
}
function restoreOrderStatus(orderId:number,actor:string) {
  const pending=sqlite.prepare("SELECT 1 FROM order_returns WHERE order_id=? AND status IN ('REQUESTED','APPROVED','RECEIVED') LIMIT 1").get(orderId);
  const order=orderById(orderId);
  if (!pending && order.status==='RETURN_REQUESTED') {
    sqlite.prepare("UPDATE orders SET status='DELIVERED' WHERE id=?").run(orderId);
    sqlite.prepare("INSERT INTO order_status_history(order_id,from_status,to_status,note,changed_by) VALUES(?,'RETURN_REQUESTED','DELIVERED','İade işlemi sonuçlandı',?)").run(orderId,actor);
  }
}
export function receiveReturn(id:number,actor:Actor) {
  const r=currentReturn(id);ensureEligible(orderById(r.order_id));
  if(r.status!=="APPROVED") throw new ReturnError("İade önce onaylanmalı ve yalnız bir kez teslim alınmalıdır.");
  const lines=sqlite.prepare("SELECT * FROM order_return_items WHERE return_id=? ORDER BY id").all(id) as Array<{product_id:number;variant_id:number|null;quantity:number;product_name:string}>;
  if(!lines.length) throw new ReturnError("İade kalemleri eksik; manuel inceleme gerekli.");
  if (r.restock && !r.warehouse_id) throw new ReturnError("İade deposu kaydı eksik; manuel inceleme gerekli.");
  if(r.restock) for(const it of lines) adjustInventorySync({warehouseId:r.warehouse_id!,productId:it.product_id,variantId:it.variant_id,quantityDelta:it.quantity,transactionType:"RETURN",referenceType:"RETURN",referenceId:r.return_number,note:`İade girişi (${r.return_number})`,createdBy:actor.name});
  sqlite.prepare("UPDATE order_returns SET status='RECEIVED' WHERE id=?").run(id);audit(actor,"RETURN_RECEIVED",id,r.return_number);
  processOrderQueueSync();
}
function correctLoyalty(order:Order, currentCents:number, actor:Actor) {
  if (!order.customer_id) return;
  const customer=sqlite.prepare("SELECT loyalty_points FROM customers WHERE id=?").get(order.customer_id) as {loyalty_points:number}|undefined;
  if(!customer) throw new ReturnError("Müşterinin puan kaydı bulunamadı; manuel inceleme gerekli.");
  const totals=sqlite.prepare(`SELECT type,COALESCE(SUM(points),0) points FROM loyalty_transactions WHERE order_id=? AND customer_id=? AND type IN ('EARN','SPEND','RETURN_REVERSE_EARN','RETURN_RESTORE_SPEND') GROUP BY type`).all(order.id,order.customer_id) as {type:string;points:number}[];
  const map=new Map(totals.map(x=>[x.type,x.points]));const earned=Math.max(0,map.get("EARN")||0),spent=Math.max(0,-(map.get("SPEND")||0));
  const previous=sqlite.prepare("SELECT COALESCE(SUM(CAST(refund_amount AS REAL)),0) total FROM order_returns WHERE order_id=? AND status='REFUNDED'").get(order.id) as {total:number};
  const paid=cents(order.grand_total), cumulative=Math.min(paid,cents(previous.total)+currentCents);
  if(paid<=0) return;
  const reverseEarn=Math.floor(earned*cumulative/paid)+Math.min(0,map.get("RETURN_REVERSE_EARN")||0);
  const restoreSpend=Math.floor(spent*cumulative/paid)-Math.max(0,map.get("RETURN_RESTORE_SPEND")||0);
  if(reverseEarn<0||restoreSpend<0) throw new ReturnError("Sadakat iade kayıtları tutarsız; manuel inceleme gerekli.");
  const insert=sqlite.prepare("INSERT INTO loyalty_transactions(customer_id,points,type,description,order_id) VALUES(?,?,?,?,?)");
  if(reverseEarn) insert.run(order.customer_id,-reverseEarn,"RETURN_REVERSE_EARN",`İade nedeniyle kazanılan puan geri alındı (${actor.name})`,order.id);
  if(restoreSpend) insert.run(order.customer_id,restoreSpend,"RETURN_RESTORE_SPEND",`İade nedeniyle kullanılan puan geri verildi (${actor.name})`,order.id);
  if(reverseEarn||restoreSpend) sqlite.prepare("UPDATE customers SET loyalty_points=loyalty_points+? WHERE id=?").run(restoreSpend-reverseEarn,order.customer_id);
}
export function completeReturn(id:number,actor:Actor,method?:string,shiftId?:number) {
  const r=currentReturn(id);if(r.status==='REFUNDED') return {id:r.id,returnNumber:r.return_number,refundTotal:Number(r.refund_amount),alreadyCompleted:true};
  const order=orderById(r.order_id);ensureEligible(order);if(r.status!=="RECEIVED") throw new ReturnError("İade önce teslim alınmalıdır.");
  const refund=cents(r.refund_amount);
  const existing=sqlite.prepare("SELECT COALESCE(SUM(CAST(refund_amount AS REAL)),0) total FROM order_returns WHERE order_id=? AND status='REFUNDED'").get(order.id) as {total:number};
  if(cents(existing.total)+refund>cents(order.grand_total)) throw new ReturnError("Toplam iade, ödenen tutarı aşıyor.");
  if(method) {
    if(!["CASH","CREDIT_CARD"].includes(method)) throw new ReturnError("Geçersiz iade yöntemi.",422);
    if (shiftId) {
      const shift=sqlite.prepare("SELECT status,total_returns_cash,total_returns_card,expected_amount FROM pos_shifts WHERE id=?").get(shiftId) as {status:string;total_returns_cash:number|string;total_returns_card:number|string;expected_amount:number|string}|undefined;
      if(!shift || shift.status!=="OPEN") throw new ReturnError("Açık POS vardiyası bulunamadı.");
      if(method==='CASH') {
        if(cents(shift.expected_amount)<refund) throw new ReturnError("Kasada iade için yeterli nakit görünmüyor.");
        sqlite.prepare("UPDATE pos_shifts SET total_returns_cash=?,expected_amount=? WHERE id=?").run(money(cents(shift.total_returns_cash)+refund),money(cents(shift.expected_amount)-refund),shiftId);
      } else sqlite.prepare("UPDATE pos_shifts SET total_returns_card=? WHERE id=?").run(money(cents(shift.total_returns_card)+refund),shiftId);
    }
  }
  correctLoyalty(order,refund,actor);
  sqlite.prepare("UPDATE order_returns SET status='REFUNDED',resolved_at=unixepoch() WHERE id=?").run(id);
  audit(actor,"REFUND_CONFIRMED",id,`${r.return_number}: ${money(refund)} TL manuel iade onayı${method?` (${method})`:""}`);
  const remaining=sqlite.prepare(`SELECT 1 FROM order_items i WHERE i.order_id=? AND i.quantity > COALESCE((SELECT SUM(ri.quantity) FROM order_return_items ri JOIN order_returns r ON r.id=ri.return_id WHERE ri.order_item_id=i.id AND r.status='REFUNDED'),0) LIMIT 1`).get(order.id);
  if(!remaining) {
    sqlite.prepare("UPDATE orders SET status='REFUNDED',payment_status='REFUNDED' WHERE id=?").run(order.id);
    sqlite.prepare("INSERT INTO order_status_history(order_id,from_status,to_status,note,changed_by) VALUES(?,?,'REFUNDED',?,?)").run(order.id,order.status,`Tüm ürünler için iade tamamlandı: ${r.return_number}`,actor.name);
  } else restoreOrderStatus(order.id,actor.name);
  return {id:r.id,returnNumber:r.return_number,refundTotal:refund/100,alreadyCompleted:false};
}
