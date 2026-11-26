import { createHash, randomUUID } from "node:crypto";
import { sqlite } from "@/db";
import { adjustInventorySync } from "@/lib/inventory-engine";
import { normalizeRoleMatrix } from "@/lib/admin-modules";
import { roleCanAccessModule } from "@/lib/role-matrix-server";
import type { SessionUser } from "@/lib/auth";

export class SupplierOperationError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}
export function requirePurchasingInTransaction(actor: SessionUser) {
  if (!sqlite.inTransaction) throw new Error("Purchasing authorization requires transaction");
  const user = sqlite.prepare("SELECT role,is_active FROM users WHERE id=?").get(actor.id) as {role:string;is_active:number}|undefined;
  const setting = sqlite.prepare("SELECT value FROM app_settings WHERE key='admin.role_matrix'").get() as {value:string}|undefined;
  let matrix: unknown = null; try { if (setting?.value) matrix = JSON.parse(setting.value); } catch { /* default */ }
  if (!user?.is_active || user.role !== actor.role || !roleCanAccessModule(normalizeRoleMatrix(matrix),user.role,"purchasing")) throw new SupplierOperationError("Satın alma yetkiniz yok.",403);
}
function positive(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new SupplierOperationError("Geçerli pozitif tam sayı gerekli.",422);
  return n;
}
function keyOf(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9-]{16,100}$/.test(value)) throw new SupplierOperationError("Geçerli işlem anahtarı gerekli.",422);
  return value;
}
function normalizeLines(value: unknown, idField: string): {id:number;qty:number}[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new SupplierOperationError("En az bir, en fazla 100 kalem gerekli.",422);
  const result = value.map(v => {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new SupplierOperationError("Geçersiz kalem.",422);
    const row = v as Record<string,unknown>;
    return {id:positive(row[idField]),qty:positive(row.qty)};
  }).sort((a,b)=>a.id-b.id);
  if (new Set(result.map(x=>x.id)).size !== result.length) throw new SupplierOperationError("Aynı kalem birden fazla girilemez.",422);
  return result;
}
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function migrationRequired() {
  if (!sqlite.prepare("SELECT 1 FROM __migrations WHERE tag='0029_supplier_returns'").get()) throw new SupplierOperationError("Tedarikçi işlem güncellemesi uygulanmamış.",503);
}

