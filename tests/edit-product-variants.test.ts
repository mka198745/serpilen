import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'variant-edit-'));process.env.DATABASE_URL=`sqlite:${path.join(dir,'db')}`;
const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env:process.env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);
const {sqlite}=require('../src/db');const {previewVariantEdit,saveVariantEdits}=require('../src/lib/edit-product-variants');
const admin={id:1,name:'Admin',role:'SUPER_ADMIN',sessionHash:'a'.repeat(64)},other={id:2,name:'Other',role:'CASHIER',sessionHash:'b'.repeat(64)};
sqlite.exec("INSERT INTO categories(id,name,slug) VALUES(1,'K','k'); INSERT INTO warehouses(id,name,code) VALUES(1,'Satış','A'),(2,'Diğer','B'); INSERT INTO app_settings(key,value) VALUES('sales.shared_warehouse_id','1'); INSERT INTO users(id,name,email,password_hash,role) VALUES(1,'Admin','admin@test.invalid','x','SUPER_ADMIN'),(2,'Other','other@test.invalid','x','CASHIER'); INSERT INTO products(id,name,slug,sku,category_id,has_variants,retail_price) VALUES(1,'Test','test','prod',1,1,10); INSERT INTO product_variants(id,product_id,sku,color_name,retail_price) VALUES(1,1,'v1','Mavi',10),(2,1,'v2','Kırmızı',10); INSERT INTO inventory(warehouse_id,product_id,variant_id,physical_qty,reserved_qty) VALUES(2,1,1,6,0)");
sqlite.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(1,admin.sessionHash,253402300799);
const rows=(p:any)=>p.variants.map(({id,colorName,colorHex,size,length,buyPrice,retailPrice,sku,barcode,imageUrl,physicalQty}:any)=>({id,colorName,colorHex,size,length,buyPrice,retailPrice,sku,barcode,imageUrl,physicalQty}));
const get=(sql:string,...args:any[])=>sqlite.prepare(sql).get(...args) as any;
const save=(p:any,r:any=rows(p),a=admin,confirmed=true)=>saveVariantEdits(1,p.warehouseId,a,r,p.fingerprint,confirmed);
test('Sıfır stoklu varyantı kaydet, seçili depo dışına dokunma, defter ve audit',()=>{
 const p=previewVariantEdit(1,undefined,admin);assert.equal(p.warehouseId,1);assert.equal(p.variants[0].physicalQty,0);
 const r=rows(p);r[0].physicalQty=5;r[0].colorName='Turkuaz';r[0].retailPrice='12.50';
 assert.throws(()=>save(p,r,admin,false),/doğrulaması/);save(p,r);
 assert.deepEqual(get('SELECT physical_qty,reserved_qty FROM inventory WHERE warehouse_id=1 AND variant_id=1'),{physical_qty:5,reserved_qty:0});assert.equal(get('SELECT physical_qty FROM inventory WHERE warehouse_id=2 AND variant_id=1').physical_qty,6);
 assert.equal(get("SELECT quantity FROM inventory_ledger WHERE reference_type='VARIANT_EDIT'").quantity,5);assert.equal(get('SELECT color_name FROM product_variants WHERE id=1').color_name,'Turkuaz');assert.equal(get("SELECT count(*) n FROM audit_logs WHERE action='PRODUCT_VARIANTS_EDITED'").n,1);
});
test('Stale stok, SKU çakışması, geçersiz sayı ve session kontrolü hiçbir şey kaydetmez',()=>{
 const p=previewVariantEdit(1,1,admin),r=rows(p);r[0].physicalQty=8;
 sqlite.exec('UPDATE inventory SET physical_qty=7 WHERE warehouse_id=1 AND variant_id=1');assert.throws(()=>save(p,r),/değişti/);
 const q=previewVariantEdit(1,1,admin),x=rows(q);x[0].sku='v2';assert.throws(()=>save(q,x),/SKU/);x[0].sku='v1';x[0].physicalQty=1.2;assert.throws(()=>save(q,x),/tam sayı/);
 x[0].physicalQty=8;assert.throws(()=>save(q,x,{...admin,sessionHash:'f'.repeat(64)}),/Oturum/);assert.throws(()=>previewVariantEdit(1,1,other),/yetki/);
 assert.equal(get('SELECT physical_qty FROM inventory WHERE warehouse_id=1 AND variant_id=1').physical_qty,7);
});
test('Ayrılmış miktar korunur ve tutarsız rezervasyon durdurur',()=>{
 sqlite.exec("UPDATE inventory SET reserved_qty=3 WHERE warehouse_id=1 AND variant_id=1; INSERT INTO inventory_reservations(warehouse_id,product_id,variant_id,qty,status,expires_at) VALUES(1,1,1,3,'ACTIVE',unixepoch()+3600)");
 const p=previewVariantEdit(1,1,admin),r=rows(p);r[0].physicalQty=2;assert.throws(()=>save(p,r),/ayrılmış/);r[0].physicalQty=3;save(p,r);assert.equal(get('SELECT physical_qty FROM inventory WHERE warehouse_id=1 AND variant_id=1').physical_qty,3);
 sqlite.exec('UPDATE inventory SET reserved_qty=2 WHERE warehouse_id=1 AND variant_id=1');assert.throws(()=>previewVariantEdit(1,1,admin),/uyuşmuyor/);sqlite.exec('UPDATE inventory SET reserved_qty=3 WHERE warehouse_id=1 AND variant_id=1');
});
test('Audit hatası varyant ve stok değişikliklerini geri alır',()=>{
 const p=previewVariantEdit(1,1,admin),r=rows(p);r[0].physicalQty=9;r[0].colorName='Hata';sqlite.exec("CREATE TRIGGER fail_variant_audit BEFORE INSERT ON audit_logs WHEN NEW.action='PRODUCT_VARIANTS_EDITED' BEGIN SELECT RAISE(ABORT,'fault'); END");assert.throws(()=>save(p,r),/fault/);assert.equal(get('SELECT physical_qty FROM inventory WHERE warehouse_id=1 AND variant_id=1').physical_qty,3);assert.equal(get('SELECT color_name FROM product_variants WHERE id=1').color_name,'Turkuaz');sqlite.exec('DROP TRIGGER fail_variant_audit');
});
test('Satış deposuna stok eklendiğinde FIFO sipariş rezervasyonu aynı transaction içinde yapılır',()=>{
 sqlite.exec("INSERT INTO orders(id,order_number,order_type,customer_name,status,payment_status,payment_method,grand_total) VALUES(1,'WAIT','ONLINE_B2C','M','BACKORDER','PENDING','EFT_HAVALE',20); INSERT INTO order_items(order_id,product_id,variant_id,product_name,sku,unit_price,quantity,total_price) VALUES(1,1,2,'Test','v2',10,2,20)");
 const p=previewVariantEdit(1,1,admin),r=rows(p);r[1].physicalQty=3;assert.equal(save(p,r).promoted,1);assert.deepEqual(get('SELECT physical_qty,reserved_qty FROM inventory WHERE warehouse_id=1 AND variant_id=2'),{physical_qty:3,reserved_qty:2});assert.equal(get('SELECT status FROM orders WHERE id=1').status,'PENDING');assert.equal(get("SELECT count(*) n FROM order_notification_outbox WHERE order_id=1").n,1);
});
test.after(()=>{sqlite.close();fs.rmSync(dir,{recursive:true,force:true});});
