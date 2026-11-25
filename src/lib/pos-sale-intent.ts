import { sharedSalesWarehouseId } from "@/lib/shared-sales-warehouse";
import { createHash, randomUUID } from "node:crypto";
import { db, sqlite } from "@/db";
import { orders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { posQuote } from "@/lib/pos-quote";
import { getSettingsSync } from "@/lib/settings";
import { reservePosStock, finishPosStock, StockShortage } from "@/lib/inventory-engine";

type Actor={id:number;name:string;role:string};
type Payload=Record<string,any>;
type Quote=ReturnType<typeof posQuote>;
type Intent={request_key:string;request_hash:string;actor_id:number;actor_name:string;shift_id:number;status:string;payload_json:string;quote_json:string;coupon_id:number|null;points_transaction_id:number|null;earn_points:number;order_id:number|null};
const keyValid=(key:unknown):key is string=>typeof key==='string' && /^[a-f0-9-]{36}$/i.test(key);
const hash=(p:Payload)=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
const cents=(value:unknown)=> { const n=Number(value);if(!Number.isFinite(n)||Math.abs(n*100-Math.round(n*100))>0.000001)throw new StockShortage('Geçersiz ödeme tutarı.');const c=Math.round(n*100);if(!Number.isSafeInteger(c)||c<0)throw new StockShortage('Geçersiz ödeme tutarı.');return c; };
function audit(actor:Actor, action:string, key:string, details:string) {
 sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,?,'PosSaleIntent',?,?)").run(String(actor.id),actor.name,action,key,details);
}
function access(intent:Intent,actor:Actor) {
 if(intent.actor_id!==actor.id&&!['SUPER_ADMIN','STORE_MANAGER'].includes(actor.role))throw new StockShortage('Bu satış hazırlığı başka kasiyere ait.');
}
function fetchIntent(key:unknown):Intent {
 if(!keyValid(key))throw new StockShortage('Geçersiz işlem anahtarı.');
 const row=sqlite.prepare('SELECT * FROM pos_sale_intents WHERE request_key=?').get(key) as Intent|undefined;
 if(!row)throw new StockShortage('Satış hazırlığı bulunamadı; tahsilata devam etmeyin.');return row;
}
function split(p:Payload,total:number) {
 const amount=cents(total), method=p.paymentMethod;
 if(!['CASH','CREDIT_CARD','SPLIT'].includes(method))throw new StockShortage('Geçersiz POS ödeme yöntemi.');
 const cash=method==='CASH'?amount:method==='SPLIT'?cents(p.splitCash):0, card=method==='CREDIT_CARD'?amount:method==='SPLIT'?cents(p.splitCard):0;
 if(cash+card!==amount||(method==='SPLIT'&&(!cash||!card)))throw new StockShortage('Nakit ve kart tutarları toplamla eşleşmiyor.');
 return {cash,card};
}