/** All receipt lines, stock, ledger, PO state and retry key are committed together. */
export function receiveGoods(actor: SessionUser, input: Record<string,unknown>) {
  const poId=positive(input.purchaseOrderId), key=keyOf(input.requestKey), lines=normalizeLines(input.lines,"purchaseOrderItemId");
  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0,500) : '';
  const hash = digest({poId,lines,notes});
  return sqlite.transaction(() => {
    requirePurchasingInTransaction(actor); migrationRequired();
    const previous=sqlite.prepare('SELECT payload_hash,receipt_id,received_qty,po_status FROM supplier_receipt_requests WHERE request_key=?').get(key) as {payload_hash:string;receipt_id:number;received_qty:number;po_status:string}|undefined;
    if(previous) {
      if(previous.payload_hash!==hash) throw new SupplierOperationError("Bu işlem anahtarı farklı bir mal kabul için kullanılmış.");
      return {receipt:sqlite.prepare('SELECT id,receipt_number AS receiptNumber FROM goods_receipts WHERE id=?').get(previous.receipt_id),receivedQty:previous.received_qty,poStatus:previous.po_status,replayed:true};
    }
    if (sqlite.prepare('SELECT 1 FROM supplier_command_fences WHERE request_key=?').get(key)) throw new SupplierOperationError('Bu mal kabul anahtarı güvenli biçimde kapatıldı.');
    if (sqlite.prepare('SELECT 1 FROM supplier_returns WHERE request_key=?').get(key)) throw new SupplierOperationError('Bu işlem anahtarı başka bir işlem için kullanılmış.');
    const po=sqlite.prepare('SELECT * FROM purchase_orders WHERE id=?').get(poId) as {id:number;po_number:string;warehouse_id:number;status:string}|undefined;
    if(!po) throw new SupplierOperationError('Sipariş bulunamadı.',404);
    if(!['ORDERED','APPROVED','PARTIAL'].includes(po.status)) throw new SupplierOperationError('Bu siparişe mal kabul yapılamaz.');
    if(!sqlite.prepare('SELECT 1 FROM warehouses WHERE id=? AND is_active=1').get(po.warehouse_id)) throw new SupplierOperationError('Sipariş deposu bulunamadı veya aktif değil.');
    const items=sqlite.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id=?').all(poId) as Array<{id:number;product_id:number;variant_id:number|null;quantity:number;received_qty:number;unit_cost:string}>;
    if(!items.length || items.some(i=>!Number.isSafeInteger(i.quantity)||i.quantity<=0||!Number.isSafeInteger(i.received_qty)||i.received_qty<0||i.received_qty>i.quantity)) throw new SupplierOperationError('Sipariş miktarları tutarsız.');
    for(const line of lines) {
      const item=items.find(i=>i.id===line.id);
      if(!item) throw new SupplierOperationError('Kalem bu siparişe ait değil.');
      if(line.qty>item.quantity-item.received_qty) throw new SupplierOperationError('Kabul miktarı kalan sipariş miktarını aşıyor.');
      if(!sqlite.prepare('SELECT 1 FROM products WHERE id=?').get(item.product_id)) throw new SupplierOperationError('Siparişteki ürün bulunamadı.');
      if(item.variant_id && !sqlite.prepare('SELECT 1 FROM product_variants WHERE id=? AND product_id=?').get(item.variant_id,item.product_id)) throw new SupplierOperationError('Ürün varyantı tutarsız.');
    }
    const number=`MK-${randomUUID()}`;
    const receiptId=Number(sqlite.prepare('INSERT INTO goods_receipts(receipt_number,purchase_order_id,warehouse_id,received_by,notes) VALUES(?,?,?,?,?)').run(number,poId,po.warehouse_id,actor.name,notes||null).lastInsertRowid);
    let receivedQty=0;
    for(const line of lines) {
      const item=items.find(i=>i.id===line.id)!;
      adjustInventorySync({warehouseId:po.warehouse_id,productId:item.product_id,variantId:item.variant_id,quantityDelta:line.qty,transactionType:'PURCHASE',referenceType:'PO',referenceId:po.po_number,note:`Mal Kabul ${number}`,createdBy:actor.name,unitCost:String(item.unit_cost)});
      sqlite.prepare('UPDATE purchase_order_items SET received_qty=received_qty+? WHERE id=?').run(line.qty,item.id);
      sqlite.prepare('INSERT INTO goods_receipt_items(receipt_id,purchase_order_item_id,product_id,variant_id,qty) VALUES(?,?,?,?,?)').run(receiptId,item.id,item.product_id,item.variant_id,line.qty);
      receivedQty+=line.qty;
    }
    const pending=sqlite.prepare('SELECT 1 FROM purchase_order_items WHERE purchase_order_id=? AND received_qty<quantity LIMIT 1').get(poId);
    const poStatus=pending?'PARTIAL':'RECEIVED';
    sqlite.prepare('UPDATE purchase_orders SET status=? WHERE id=?').run(poStatus,poId);
    sqlite.prepare('INSERT INTO supplier_receipt_requests(request_key,payload_hash,receipt_id,received_qty,po_status) VALUES(?,?,?,?,?)').run(key,hash,receiptId,receivedQty,poStatus);
    sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,'SUPPLIER_GOODS_RECEIVED','PurchaseOrder',?,?)").run(String(actor.id),actor.name,String(poId),JSON.stringify({receiptId,receivedQty}));
    return {receipt:{id:receiptId,receiptNumber:number},receivedQty,poStatus,replayed:false};
  }).immediate();
}

