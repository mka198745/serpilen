import { createHash, randomUUID } from "node:crypto";
import { sqlite } from "@/db";
import { normalizeRoleMatrix, type MatrixRole } from "@/lib/admin-modules";
import { sharedSalesWarehouseId } from "@/lib/shared-sales-warehouse";
import { adjustInventorySync } from "@/lib/inventory-engine";
import { processOrderQueueSync } from "@/lib/order-queue";

export class VariantEditError extends Error { constructor(message:string,readonly status=409){super(message);} }
type Actor={id:number;role:string;name:string;sessionHash?:string};
type Variant={id:number;product_id:number;sku:string;barcode:string|null;color_name:string|null;color_hex:string|null;size:string|null;length:string|null;image_url:string|null;buy_price:number|string|null;retail_price:number|string;is_active:number};
type Warehouse={id:number;name:string};
export type VariantEditInput={id:number;colorName:string;colorHex:string;size:string;length:string;buyPrice:string;retailPrice:string;sku:string;barcode:string;imageUrl:string;physicalQty:number};
export type VariantEditRow={id:number;colorName:string;colorHex:string;sku:string;barcode:string;imageUrl:string;size:string;length:string;buyPrice:string;retailPrice:string;isActive:boolean;physicalQty:number;reservedQty:number;availableQty:number};
export type VariantEditPreview={productId:number;productName:string;warehouseId:number|null;warehouses:Warehouse[];variants:VariantEditRow[];fingerprint:string};
function fail(message:string,status=409):never {throw new VariantEditError(message,status);}
const validId=(id:number)=>Number.isSafeInteger(id)&&id>0;
function authorize(actor:Actor){
 const user=sqlite.prepare('SELECT role,is_active FROM users WHERE id=?').get(actor.id) as {role:string;is_active:number}|undefined;
 if(!user||!user.is_active||user.role!==actor.role)fail('Katalog yetkiniz bulunmuyor.',403);
 const settings=sqlite.prepare("SELECT value FROM app_settings WHERE key='admin.role_matrix'").get() as {value:string}|undefined;let matrix:unknown=null;
 try {if(settings?.value)matrix=JSON.parse(settings.value);} catch { /* non-super roles fail closed */ }
 if(!normalizeRoleMatrix(matrix)[user.role as MatrixRole]?.catalog)fail('Varyant düzenlemek için katalog yetkisi gerekir.',403);
}
/** Reads a coherent snapshot; caller must recheck it under the write lock. */
function inspect(productId:number,warehouseId:number|null,actor:Actor):VariantEditPreview {
 authorize(actor);
 if(!validId(productId))fail('Geçersiz ürün numarası.',422);
 const product=sqlite.prepare('SELECT id,name,has_variants FROM products WHERE id=?').get(productId) as {id:number;name:string;has_variants:number}|undefined;
 if(!product)fail('Ürün bulunamadı.',404);
 const warehouseRows=sqlite.prepare('SELECT id,name FROM warehouses WHERE is_active=1 ORDER BY id').all() as Warehouse[];
 if(warehouseId!==null&&(!validId(warehouseId)||!warehouseRows.some(w=>w.id===warehouseId)))fail('Seçilen depo bulunamadı veya aktif değil.',409);
 const variants=sqlite.prepare('SELECT id,product_id,sku,barcode,color_name,color_hex,size,length,image_url,buy_price,retail_price,is_active FROM product_variants WHERE product_id=? ORDER BY id').all(productId) as Variant[];
 if(!variants.length||product.has_variants!==1)fail('Ürünün varyant kayıtları bulunamadı veya tutarsız.');
 if(variants.length>50)fail('Bu ürünün varyant sayısı güvenli düzenleme sınırını aşıyor.');
 const stock=sqlite.prepare('SELECT physical_qty,reserved_qty FROM inventory WHERE warehouse_id=? AND product_id=? AND variant_id=? ORDER BY id');
 const reservations=sqlite.prepare("SELECT COALESCE(SUM(qty),0) qty,SUM(CASE WHEN typeof(qty)<>'integer' OR qty<=0 THEN 1 ELSE 0 END) invalid FROM inventory_reservations WHERE warehouse_id=? AND product_id=? AND variant_id=? AND status='ACTIVE'");
 const rows=variants.map(v=>{
  const stocks=warehouseId===null?[]:stock.all(warehouseId,productId,v.id) as {physical_qty:number;reserved_qty:number}[];
  if(stocks.length>1)fail('Yinelenen stok kaydı var; önce depo mutabakatı yapın.');
  const physical=stocks[0]?.physical_qty??0,reserved=stocks[0]?.reserved_qty??0;
  if(warehouseId!==null){const active=reservations.get(warehouseId,productId,v.id) as {qty:number;invalid:number|null};if(active.invalid||!Number.isSafeInteger(active.qty)||active.qty!==reserved)fail('Varyantın stok ve rezervasyon kayıtları uyuşmuyor.');}
  if(!Number.isSafeInteger(physical)||!Number.isSafeInteger(reserved)||reserved<0||physical<reserved)fail('Varyant stokları tutarsız; önce depo mutabakatı yapın.');
  return {id:v.id,colorName:v.color_name??'',colorHex:v.color_hex??'',sku:v.sku,barcode:v.barcode??'',imageUrl:v.image_url??'',size:v.size??'',length:v.length??'',buyPrice:v.buy_price===null?'':String(v.buy_price),retailPrice:String(v.retail_price),isActive:!!v.is_active,physicalQty:physical,reservedQty:reserved,availableQty:physical-reserved};
 });
 const fingerprint=createHash('sha256').update(JSON.stringify({product,warehouseId,warehouses:warehouseRows,variants,rows})).digest('hex');
 return {productId,productName:product.name,warehouseId,warehouses:warehouseRows,variants:rows,fingerprint};
}
export function previewVariantEdit(productId:number,requestedWarehouse:number|null|undefined,actor:Actor){
 return sqlite.transaction(()=>inspect(productId,requestedWarehouse===undefined?sharedSalesWarehouseId():requestedWarehouse,actor)).deferred();
}
function validateRows(input:unknown):VariantEditInput[]{
 if(!Array.isArray(input)||!input.length||input.length>50)fail('Geçerli varyant bilgileri gereklidir.',422);
 const seen=new Set<number>();return input.map((raw:unknown)=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('Varyant bilgileri geçersiz.',422);
  const item=raw as Record<string,unknown>;
  if(Object.keys(item).some(k=>!['id','colorName','colorHex','size','length','buyPrice','retailPrice','sku','barcode','imageUrl','physicalQty'].includes(k)))fail('Varyant alanı geçersiz.',422);
  const id=item.id;if(typeof id!=='number'||!validId(id)||seen.has(id))fail('Varyant kimliği geçersiz veya yinelenmiş.',422);seen.add(id);
  const text=(key:string,max:number)=>{const value=item[key];if(typeof value!=='string'||value.trim().length>max)fail('Varyant metin alanı geçersiz.',422);return (value as string).trim();};
  const colorName=text('colorName',100),colorHex=text('colorHex',7),sku=text('sku',40),barcode=text('barcode',80),imageUrl=text('imageUrl',2048),size=text('size',100),length=text('length',100),buyPrice=text('buyPrice',20),retailPrice=text('retailPrice',20);
  const money=(v:string)=>/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(v)&&Number(v)<=100000000;if((buyPrice&&!money(buyPrice))||!money(retailPrice))fail('Varyant fiyatı geçersiz; en fazla iki ondalık basamak kullanın.',422);
  if(!sku)fail('Varyant SKU gereklidir.',422);if(colorHex&&!/^#[a-f0-9]{6}$/i.test(colorHex))fail('Varyant renk kodu geçersiz.',422);
  const qty=item.physicalQty;if(typeof qty!=='number'||!Number.isSafeInteger(qty)||qty<0||qty>100000000)fail('Stok sıfır veya pozitif tam sayı olmalıdır.',422);
  return {id,colorName,colorHex,size,length,buyPrice,retailPrice,sku,barcode,imageUrl,physicalQty:qty};
 });
}
export function saveVariantEdits(productId:number,warehouseId:number,actor:Actor,input:unknown,fingerprint:string,physicalConfirmed:boolean,selectedVariantId?:number){
 const edits=validateRows(input);
 return sqlite.transaction(()=>{
  if(!actor.sessionHash||!/^[a-f0-9]{64}$/.test(actor.sessionHash)||!sqlite.prepare('SELECT 1 FROM admin_sessions WHERE jti=? AND user_id=? AND revoked_at IS NULL AND expires_at>unixepoch()').get(actor.sessionHash,actor.id))fail('Oturum süresi doldu veya oturum kapatıldı.',403);
  const current=inspect(productId,warehouseId,actor);
  if(!fingerprint||fingerprint!==current.fingerprint)fail('Varyant, depo veya stok değişti; verileri yenileyip yeniden kontrol edin.');
  if(current.warehouseId===null)fail('Geçerli depo seçilmedi.');
  if(selectedVariantId!==undefined){if(!validId(selectedVariantId)||edits.length!==1||edits[0].id!==selectedVariantId||!current.variants.some(v=>v.id===selectedVariantId))fail('Seçilen varyant bulunamadı veya uyuşmuyor.');}
  else if(edits.length!==current.variants.length||edits.some((e,i)=>e.id!==current.variants[i].id))fail('Varyant listesi değişti; yeniden yükleyin.');
  const originalById=new Map(current.variants.map(v=>[v.id,v]));
  const combinationKey=(v:{colorName:string;size:string;length:string})=>[v.colorName,v.size,v.length].map(x=>x.trim().toLocaleLowerCase('tr-TR')).join('\0');
  const combos=new Set<string>(selectedVariantId===undefined?[]:current.variants.filter(v=>v.id!==selectedVariantId).map(combinationKey)),skus=new Set<string>(),barcodes=new Set<string>();
  for(const e of edits){
   const original=originalById.get(e.id)!;if(!e.colorName&&!e.size&&!e.length)fail('Varyant için renk bilgisi gereklidir.',422);
   const combination=combinationKey(e);if(combos.has(combination))fail('Aynı renk ve özelliklerde birden fazla varyant var.',422);combos.add(combination);
   if(skus.has(e.sku))fail('Varyant SKU değerleri yinelenemez.',422);skus.add(e.sku);
   if(e.barcode){if(barcodes.has(e.barcode))fail('Varyant barkodları yinelenemez.',422);barcodes.add(e.barcode);}
   if(sqlite.prepare('SELECT 1 FROM products WHERE sku=? UNION ALL SELECT 1 FROM product_variants WHERE sku=? AND id<>? LIMIT 1').get(e.sku,e.sku,e.id))fail('Varyant SKU başka bir üründe kullanılıyor.',409);
   if(e.barcode&&sqlite.prepare('SELECT 1 FROM products WHERE barcode=? UNION ALL SELECT 1 FROM product_variants WHERE barcode=? AND id<>? LIMIT 1').get(e.barcode,e.barcode,e.id))fail('Varyant barkodu başka bir üründe kullanılıyor.',409);
   if(e.physicalQty<original.reservedQty)fail('Fiili stok ayrılmış stoktan daha az olamaz.');
  }
  const changedStock=edits.filter(e=>e.physicalQty!==originalById.get(e.id)!.physicalQty);
  if(changedStock.length&&!physicalConfirmed)fail('Fiziksel stok doğrulaması gereklidir.',422);
  const update=sqlite.prepare('UPDATE product_variants SET color_name=?,color_hex=?,size=?,length=?,buy_price=?,retail_price=?,sku=?,barcode=?,image_url=? WHERE id=? AND product_id=?');const ref=randomUUID();
  for(const e of edits){
   const old=originalById.get(e.id)!;
   update.run(e.colorName||null,e.colorHex||null,e.size||null,e.length||null,e.buyPrice||null,e.retailPrice,e.sku,e.barcode||null,e.imageUrl||null,e.id,productId);
   const delta=e.physicalQty-old.physicalQty;
   if(delta)adjustInventorySync({warehouseId,productId,variantId:e.id,quantityDelta:delta,transactionType:'COUNT_DIFF',referenceType:'VARIANT_EDIT',referenceId:ref,note:'Ürün düzenlemede fiziksel stok düzeltmesi',createdBy:actor.name});
  }
  const promoted=warehouseId===sharedSalesWarehouseId()&&changedStock.some(e=>e.physicalQty>originalById.get(e.id)!.physicalQty)?processOrderQueueSync().promoted:0;
  sqlite.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,details) VALUES(?,?,'PRODUCT_VARIANTS_EDITED','Product',?,?)").run(String(actor.id),actor.name,String(productId),JSON.stringify({warehouseId,physicalConfirmed,variants:edits.map(e=>({id:e.id,before:originalById.get(e.id),after:{...e},delta:e.physicalQty-originalById.get(e.id)!.physicalQty})),promoted}));
  return {productId,promoted};
 }).immediate();
}