/** Caller uses an IMMEDIATE transaction. No payment is taken here. */
export function preparePosSale(p:Payload,actor:Actor) {
 if(!p || typeof p!=='object' || Array.isArray(p) || p.orderType!=='POS' || !keyValid(p.posRequestKey))throw new StockShortage('Geçersiz POS hazırlığı.');
 const existing=sqlite.prepare('SELECT * FROM pos_sale_intents WHERE request_key=?').get(p.posRequestKey) as Intent|undefined;
 if(existing){access(existing,actor);if(existing.request_hash!==hash(p))throw new StockShortage('İşlem anahtarı başka bir satışa ait.');if(existing.status==='CANCELLED')throw new StockShortage('Bu satış hazırlığı iptal edildi.');return {key:existing.request_key,status:existing.status,quote:JSON.parse(existing.quote_json)};}
 if(sqlite.prepare('SELECT 1 FROM pos_sale_requests WHERE request_key=?').get(p.posRequestKey))throw new StockShortage('İşlem anahtarı daha önce kullanıldı.');
 const warehouseId=sharedSalesWarehouseId();
 const shiftId=Number(p.posShiftId),shift=sqlite.prepare("SELECT id FROM pos_shifts WHERE id=? AND warehouse_id=? AND status='OPEN'").get(shiftId,warehouseId);
 if(!warehouseId||!Number.isSafeInteger(shiftId)||!shift||Number(p.warehouseId)!==warehouseId)throw new StockShortage('Açık mağaza vardiyası gerekli.');
 const customerId=p.customerId?Number(p.customerId):null;
 if(customerId && (!Number.isSafeInteger(customerId)||!sqlite.prepare('SELECT 1 FROM customers WHERE id=?').get(customerId)))throw new StockShortage('Müşteri kaydı bulunamadı.');
 const q=posQuote(p.items,p.discountTotal??0,true,p.couponCode,p.spentPoints,customerId);
 if(cents(p.grandTotal)!==cents(q.grandTotal))throw new StockShortage('Fiyat veya kampanya değişti; tahsilat yapmadan sepeti yenileyin.');split(p,q.grandTotal);
 const settings=getSettingsSync(),rate=Number(settings['loyalty.earn_rate_tl']),earnRate=Number(settings['loyalty.earn_points']);
 const earned=customerId?Math.floor(q.grandTotal/rate*earnRate):0;
 if(!Number.isSafeInteger(earned)||earned<0)throw new StockShortage('Sadakat ayarları geçersiz.');
 let couponId:number|null=null,pointsId:number|null=null;
 if(p.couponCode) {const coupon=sqlite.prepare('SELECT id FROM coupons WHERE code=?').get(String(p.couponCode).trim().toUpperCase()) as {id:number};couponId=coupon.id;sqlite.prepare('UPDATE coupons SET used_count=used_count+1 WHERE id=?').run(couponId);}
 for(const id of new Set(q.promotions.map(a=>a.id))) sqlite.prepare('UPDATE promotions SET used_count=used_count+1 WHERE id=?').run(id);
 const points=Number(p.spentPoints||0);
 if(points){sqlite.prepare('UPDATE customers SET loyalty_points=loyalty_points-? WHERE id=?').run(points,customerId);pointsId=Number(sqlite.prepare("INSERT INTO loyalty_transactions(customer_id,points,type,description) VALUES(?,?,'POS_HOLD',?)").run(customerId,-points,`POS hazırlığı ${p.posRequestKey}`).lastInsertRowid);}
 sqlite.prepare('INSERT INTO pos_sale_intents(request_key,request_hash,actor_id,actor_name,shift_id,payload_json,quote_json,coupon_id,points_transaction_id,earn_points) VALUES(?,?,?,?,?,?,?,?,?,?)').run(p.posRequestKey,hash(p),actor.id,actor.name,shiftId,JSON.stringify(p),JSON.stringify(q),couponId,pointsId,earned);
 for(const line of q.lines) reservePosStock({warehouseId:warehouseId!,productId:line.productId,variantId:line.variantId,qty:line.quantity,referenceId:p.posRequestKey,createdBy:actor.name});
 audit(actor,'POS_SALE_PREPARED',p.posRequestKey,`${q.grandTotal.toFixed(2)} TL; stok ve indirim hakları ayrıldı, tahsilat yapılmadı.`);
 return {key:p.posRequestKey,status:'PREPARED',quote:q};
}
export function cancelPosSale(key:unknown,actor:Actor,payload?:Payload) {
 if(!keyValid(key))throw new StockShortage('Geçersiz işlem anahtarı.');
 let intent=sqlite.prepare('SELECT * FROM pos_sale_intents WHERE request_key=?').get(key) as Intent|undefined;
 if(!intent) {
   // A cancellation tombstone fences a delayed PREPARE after a lost response.
   if(!payload || payload.posRequestKey!==key || payload.orderType!=='POS')throw new StockShortage('Hazırlık verisi gerekli.');
   if(sqlite.prepare('SELECT 1 FROM pos_sale_requests WHERE request_key=?').get(key))throw new StockShortage('Bu anahtarla tamamlanmış satış var.');
   sqlite.prepare("INSERT INTO pos_sale_intents(request_key,request_hash,actor_id,actor_name,shift_id,status,payload_json,quote_json,resolved_at) VALUES(?,?,?,?,?,'CANCELLED','{}','{}',unixepoch())").run(key,hash(payload),actor.id,actor.name,Number(payload.posShiftId)||0);
   audit(actor,'POS_SALE_CANCELLED',key,'Personel tahsilat yapılmadığını doğruladı; gecikmiş hazırlık engellendi.');
   return {key,status:'CANCELLED'};
 }
 access(intent,actor);
 if(payload && intent.request_hash!==hash(payload))throw new StockShortage('İşlem verisi eşleşmiyor.');
 if(intent.status==='CANCELLED')return {key:intent.request_key,status:'CANCELLED'};
 if(intent.status!=='PREPARED')throw new StockShortage('Tamamlanmış satış iptal edilemez; iade akışını kullanın.');
 const q=JSON.parse(intent.quote_json) as Quote,p=JSON.parse(intent.payload_json) as Payload;
 finishPosStock(intent.request_key,q.lines,'RELEASED','',actor.name,Number(p.warehouseId));
 if(intent.coupon_id && sqlite.prepare('UPDATE coupons SET used_count=used_count-1 WHERE id=? AND used_count>0').run(intent.coupon_id).changes!==1)throw new StockShortage('Kupon sayacı tutarsız; yetkili incelemesi gerekli.');
 for(const id of new Set(q.promotions.map(a=>a.id)))if(sqlite.prepare('UPDATE promotions SET used_count=used_count-1 WHERE id=? AND used_count>0').run(id).changes!==1)throw new StockShortage('Kampanya sayacı tutarsız; yetkili incelemesi gerekli.');
 if(intent.points_transaction_id){const tx=sqlite.prepare("SELECT customer_id,points FROM loyalty_transactions WHERE id=? AND type='POS_HOLD'").get(intent.points_transaction_id) as {customer_id:number;points:number}|undefined;if(!tx || sqlite.prepare('UPDATE customers SET loyalty_points=loyalty_points-? WHERE id=?').run(tx.points,tx.customer_id).changes!==1)throw new StockShortage('Puan rezervasyonu tutarsız.');sqlite.prepare("INSERT INTO loyalty_transactions(customer_id,points,type,description) VALUES(?,?,'POS_HOLD_RELEASE',?)").run(tx.customer_id,-tx.points,`POS hazırlığı iptal edildi: ${intent.request_key}`);}
 sqlite.prepare("UPDATE pos_sale_intents SET status='CANCELLED',payload_json='{}',resolved_at=unixepoch() WHERE request_key=?").run(intent.request_key);
 audit(actor,'POS_SALE_CANCELLED',intent.request_key,`${Number(p.grandTotal).toFixed(2)} TL; personel tahsilat yapılmadığını doğruladı.`);
 return {key:intent.request_key,status:'CANCELLED'};
}
export function completePosSale(key:unknown,actor:Actor) {
 const intent=fetchIntent(key);access(intent,actor);
 if(intent.status==='COMPLETED' && intent.order_id){const order=db.select().from(orders).where(eq(orders.id,intent.order_id)).get();if(!order)throw new StockShortage('Satış kaydı tutarsız.');return {order,alreadyCompleted:true,cashierName:intent.actor_name};}
 if(intent.status!=='PREPARED')throw new StockShortage('İptal edilmiş satış tamamlanamaz.');
 const p=JSON.parse(intent.payload_json) as Payload,q=JSON.parse(intent.quote_json) as Quote,{cash,card}=split(p,q.grandTotal);
 const shift=sqlite.prepare("SELECT * FROM pos_shifts WHERE id=? AND warehouse_id=? AND status='OPEN'").get(intent.shift_id,Number(p.warehouseId)) as {total_sales_cash:number;total_sales_card:number;total_sales_split:number;expected_amount:number;opening_amount:number}|undefined;
 if(!shift)throw new StockShortage('Vardiya kapalı veya bulunamadı; tahsilat yapılmışsa tekrar tahsil etmeden yöneticiyi bilgilendirin.');
 const orderNumber=`POS-${new Date().getFullYear()}-${randomUUID().slice(0,12).toUpperCase()}`;
 const result=sqlite.prepare(`INSERT INTO orders(order_number,order_type,customer_id,customer_name,customer_phone,status,payment_status,payment_method,subtotal,discount_total,tax_total,shipping_total,grand_total,pos_shift_id,notes) VALUES(?,'POS',?,?,?,'DELIVERED','PAID',?,?,?,?,0,?,?,?)`).run(orderNumber,p.customerId?Number(p.customerId):null,String(p.customerName||'Kasa Misafiri'),p.customerPhone||null,p.paymentMethod,q.subtotal,q.manualDiscount+q.promotionDiscount+q.couponDiscount+q.pointsDiscount,Math.round(q.grandTotal*20)/100,q.grandTotal,intent.shift_id,q.promotions.length?`Kampanya: ${q.promotions.map(x=>x.name).join(', ')}`:null);
 const orderId=Number(result.lastInsertRowid),insert=sqlite.prepare('INSERT INTO order_items(order_id,product_id,variant_id,product_name,variant_name,sku,barcode,unit_price,quantity,tax_rate,total_price) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
 for(let i=0;i<q.lines.length;i++){const line=q.lines[i],item=p.items[i];insert.run(orderId,line.productId,line.variantId,String(item.productName||'Ürün'),item.variantName||null,String(item.sku||`SKU-${line.productId}`),item.barcode||null,line.unitPrice,line.quantity,20,(line.unitPrice*line.quantity).toFixed(2));}
 finishPosStock(intent.request_key,q.lines,'CONSUMED',orderNumber,actor.name,Number(p.warehouseId));
 sqlite.prepare('INSERT INTO pos_sale_payments(order_id,cash_amount,card_amount) VALUES(?,?,?)').run(orderId,cash,card);
 sqlite.prepare('UPDATE pos_shifts SET total_sales_cash=?,total_sales_card=?,total_sales_split=?,expected_amount=? WHERE id=?').run((Number(shift.total_sales_cash||0)+cash/100).toFixed(2),(Number(shift.total_sales_card||0)+card/100).toFixed(2),(Number(shift.total_sales_split||0)+(p.paymentMethod==='SPLIT'?q.grandTotal:0)).toFixed(2),(Number(shift.expected_amount??shift.opening_amount)+cash/100).toFixed(2),intent.shift_id);
 if(p.customerId){
   if(sqlite.prepare('UPDATE customers SET loyalty_points=loyalty_points+? WHERE id=?').run(intent.earn_points,Number(p.customerId)).changes!==1)throw new StockShortage('Müşteri puan kaydı bulunamadı.');
   if(intent.points_transaction_id && sqlite.prepare("UPDATE loyalty_transactions SET type='SPEND',order_id=?,description=? WHERE id=? AND type='POS_HOLD'").run(orderId,`Sipariş #${orderNumber} puan kullanımı`,intent.points_transaction_id).changes!==1)throw new StockShortage('Puan rezervasyonu bulunamadı.');
   sqlite.prepare("INSERT INTO loyalty_transactions(customer_id,points,type,description,order_id) VALUES(?,?,'EARN',?,?)").run(Number(p.customerId),intent.earn_points,`Sipariş #${orderNumber} alışverişinden kazanılan puan`,orderId);
 }
 sqlite.prepare("INSERT INTO order_status_history(order_id,from_status,to_status,note,changed_by) VALUES(?,NULL,'DELIVERED','POS tahsilatı personel tarafından doğrulandı',?)").run(orderId,actor.name);
 sqlite.prepare('INSERT INTO pos_sale_requests(request_key,request_hash,actor_id,order_id) VALUES(?,?,?,?)').run(intent.request_key,intent.request_hash,intent.actor_id,orderId);
 sqlite.prepare("UPDATE pos_sale_intents SET status='COMPLETED',order_id=?,payload_json='{}',resolved_at=unixepoch() WHERE request_key=?").run(orderId,intent.request_key);
 audit(actor,'POS_SALE_COMPLETED',intent.request_key,`${orderNumber}: ${q.grandTotal.toFixed(2)} TL harici tahsilat onayı`);
 return {order:db.select().from(orders).where(eq(orders.id,orderId)).get()!,alreadyCompleted:false,cashierName:intent.actor_name};
}