/** Returns are committed immediately; a repeated key returns the existing result without stock movement. */
export function returnToSupplier(actor: SessionUser, input: Record<string,unknown>) {
  const receiptId=positive(input.receiptId), key=keyOf(input.requestKey), lines=normalizeLines(input.lines,'receiptItemId');
  const reason=typeof input.reason==='string' ? input.reason.trim() : '';
  if(!reason || reason.length>500) throw new SupplierOperationError('İade nedeni zorunludur (en fazla 500 karakter).',422);
  const hash=digest({receiptId,lines,reason});
  return sqlite.transaction(()=>{
    requirePurchasingInTransaction(actor);migrationRequired();
    const previous=sqlite.prepare('SELECT id,payload_hash FROM supplier_returns WHERE request_key=?').get(key) as {id:number;payload_hash:string}|undefined;
    if(previous) {
      if(previous.payload_hash!==hash) throw new SupplierOperationError('Bu işlem anahtarı farklı bir iade için kullanılmış.');
      return {id:previous.id,replayed:true};
    }
    if (sqlite.prepare('SELECT 1 FROM supplier_command_fences WHERE request_key=?').get(key)) throw new SupplierOperationError('Bu iade anahtarı güvenli biçimde kapatıldı.');
    if (sqlite.prepare('SELECT 1 FROM supplier_receipt_requests WHERE request_key=?').get(key)) throw new SupplierOperationError('Bu işlem anahtarı başka bir işlem için kullanılmış.');
    const receipt=sqlite.prepare('SELECT r.id,r.warehouse_id,r.purchase_order_id,p.supplier_id,p.warehouse_id AS po_warehouse FROM goods_receipts r JOIN purchase_orders p ON p.id=r.purchase_order_id JOIN suppliers s ON s.id=p.supplier_id WHERE r.id=?').get(receiptId) as {id:number;warehouse_id:number;purchase_order_id:number;supplier_id:number;po_warehouse:number}|undefined;
    if(!receipt) throw new SupplierOperationError('Mal kabul veya tedarikçi bulunamadı.',404);
    if(receipt.warehouse_id!==receipt.po_warehouse || !sqlite.prepare('SELECT 1 FROM warehouses WHERE id=?').get(receipt.warehouse_id)) throw new SupplierOperationError('Mal kabul depo bilgisi tutarsız.');
    const prepared=lines.map(line=>{
      const item=sqlite.prepare(`SELECT ri.id,ri.product_id,ri.variant_id,ri.qty,poi.unit_cost,poi.purchase_order_id,poi.product_id AS po_product,poi.variant_id AS po_variant,poi.quantity AS ordered,poi.received_qty AS received,
        (SELECT coalesce(sum(x.qty),0) FROM goods_receipt_items x WHERE x.purchase_order_item_id=poi.id) AS total_received,
        (SELECT coalesce(sum(x.qty),0) FROM supplier_return_items x WHERE x.receipt_item_id=ri.id) AS returned
        FROM goods_receipt_items ri JOIN purchase_order_items poi ON poi.id=ri.purchase_order_item_id WHERE ri.id=? AND ri.receipt_id=?`).get(line.id,receiptId) as {id:number;product_id:number;variant_id:number|null;qty:number;unit_cost:string;purchase_order_id:number;po_product:number;po_variant:number|null;returned:number;ordered:number;received:number;total_received:number}|undefined;
      if(!item || item.purchase_order_id!==receipt.purchase_order_id || item.product_id!==item.po_product || item.variant_id!==item.po_variant) throw new SupplierOperationError('Mal kabul kalemi veya sipariş ilişkisi tutarsız.');
      if(!Number.isSafeInteger(item.ordered)||item.ordered<=0||!Number.isSafeInteger(item.received)||item.received<0||item.received>item.ordered||item.total_received!==item.received) throw new SupplierOperationError('Satın alma ve mal kabul miktarları tutarsız.');
      if(!Number.isSafeInteger(item.qty)||item.qty<=0||!Number.isSafeInteger(item.returned)||item.returned<0||line.qty>item.qty-item.returned) throw new SupplierOperationError('İade miktarı kabul edilen ve henüz iade edilmemiş miktarı aşıyor.');
      return {item,qty:line.qty};
    });
    const id=Number(sqlite.prepare('INSERT INTO supplier_returns(request_key,payload_hash,receipt_id,supplier_id,warehouse_id,reason,created_by) VALUES(?,?,?,?,?,?,?)').run(key,hash,receiptId,receipt.supplier_id,receipt.warehouse_id,reason,actor.id).lastInsertRowid);
    for(const {item,qty} of prepared){
      adjustInventorySync({warehouseId:receipt.warehouse_id,productId:item.product_id,variantId:item.variant_id,quantityDelta:-qty,transactionType:'RETURN',referenceType:'SUPPLIER_RETURN',referenceId:String(id),note:`Tedarikçiye iade: ${reason}`,createdBy:actor.name,unitCost:String(item.unit_cost)});
      sqlite.prepare('INSERT INTO supplier_return_items(supplier_return_id,receipt_item_id,product_id,variant_id,qty) VALUES(?,?,?,?,?)').run(id,item.id,item.product_id,item.variant_id,qty);
    }
    sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,'SUPPLIER_RETURN','SupplierReturn',?,?)").run(String(actor.id),actor.name,String(id),JSON.stringify({receiptId,reason,lines}));
    return {id,replayed:false};
  }).immediate();
}

/** Resolve a possibly delayed command: either it committed, or fence it forever. */
export function fencePurchasingCommand(actor: SessionUser, input: Record<string,unknown>) {
  const key=keyOf(input.requestKey);
  return sqlite.transaction(()=>{
    requirePurchasingInTransaction(actor);migrationRequired();
    const received=sqlite.prepare('SELECT receipt_id AS id FROM supplier_receipt_requests WHERE request_key=?').get(key) as {id:number}|undefined;
    const returned=sqlite.prepare('SELECT id FROM supplier_returns WHERE request_key=?').get(key) as {id:number}|undefined;
    if (received || returned) return {status:'completed',kind:received?'receipt':'return',id:(received ?? returned)!.id};
    const result=sqlite.prepare('INSERT OR IGNORE INTO supplier_command_fences(request_key,created_by) VALUES(?,?)').run(key,actor.id);
    if(result.changes) sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,'SUPPLIER_COMMAND_FENCED','SupplierCommand',?,?)").run(String(actor.id),actor.name,key,'Gecikmiş işlem güvenli biçimde kapatıldı.');
    return {status:'fenced'};
  }).immediate();
}
