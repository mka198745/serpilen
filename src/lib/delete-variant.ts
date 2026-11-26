import { createHash } from "node:crypto";
import { sqlite } from "@/db";
import { normalizeRoleMatrix, type MatrixRole } from "@/lib/admin-modules";
import { sharedSalesWarehouseId } from "@/lib/shared-sales-warehouse";
import { processOrderQueueSync } from "@/lib/order-queue";

type Actor={id:number;name:string;role:string;sessionHash?:string};
type Stock={id:number;warehouseId:number;warehouseName:string|null;physicalQty:number;reservedQty:number};
export type VariantDeletionPreview={id:number;productId:number;productName:string;variantName:string;sku:string;stocks:Stock[];totalStock:number;lastVariant:boolean;baseStocks:Stock[];baseRetailPrice:string;baseCampaignPrice:string|null;fingerprint:string};
export class VariantDeleteError extends Error {constructor(message:string,readonly status=409){super(message);}}
function fail(message:string,status=409):never {throw new VariantDeleteError(message,status);}
const quote=(s:string)=>`"${s.replace(/"/g,'""')}"`;
function authorize(actor:Actor){
 const user=sqlite.prepare('SELECT role,is_active FROM users WHERE id=?').get(actor.id) as {role:string;is_active:number}|undefined;
 if(!user||!user.is_active||user.role!==actor.role)fail('Varyant silme yetkiniz bulunmuyor.',403);
 const setting=sqlite.prepare("SELECT value FROM app_settings WHERE key='admin.role_matrix'").get() as {value:string}|undefined;let matrix:unknown=null;try{if(setting?.value)matrix=JSON.parse(setting.value);}catch{}
 const row=normalizeRoleMatrix(matrix)[user.role as MatrixRole];if(!row?.catalog||!row.productDelete)fail('Varyant silmek için katalog ve ürün silme yetkisi gerekir.',403);
}
function inspect(id:number,actor:Actor):VariantDeletionPreview {
 authorize(actor);if(!Number.isSafeInteger(id)||id<1)fail('Geçersiz varyant numarası.',422);
 const variant=sqlite.prepare('SELECT * FROM product_variants WHERE id=?').get(id) as {id:number;product_id:number;sku:string;color_name:string|null;size:string|null;length:string|null}|undefined;
 if(!variant)fail('Varyant bulunamadı.',404);
 const product=sqlite.prepare('SELECT * FROM products WHERE id=?').get(variant.product_id) as {id:number;name:string;has_variants:number;retail_price:number|string;campaign_price:number|string|null}|undefined;
 if(!product||product.has_variants!==1)fail('Ürün ve varyant kayıtları tutarsız.');
 // Protect all existing and future variant references, including restrictive foreign keys.
 const tables=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name:string}[];
 for(const {name} of tables){
  if(['product_variants','product_images','inventory'].includes(name))continue;
  const cols=(sqlite.prepare(`PRAGMA table_info(${quote(name)})`).all() as {name:string}[]).map(c=>c.name);
  const fks=sqlite.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all() as {table:string;from:string;to:string|null}[];
  const references=new Set([...cols.filter(c=>c==='variant_id'),...fks.filter(f=>f.table==='product_variants'&&(!f.to||f.to==='id')).map(f=>f.from)]);
  if([...references].some(col=>sqlite.prepare(`SELECT 1 FROM ${quote(name)} WHERE ${quote(col)}=? LIMIT 1`).get(id)))fail('Varyantın sipariş, rezervasyon, stok hareketi veya başka işlem geçmişi var; silinemez.');
 }
 // Prepared POS intent may be waiting for payment even when its reference rows are damaged.
 if(sqlite.prepare("SELECT 1 FROM pos_sale_intents WHERE status='PREPARED' LIMIT 1").get())fail('Açık POS satış hazırlığı var; önce işlem sonuçlandırılmalı.');
 if(sqlite.prepare('SELECT 1 FROM inventory WHERE variant_id=? AND product_id<>? LIMIT 1').get(id,product.id)||sqlite.prepare('SELECT 1 FROM product_images WHERE variant_id=? AND product_id<>? LIMIT 1').get(id,product.id))fail('Varyantın ürün bağlantıları tutarsız.');
 const count=(sqlite.prepare('SELECT count(*) n FROM product_variants WHERE product_id=?').get(product.id) as {n:number}).n;
 const lastVariant=count===1;
 const readStock=(v:number|null)=>sqlite.prepare(`SELECT i.id,i.warehouse_id warehouseId,w.name warehouseName,i.physical_qty physicalQty,i.reserved_qty reservedQty FROM inventory i LEFT JOIN warehouses w ON w.id=i.warehouse_id WHERE i.product_id=? AND i.variant_id IS ? ORDER BY i.warehouse_id,i.id`).all(product.id,v) as Stock[];
 const stocks=readStock(id),baseStocks=lastVariant?readStock(null):[];
 const verify=(rows:Stock[],isVariant:boolean)=>{const warehouses=new Set<number>();for(const s of rows){if(!s.warehouseName||warehouses.has(s.warehouseId)||!Number.isSafeInteger(s.physicalQty)||!Number.isSafeInteger(s.reservedQty)||s.reservedQty<0||s.physicalQty<s.reservedQty||(isVariant&&s.reservedQty!==0))fail('Stok veya rezervasyon kayıtları tutarsız; işlem yapılamadı.');warehouses.add(s.warehouseId);}};
 verify(stocks,true);verify(baseStocks,false);
 if(lastVariant){
  const reservations=sqlite.prepare("SELECT warehouse_id,COALESCE(SUM(qty),0) qty, SUM(CASE WHEN typeof(qty)<>'integer' OR qty<=0 THEN 1 ELSE 0 END) invalid FROM inventory_reservations WHERE product_id=? AND variant_id IS NULL AND status='ACTIVE' GROUP BY warehouse_id").all(product.id) as {warehouse_id:number;qty:number;invalid:number}[];
  if(reservations.some(r=>r.invalid||!baseStocks.some(s=>s.warehouseId===r.warehouse_id&&s.reservedQty===r.qty))||baseStocks.some(s=>s.reservedQty!==(reservations.find(r=>r.warehouse_id===s.warehouseId)?.qty??0)))fail('Ana ürün stok ve rezervasyon kayıtları uyuşmuyor.');
 }
 const totalStock=stocks.reduce((sum,s)=>sum+s.physicalQty,0);if(!Number.isSafeInteger(totalStock))fail('Stok toplamı geçersiz.');
 const images=sqlite.prepare('SELECT id,url FROM product_images WHERE product_id=? AND variant_id=? ORDER BY id').all(product.id,id);
 const variantName=[variant.color_name,variant.size,variant.length].filter(Boolean).join(' · ')||variant.sku;
 const fingerprint=createHash('sha256').update(JSON.stringify({variant,product,count,stocks,baseStocks,images})).digest('hex');
 return {id,productId:product.id,productName:product.name,variantName,sku:variant.sku,stocks,totalStock,lastVariant,baseStocks,baseRetailPrice:String(product.retail_price),baseCampaignPrice:product.campaign_price===null?null:String(product.campaign_price),fingerprint};
}
export function previewVariantDeletion(id:number,actor:Actor){return sqlite.transaction(()=>inspect(id,actor)).deferred();}
export function deleteVariant(id:number,actor:Actor,fingerprint:string,confirmed:boolean){return sqlite.transaction(()=>{
 if(!actor.sessionHash||!/^[a-f0-9]{64}$/.test(actor.sessionHash)||!sqlite.prepare('SELECT 1 FROM admin_sessions WHERE jti=? AND user_id=? AND revoked_at IS NULL AND expires_at>unixepoch()').get(actor.sessionHash,actor.id))fail('Oturum süresi doldu veya oturum kapatıldı.',403);
 const p=inspect(id,actor);if(!confirmed||!fingerprint||fingerprint!==p.fingerprint)fail('Onay eksik veya varyant/stok değişti; yeniden kontrol edin.');
 sqlite.prepare('DELETE FROM inventory WHERE product_id=? AND variant_id=?').run(p.productId,id);
 sqlite.prepare('DELETE FROM product_images WHERE product_id=? AND variant_id=?').run(p.productId,id);
 sqlite.prepare('DELETE FROM product_variants WHERE id=? AND product_id=?').run(id,p.productId);
 if(p.lastVariant)sqlite.prepare('UPDATE products SET has_variants=0 WHERE id=?').run(p.productId);
 const promoted=p.lastVariant&&p.baseStocks.some(s=>s.warehouseId===sharedSalesWarehouseId()&&s.physicalQty>s.reservedQty)?processOrderQueueSync().promoted:0;
 sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,'PRODUCT_VARIANT_DELETED','ProductVariant',?,?)").run(String(actor.id),actor.name,String(id),JSON.stringify({...p,promoted}));
 return {productId:p.productId,lastVariant:p.lastVariant,promoted};
 }).immediate();}
