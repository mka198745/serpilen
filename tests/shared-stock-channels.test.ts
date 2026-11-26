import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shared-stock-'));
process.env.DATABASE_URL=`sqlite:${path.join(dir,'db')}`;
const migrate=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env:process.env,encoding:'utf8'});assert.equal(migrate.status,0,migrate.stderr);
const {sqlite}=require('../src/db');
const {selectSharedSalesWarehouse}=require('../src/lib/shared-sales-warehouse');
const {preparePosSale,cancelPosSale,completePosSale}=require('../src/lib/pos-sale-intent');
const {processOrderQueue,stockAvailableFor}=require('../src/lib/order-queue');
const actor={id:1,name:'Kasiyer',role:'CASHIER'};
const tx=<T>(fn:()=>T)=>sqlite.transaction(fn).immediate();
sqlite.exec(`INSERT INTO warehouses(id,name,code) VALUES(2,'Mağaza','M'),(3,'Diğer','D');
 INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(1,'Ürün','shared-product','shared',1,10);
 INSERT INTO inventory(warehouse_id,product_id,physical_qty,reserved_qty) VALUES(2,1,1,0),(3,1,50,0);`);
tx(()=>selectSharedSalesWarehouse(2,{id:1,name:'Admin'}));
sqlite.exec("INSERT INTO pos_shifts(id,cashier_name,warehouse_id,opening_amount,expected_amount) VALUES(1,'Kasiyer',2,0,0)");
const payload=()=>({orderType:'POS',posRequestKey:randomUUID(),customerName:'Misafir',paymentMethod:'CASH',warehouseId:2,posShiftId:1,discountTotal:0,grandTotal:10,items:[{productId:1,variantId:null,productName:'Ürün',sku:'shared',unitPrice:10,quantity:1}]});
const stock=()=>sqlite.prepare('SELECT physical_qty,reserved_qty FROM inventory WHERE warehouse_id=2 AND product_id=1').get();
const order=()=>{const id=Number(sqlite.prepare("INSERT INTO orders(order_number,order_type,customer_name,status,payment_status,payment_method,grand_total) VALUES(?,'ONLINE_B2C','Test','BACKORDER','PENDING','EFT_HAVALE',10)").run(randomUUID()).lastInsertRowid);sqlite.prepare("INSERT INTO order_items(order_id,product_id,product_name,sku,unit_price,quantity,total_price) VALUES(?,1,'Ürün','shared',10,1,10)").run(id);return id;};

test('POS ayırdığı son adet online için kullanılamaz; iptal sonrası FIFO ayırır',()=>{
 const p=payload();tx(()=>preparePosSale(p,actor));assert.deepEqual(stock(),{physical_qty:1,reserved_qty:1});assert.equal(stockAvailableFor([{productId:1,quantity:1}]),false);
 const id=order();assert.deepEqual(processOrderQueue(),{expired:0,promoted:0});assert.equal(sqlite.prepare('SELECT status FROM orders WHERE id=?').get(id).status,'BACKORDER');
 tx(()=>cancelPosSale(p.posRequestKey,actor));assert.deepEqual(processOrderQueue(),{expired:0,promoted:1});assert.deepEqual(stock(),{physical_qty:1,reserved_qty:1});
 assert.throws(()=>tx(()=>preparePosSale(payload(),actor)),/stok yetersiz/);
 assert.equal(sqlite.prepare('SELECT physical_qty FROM inventory WHERE warehouse_id=3').get().physical_qty,50);
});
test('Süresi biten online ayırma stok serbest bırakır; POS yalnız bir kez tamamlar',()=>{
 sqlite.exec("UPDATE inventory_reservations SET expires_at=1 WHERE reference_type='PAYMENT_HOLD' AND status='ACTIVE'");
 assert.equal(processOrderQueue().expired,1);assert.deepEqual(stock(),{physical_qty:1,reserved_qty:0});
 const p=payload();tx(()=>preparePosSale(p,actor));tx(()=>completePosSale(p.posRequestKey,actor));tx(()=>completePosSale(p.posRequestKey,actor));assert.deepEqual(stock(),{physical_qty:0,reserved_qty:0});
});
test.after(()=>{sqlite.close();fs.rmSync(dir,{recursive:true,force:true});});
