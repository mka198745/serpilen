import { createHash } from "node:crypto";
import { sqlite } from "@/db";
import { normalizeRoleMatrix, type MatrixRole } from "@/lib/admin-modules";
import { adjustInventorySync } from "@/lib/inventory-engine";
import { processOrderQueueSync } from "@/lib/order-queue";
import { retainRefundReplayGuard } from "@/lib/refund-replay-guard";
import { planStockReversal, StockPlanError, type DeletionReturn, type HistoricalMovement, type InventoryBalance } from "@/lib/order-deletion-stock-plan";

type Actor={id:number;name:string;role:string;sessionHash?:string};
type Kind="order"|"return";
type Order={id:number;order_number:string;order_type:string;status:string;payment_status:string;payment_method:string;grand_total:number|string;discount_total:number|string;customer_id:number|null;pos_shift_id:number|null};
type ReturnRow={id:number;order_id:number;order_number:string;return_number:string;status:string;restock:number;warehouse_id:number|null;refund_amount:number|string|null};
type Item={id:number;product_id:number;variant_id:number|null;quantity:number;product_name:string};
type ReturnItem={order_item_id:number;product_id:number;variant_id:number|null;quantity:number;refund_amount:number|string};
type Movement={id:number;transaction_type:string;warehouse_id:number;product_id:number;variant_id:number|null;quantity:number};
type StockDisplay={warehouseId:number;warehouseName:string;productId:number;productName:string;variantId:number|null;variantName:string|null;physical:number;reserved:number;delta:number;after:number};
type DiscountEffect={kind:'COUPON'|'PROMOTION';id:number;name:string;current:number;after:number};
type Rights={loyalty:{customerId:number;current:number;delta:number;after:number}|null;discounts:DiscountEffect[];basis:string;legacyReviewRequired:boolean};
export type OrderDeletionPreview={kind:Kind;id:number;number:string;orderNumber:string;returnCount:number;stocks:StockDisplay[];rights:Rights;fingerprint:string};
export class DeletionError extends Error { constructor(message:string,public status=409){super(message);} }
function fail(message:string,status=409):never {throw new DeletionError(message,status);}
const validId=(id:number)=>Number.isSafeInteger(id)&&id>0;
const cleanMoney=(v:unknown)=>{const x=Number(v),c=Math.round(x*100);if((typeof v!=="number"&&typeof v!=="string")||!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(v))||!Number.isFinite(x)||x<0||!Number.isSafeInteger(c)||Math.abs(x*100-c)>0.000001)fail("Ödeme tutarı tutarsız; manuel inceleme gerekli.");return c;};
function authorize(actor:Actor){
 const user=sqlite.prepare("SELECT role,is_active FROM users WHERE id=?").get(actor.id) as {role:string;is_active:number}|undefined;
 if(!user||!user.is_active||user.role!==actor.role)fail("Silme yetkiniz bulunmuyor.",403);
 const setting=sqlite.prepare("SELECT value FROM app_settings WHERE key='admin.role_matrix'").get() as {value:string}|undefined;
 let matrix:unknown;try{matrix=setting?.value?JSON.parse(setting.value):null;}catch{matrix=null;}
 const row=normalizeRoleMatrix(matrix)[user.role as MatrixRole];
 if(!row?.orders||!row.orderReturnDelete)fail("Siparişler ve sipariş/iade silme yetkisi gereklidir.",403);
}
function assertNoUnknownReferences(orderId:number,returnIds:number[],itemIds:number[]){
 const allow=new Set(['order_items','order_returns','order_return_items','order_status_history','order_discount_claims','order_notification_outbox','loyalty_transactions','pos_return_context','pos_sale_requests','pos_sale_payments','pos_sale_intents','deleted_refund_guards','deleted_refund_guard_items']);
 const tables=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name:string}[];
 const quote=(s:string)=>`"${s.replace(/"/g,'""')}"`;
 for(const {name} of tables){
  if(allow.has(name))continue;
  const cols=(sqlite.prepare(`PRAGMA table_info(${quote(name)})`).all() as {name:string}[]).map(x=>x.name);
  for(const [col,ids] of [['order_id',[orderId]],['return_id',returnIds],['order_item_id',itemIds]] as [string,number[]][]){
   if(!cols.includes(col))continue;
   const q=sqlite.prepare(`SELECT 1 FROM ${quote(name)} WHERE ${quote(col)}=? LIMIT 1`);
   if(ids.some(id=>q.get(id)))fail("Siparişle ilişkili bilinmeyen kayıt bulundu; manuel inceleme gerekli.");
  }
 }
}
function inspectRights(order:Order,keys:{request_key:string}[]):Rights {
 const transactions=sqlite.prepare('SELECT id,customer_id,points,type FROM loyalty_transactions WHERE order_id=? ORDER BY id').all(order.id) as {id:number;customer_id:number;points:number;type:string}[];
 const allowed=new Set(['EARN','SPEND','RETURN_REVERSE_EARN','RETURN_RESTORE_SPEND']);
 if(transactions.some(t=>!allowed.has(t.type)||!Number.isSafeInteger(t.points)||t.customer_id!==order.customer_id||((t.type==='EARN'||t.type==='RETURN_RESTORE_SPEND')&&t.points<0)||((t.type==='SPEND'||t.type==='RETURN_REVERSE_EARN')&&t.points>0)))fail("Sadakat kayıtları tutarsız; manuel mutabakat gerekli.");
 if(order.customer_id===null&&transactions.length)fail("Müşteri sadakat kayıtları tutarsız.");
 let loyalty:Rights['loyalty']=null;
 if(order.customer_id!==null){
  const customer=sqlite.prepare('SELECT loyalty_points FROM customers WHERE id=?').get(order.customer_id) as {loyalty_points:number}|undefined;
  if(!customer||!Number.isSafeInteger(customer.loyalty_points)||!transactions.some(t=>t.type==='EARN'))fail("Müşteri puan geçmişi eksik; manuel mutabakat gerekli.");
  const sum=(type:string)=>transactions.filter(t=>t.type===type).reduce((n,t)=>n+t.points,0),earn=sum('EARN'),spent=-sum('SPEND'),reversed=-sum('RETURN_REVERSE_EARN'),restored=sum('RETURN_RESTORE_SPEND');
  if(![earn,spent,reversed,restored].every(Number.isSafeInteger)||reversed>earn||restored>spent)fail("Puan iade kayıtları tutarsız.");
  const net=earn-spent-reversed+restored,delta=-net,after=customer.loyalty_points+delta;
  if(!Number.isSafeInteger(net)||!Number.isSafeInteger(after)||after<0)fail("Müşterinin puanı ters işlem için yetersiz; manuel mutabakat gerekli.");
  loyalty={customerId:order.customer_id,current:customer.loyalty_points,delta,after};
 }
 const claims=sqlite.prepare('SELECT id,kind,target_id,status FROM order_discount_claims WHERE order_id=? ORDER BY id').all(order.id) as {id:number;kind:string;target_id:number;status:string}[];
 const targets:Array<{kind:'COUPON'|'PROMOTION';id:number}>=[];let intentEvidence:unknown=null,legacyReviewRequired=false;
 if(order.order_type==='ONLINE_B2C'){
  legacyReviewRequired=claims.filter(c=>c.kind==='COVERAGE'&&c.target_id===0).length===0;
  if(claims.some(c=>c.status!=='ACTIVE'||!['COVERAGE','COUPON','PROMOTION'].includes(c.kind)||(c.kind==='COVERAGE'?c.target_id!==0:!validId(c.target_id))))fail("İndirim hakkı geçmişi eksik veya tutarsız; manuel mutabakat gerekli.");
  for(const c of claims)if(c.kind==='COUPON'||c.kind==='PROMOTION')targets.push({kind:c.kind,id:c.target_id});
  if(cleanMoney(order.discount_total)>0&&!targets.length)fail("İndirim hakları belgesiz; manuel mutabakat gerekli.");
 }else{
  if(claims.length)fail("POS indirim kayıtları tutarsız.");
  const intents=sqlite.prepare('SELECT request_key,status,coupon_id,quote_json,earn_points,points_transaction_id FROM pos_sale_intents WHERE order_id=?').all(order.id) as {request_key:string;status:string;coupon_id:number|null;quote_json:string;earn_points:number;points_transaction_id:number|null}[];
  if(intents.length!==1||keys.length!==1||intents[0].request_key!==keys[0].request_key||intents[0].status!=='COMPLETED')fail("POS indirim hakları belgesiz; manuel mutabakat gerekli.");
  const intent=intents[0];intentEvidence=intent;let quote:unknown;try{quote=JSON.parse(intent.quote_json);}catch{fail("POS indirim bilgisi okunamadı.");}
  if(!quote||typeof quote!=='object'||!Array.isArray((quote as {promotions?:unknown}).promotions))fail("POS kampanya bilgisi eksik.");
  const promotions=(quote as {promotions:{id:unknown}[]}).promotions;
  if(promotions.some(p=>!p||!validId(Number(p.id))))fail("POS kampanya bilgisi tutarsız.");
  for(const id of new Set(promotions.map(p=>Number(p.id))))targets.push({kind:'PROMOTION',id});
  if(intent.coupon_id!==null){if(!validId(intent.coupon_id))fail("POS kupon bilgisi tutarsız.");targets.push({kind:'COUPON',id:intent.coupon_id});}
  if(order.customer_id!==null){const earned=transactions.filter(t=>t.type==='EARN').reduce((n,t)=>n+t.points,0);const spends=transactions.filter(t=>t.type==='SPEND');if(!Number.isSafeInteger(intent.earn_points)||intent.earn_points!==earned||(intent.points_transaction_id===null?spends.length!==0:spends.length!==1||spends[0].id!==intent.points_transaction_id))fail("POS puan hakları tutarsız.");}
  else if(intent.earn_points!==0||intent.points_transaction_id!==null)fail("POS müşteri puan kaydı tutarsız.");
 }
 if(new Set(targets.map(t=>`${t.kind}:${t.id}`)).size!==targets.length)fail("İndirim hakkı yinelenmiş.");
 const discounts=targets.map(t=>{const table=t.kind==='COUPON'?'coupons':'promotions',name=t.kind==='COUPON'?'code':'name';const row=sqlite.prepare(`SELECT ${name} AS name,used_count FROM ${table} WHERE id=?`).get(t.id) as {name:string;used_count:number}|undefined;if(!row||!Number.isSafeInteger(row.used_count)||row.used_count<1)fail("İndirim kullanım sayacı eksik veya tutarsız.");return {...t,name:row.name,current:row.used_count,after:row.used_count-1};});
 const basis=createHash('sha256').update(JSON.stringify({transactions,claims,intentEvidence})).digest('hex');
 return {loyalty,discounts,basis,legacyReviewRequired};
}
function inspect(kind:Kind,id:number,actor:Actor):OrderDeletionPreview {
 authorize(actor);
 if(!validId(id)||!['order','return'].includes(kind))fail("Geçersiz kayıt numarası.",422);
 if((sqlite.pragma('foreign_key_check') as unknown[]).length)fail("Veritabanı ilişkileri tutarsız; manuel inceleme gerekli.");
 const target=kind==='return'?sqlite.prepare('SELECT * FROM order_returns WHERE id=?').get(id) as ReturnRow|undefined:undefined;
 if(kind==='return'&&!target)fail("İade bulunamadı.",404);
 const order=sqlite.prepare('SELECT id,order_number,order_type,status,payment_status,payment_method,grand_total,discount_total,customer_id,pos_shift_id FROM orders WHERE id=?').get(target?.order_id??id) as Order|undefined;
 if(!order)fail("Sipariş bulunamadı.",404);
 if(!(['DELIVERED','REFUNDED'].includes(order.status)&&['PAID','REFUNDED'].includes(order.payment_status)))fail("Açık veya belirsiz ödeme/sipariş durumu; manuel mutabakat gerekli.");
 if((order.status==='REFUNDED')!==(order.payment_status==='REFUNDED'))fail("Sipariş ve ödeme durumları tutarsız.");
 const orderItems=sqlite.prepare('SELECT id,product_id,variant_id,quantity,product_name FROM order_items WHERE order_id=? ORDER BY id').all(order.id) as Item[];
 if(!orderItems.length)fail("Sipariş kalemleri eksik.");
 const returns=sqlite.prepare('SELECT id,order_id,order_number,return_number,status,restock,warehouse_id,refund_amount FROM order_returns WHERE order_id=? ORDER BY id').all(order.id) as ReturnRow[];
 if(returns.some(r=>!['REFUNDED','REJECTED'].includes(r.status)||r.order_number!==order.order_number))fail("Sonuçlanmamış veya tutarsız iade var; işlem durduruldu.");
 if(target&&!returns.some(r=>r.id===target.id))fail("İade ile sipariş uyuşmuyor.");
 const keys=sqlite.prepare('SELECT request_key FROM pos_sale_requests WHERE order_id=?').all(order.id) as {request_key:string}[];
 if(sqlite.prepare("SELECT 1 FROM inventory_reservations WHERE status='ACTIVE' AND ((reference_type IN ('PAYMENT_HOLD','ORDER') AND reference_id IN (?,?)) OR (reference_type='POS_SALE_HOLD' AND reference_id IN (SELECT request_key FROM pos_sale_requests WHERE order_id=?))) LIMIT 1").get(String(order.id),order.order_number,order.id))fail("Siparişin aktif stok rezervasyonu var.");
 if(sqlite.prepare("SELECT 1 FROM pos_sale_intents WHERE order_id=? AND status<>'COMPLETED' LIMIT 1").get(order.id))fail("POS işlemi sonuçlanmamış.");
 if(sqlite.prepare("SELECT 1 FROM order_notification_outbox WHERE order_id=? AND status IN ('PENDING','SENDING') LIMIT 1").get(order.id))fail("Siparişin bekleyen bildirimi var.");
 if(order.order_type==='POS'){
  const shift=sqlite.prepare('SELECT status FROM pos_shifts WHERE id=?').get(order.pos_shift_id) as {status:string}|undefined;
  const payment=sqlite.prepare('SELECT cash_amount,card_amount FROM pos_sale_payments WHERE order_id=?').get(order.id) as {cash_amount:number;card_amount:number}|undefined;
  if(!shift||shift.status!=='CLOSED'||keys.length!==1||!payment||!Number.isSafeInteger(payment.cash_amount)||!Number.isSafeInteger(payment.card_amount)||payment.cash_amount<0||payment.card_amount<0||payment.cash_amount+payment.card_amount!==cleanMoney(order.grand_total)||!['CASH','CREDIT_CARD','SPLIT'].includes(order.payment_method)||(order.payment_method==='CASH'&&payment.card_amount!==0)||(order.payment_method==='CREDIT_CARD'&&payment.cash_amount!==0)||(order.payment_method==='SPLIT'&&(!payment.cash_amount||!payment.card_amount)))fail("POS tahsilat anahtarı, vardiya veya ödeme kaydı belirsiz; manuel mutabakat gerekli.");
 }else if(order.order_type!=='ONLINE_B2C'||order.payment_method!=='EFT_HAVALE'||keys.length||order.pos_shift_id!==null||sqlite.prepare('SELECT 1 FROM pos_sale_payments WHERE order_id=?').get(order.id)||sqlite.prepare('SELECT 1 FROM pos_sale_intents WHERE order_id=?').get(order.id))fail("Sipariş kanalı veya ödeme kaydı belirsiz.");
 const rights=kind==='order'?inspectRights(order,keys):{loyalty:null,discounts:[],basis:'',legacyReviewRequired:false};
 assertNoUnknownReferences(order.id,returns.map(r=>r.id),orderItems.map(i=>i.id));
 const itemMap=new Map(orderItems.map(i=>[i.id,i]));
 const foreign=sqlite.prepare(`SELECT 1 FROM order_return_items ri LEFT JOIN order_returns r ON r.id=ri.return_id WHERE ri.order_item_id=? AND (r.id IS NULL OR r.order_id<>?) LIMIT 1`);
 if(orderItems.some(i=>foreign.get(i.id,order.id)))fail("Sipariş kalemlerine ait yabancı iade kayıtları var.");
 const guardItems=sqlite.prepare(`SELECT gi.order_item_id,gi.quantity,g.return_id FROM deleted_refund_guard_items gi JOIN deleted_refund_guards g ON g.return_id=gi.return_id WHERE g.order_id=? AND NOT EXISTS(SELECT 1 FROM order_returns r WHERE r.id=g.return_id) ORDER BY g.return_id,gi.order_item_id`).all(order.id) as {order_item_id:number;quantity:number;return_id:number}[];
 const deletedGuards=sqlite.prepare(`SELECT g.return_id,g.refund_cents,COUNT(gi.order_item_id) item_count,COALESCE(SUM(gi.refund_cents),0) item_cents FROM deleted_refund_guards g LEFT JOIN deleted_refund_guard_items gi ON gi.return_id=g.return_id WHERE g.order_id=? AND NOT EXISTS(SELECT 1 FROM order_returns r WHERE r.id=g.return_id) GROUP BY g.return_id ORDER BY g.return_id`).all(order.id) as {return_id:number;refund_cents:number;item_count:number;item_cents:number}[];
 if(deletedGuards.some(g=>!Number.isSafeInteger(g.refund_cents)||g.refund_cents<0||g.item_count<1||g.item_cents!==g.refund_cents))fail("Önceki iade tutarı tutarsız.");
 const refundedTotal=returns.filter(r=>r.status==='REFUNDED').reduce((n,r)=>n+cleanMoney(r.refund_amount),0)+deletedGuards.reduce((n,g)=>n+g.refund_cents,0);
 if(!Number.isSafeInteger(refundedTotal)||refundedTotal>cleanMoney(order.grand_total))fail("Önceki iadelerin toplam tutarı sipariş ödemesini aşıyor.");
 const totals=new Map<number,number>();for(const g of guardItems){if(!itemMap.has(g.order_item_id)||!Number.isSafeInteger(g.quantity)||g.quantity<1)fail("Önceki iade koruma kaydı tutarsız.");totals.set(g.order_item_id,(totals.get(g.order_item_id)??0)+g.quantity);}
 for(const r of returns.filter(r=>r.status==='REFUNDED')){
  const entries=sqlite.prepare('SELECT order_item_id,quantity FROM order_return_items WHERE return_id=?').all(r.id) as {order_item_id:number;quantity:number}[];
  for(const i of entries){if(!itemMap.has(i.order_item_id)||!Number.isSafeInteger(i.quantity)||i.quantity<1)fail("İade kalemi tutarsız.");totals.set(i.order_item_id,(totals.get(i.order_item_id)??0)+i.quantity);}
 }
 for(const [itemId,qty] of totals)if(!Number.isSafeInteger(qty)||qty>itemMap.get(itemId)!.quantity)fail("Önceki iade miktarı satış miktarını aşıyor.");
 for(const r of returns){
  const context=sqlite.prepare('SELECT shift_id,refund_method FROM pos_return_context WHERE return_id=?').get(r.id) as {shift_id:number;refund_method:string}|undefined;
  if(order.order_type==='POS'&&!context)fail("POS iade ödeme kaydı eksik; manuel mutabakat gerekli.");
  if(context){const shift=sqlite.prepare('SELECT status FROM pos_shifts WHERE id=?').get(context.shift_id) as {status:string}|undefined;if(order.order_type!=='POS'||!['CASH','CREDIT_CARD'].includes(context.refund_method)||!shift||shift.status!=='CLOSED')fail("İade POS vardiyası açık veya belirsiz.");}
 }
 if(sqlite.prepare('SELECT 1 FROM inventory_ledger WHERE reference_type=? AND reference_id=? LIMIT 1').get(kind==='order'?'ORDER_DELETION':'RETURN_DELETION',String(id)))fail("Bu kayıt için önceki stok tersleme hareketi var; manuel inceleme gerekli.");
 const getMoves=(type:string,number:string,transaction:string):Movement[]=>{
  const rows=sqlite.prepare('SELECT id,transaction_type,warehouse_id,product_id,variant_id,quantity FROM inventory_ledger WHERE reference_type=? AND reference_id=? ORDER BY id').all(type,number) as Movement[];
  if(rows.some(r=>r.transaction_type!==transaction))fail("Stok hareket türleri tutarsız.");return rows;
 };
 const convert=(rows:Movement[]):HistoricalMovement[]=>rows.map(r=>({warehouseId:r.warehouse_id,productId:r.product_id,variantId:r.variant_id,quantity:r.quantity}));
 const allReturnPlans:DeletionReturn[]=returns.map(r=>{
  if(r.restock!==0&&r.restock!==1)fail("İade stok bilgisi tutarsız.");
  const items=sqlite.prepare('SELECT order_item_id,product_id,variant_id,quantity,refund_amount FROM order_return_items WHERE return_id=? ORDER BY id').all(r.id) as ReturnItem[];
  if(items.some(i=>{const original=itemMap.get(i.order_item_id);return !original||original.product_id!==i.product_id||original.variant_id!==i.variant_id;}))fail("İade kalemleri siparişle uyuşmuyor.");
  if(r.status==='REFUNDED' && (new Set(items.map(i=>i.order_item_id)).size!==items.length || items.reduce((n,i)=>n+cleanMoney(i.refund_amount),0)!==cleanMoney(r.refund_amount)))fail("İade tutarı veya kalemleri tutarsız.");
  const movements=getMoves('RETURN',r.return_number,'RETURN');
  if(movements.some(m=>m.warehouse_id!==r.warehouse_id))fail("İade deposu ile stok hareketi uyuşmuyor.");
  return {id:r.id,status:r.status as 'REFUNDED'|'REJECTED',restock:r.restock===1,items:items.map(i=>({productId:i.product_id,variantId:i.variant_id,quantity:i.quantity})),movements:convert(movements)};
 });
 const plannedReturns=kind==='order'?allReturnPlans:allReturnPlans.filter(r=>r.id===id);
 const sale=kind==='order'?getMoves(order.order_type==='POS'?'POS_SALE':'ORDER',order.order_number,'SALE'):[];
 const movements=[...sale,...plannedReturns.flatMap(r=>r.movements.map(m=>({warehouse_id:m.warehouseId,product_id:m.productId,variant_id:m.variantId})))];
 const seen=new Set<string>(),balances:InventoryBalance[]=[],meta=new Map<string,{warehouseName:string;productName:string;variantName:string|null}>();
 for(const m of movements){
  const key=`${m.warehouse_id}:${m.product_id}:${m.variant_id??'-'}`;if(seen.has(key))continue;seen.add(key);
  const warehouse=sqlite.prepare('SELECT name FROM warehouses WHERE id=?').get(m.warehouse_id) as {name:string}|undefined;
  const product=sqlite.prepare('SELECT name FROM products WHERE id=?').get(m.product_id) as {name:string}|undefined;
  const variant=m.variant_id===null?null:sqlite.prepare("SELECT COALESCE(NULLIF(TRIM(COALESCE(color_name,'') || ' ' || COALESCE(size,'')),''),sku) AS name FROM product_variants WHERE id=? AND product_id=?").get(m.variant_id,m.product_id) as {name:string}|undefined;
  if(!warehouse||!product||(m.variant_id!==null&&!variant))fail("Depo, ürün veya varyant kaydı eksik.");
  const stocks=sqlite.prepare('SELECT physical_qty,reserved_qty FROM inventory WHERE warehouse_id=? AND product_id=? AND variant_id IS ? LIMIT 2').all(m.warehouse_id,m.product_id,m.variant_id) as {physical_qty:number;reserved_qty:number}[];
  if(stocks.length!==1)fail("Stok kaydı eksik veya yinelenmiş; fiziksel mutabakat gerekli.");
  const reservation=sqlite.prepare("SELECT COALESCE(SUM(qty),0) qty, SUM(CASE WHEN typeof(qty)<>'integer' OR qty<=0 THEN 1 ELSE 0 END) invalid FROM inventory_reservations WHERE warehouse_id=? AND product_id=? AND variant_id IS ? AND status='ACTIVE'").get(m.warehouse_id,m.product_id,m.variant_id) as {qty:number;invalid:number|null};
  if(reservation.invalid||!Number.isSafeInteger(reservation.qty)||reservation.qty!==stocks[0].reserved_qty)fail("Stok rezervasyon toplamı tutarsız.");
  balances.push({warehouseId:m.warehouse_id,productId:m.product_id,variantId:m.variant_id,physical:stocks[0].physical_qty,reserved:stocks[0].reserved_qty});meta.set(key,{warehouseName:warehouse.name,productName:product.name,variantName:variant?.name??null});
 }
 let plan;try{plan=planStockReversal({saleItems:kind==='order'?orderItems.map(i=>({productId:i.product_id,variantId:i.variant_id,quantity:i.quantity})):[],saleMovements:convert(sale),returns:plannedReturns,balances});}catch(e){if(e instanceof StockPlanError)fail(e.message);throw e;}
 const stocks=plan.map(x=>({...x,...meta.get(`${x.warehouseId}:${x.productId}:${x.variantId??'-'}`)!}));
 const fingerprint=createHash('sha256').update(JSON.stringify({kind,id,order,orderItems,returns,allReturnPlans,plannedReturns,sale,stocks,keys,guardItems,deletedGuards,rights})).digest('hex');
 return {kind,id,number:target?.return_number??order.order_number,orderNumber:order.order_number,returnCount:kind==='order'?returns.length:0,stocks,rights,fingerprint};
}
export function previewOrderReturnDeletion(kind:Kind,id:number,actor:Actor){return sqlite.transaction(()=>inspect(kind,id,actor)).deferred();}
export function deleteOrderReturn(kind:Kind,id:number,actor:Actor,confirmation:{fingerprint:string;physicalConfirmed:boolean;cascadeConfirmed:boolean;rightsConfirmed:boolean;legacyConfirmed:boolean}){
 return sqlite.transaction(()=>{
  if(!actor.sessionHash || !/^[a-f0-9]{64}$/.test(actor.sessionHash) || !sqlite.prepare("SELECT 1 FROM admin_sessions WHERE jti=? AND user_id=? AND revoked_at IS NULL AND expires_at>unixepoch()").get(actor.sessionHash,actor.id)) fail("Oturum süresi doldu veya oturum kapatıldı.",403);
  const preview=inspect(kind,id,actor);
  if(!confirmation.physicalConfirmed||confirmation.fingerprint!==preview.fingerprint||(preview.returnCount>0&&!confirmation.cascadeConfirmed)||((preview.rights.loyalty?.delta||preview.rights.discounts.length)&&!confirmation.rightsConfirmed)||(preview.rights.legacyReviewRequired&&!confirmation.legacyConfirmed))fail("Onay eksik veya kayıtlar değişti; önizlemeyi yenileyin.");
  const orderId=kind==='order'?id:(sqlite.prepare('SELECT order_id FROM order_returns WHERE id=?').get(id) as {order_id:number}).order_id;
  const returnRows=sqlite.prepare(kind==='order'?'SELECT id,status FROM order_returns WHERE order_id=? ORDER BY id':'SELECT id,status FROM order_returns WHERE id=?').all(kind==='order'?orderId:id) as {id:number;status:string}[];
  for(const row of returnRows){
   if(row.status==='REFUNDED')retainRefundReplayGuard(row.id);
   sqlite.prepare('DELETE FROM order_returns WHERE id=?').run(row.id);
   sqlite.prepare('DELETE FROM order_return_items WHERE return_id=?').run(row.id);
  }
  for(const stock of preview.stocks)if(stock.delta!==0)adjustInventorySync({warehouseId:stock.warehouseId,productId:stock.productId,variantId:stock.variantId,quantityDelta:stock.delta,transactionType:'ADJUSTMENT',referenceType:kind==='order'?'ORDER_DELETION':'RETURN_DELETION',referenceId:String(id),note:`Kalıcı silme stok ters kaydı: ${preview.number}`,createdBy:actor.name});
  if(kind==='order'){
   if(preview.rights.loyalty && preview.rights.loyalty.delta!==0){const l=preview.rights.loyalty;
    if(sqlite.prepare('UPDATE customers SET loyalty_points=? WHERE id=? AND loyalty_points=?').run(l.after,l.customerId,l.current).changes!==1)fail("Müşteri puanı değişti; işlem durduruldu.");
    sqlite.prepare("INSERT INTO loyalty_transactions(customer_id,points,type,description,order_id) VALUES(?,?,'ORDER_DELETE_REVERSAL',?,?)").run(l.customerId,l.delta,`Silinen sipariş hakları terslendi (${actor.name})`,orderId);
   }
   for(const d of preview.rights.discounts){const table=d.kind==='COUPON'?'coupons':'promotions';if(sqlite.prepare(`UPDATE ${table} SET used_count=? WHERE id=? AND used_count=?`).run(d.after,d.id,d.current).changes!==1)fail("İndirim sayacı değişti; işlem durduruldu.");}
   sqlite.prepare("UPDATE order_discount_claims SET status='RELEASED' WHERE order_id=? AND status='ACTIVE'").run(orderId);
   sqlite.prepare('DELETE FROM order_notification_outbox WHERE order_id=?').run(orderId);
   sqlite.prepare('DELETE FROM order_status_history WHERE order_id=?').run(orderId);
   sqlite.prepare('DELETE FROM order_items WHERE order_id=?').run(orderId);
   sqlite.prepare('DELETE FROM orders WHERE id=?').run(orderId);
  }
  let promoted=0;if(preview.stocks.some(s=>s.delta>0))promoted=processOrderQueueSync().promoted;
  sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,?,?,?,?)").run(String(actor.id),actor.name,kind==='order'?'ORDER_DELETED':'RETURN_DELETED',kind==='order'?'Order':'OrderReturn',String(id),JSON.stringify({number:preview.number,orderNumber:preview.orderNumber,returnCount:preview.returnCount,stocks:preview.stocks,physicalConfirmed:true,rightsConfirmed:confirmation.rightsConfirmed,legacyConfirmed:confirmation.legacyConfirmed,rights:preview.rights,promoted}));
  return {id,number:preview.number,promoted};
 }).immediate();
}
