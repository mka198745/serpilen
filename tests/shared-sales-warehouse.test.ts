import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('Ortak depo seçimi açık işlemleri korur ve stok taşımaz', () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shared-warehouse-'));
 const file=path.join(dir,'test.db');
 process.env.DATABASE_URL=`sqlite:${file}`;
 try {
  const m=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env:process.env,encoding:'utf8'});
  assert.equal(m.status,0,m.stderr);
  const {sqlite}=require('../src/db');
  const {sharedSalesWarehouseId,selectSharedSalesWarehouse}=require('../src/lib/shared-sales-warehouse');
  sqlite.exec("INSERT INTO warehouses(id,name,code,is_active) VALUES(2,'Mağaza','M',1),(3,'Online','O',1),(4,'Pasif','P',0); INSERT INTO inventory(warehouse_id,product_id,physical_qty,reserved_qty) VALUES(2,10,7,0),(3,10,4,0)");
  const choose=(id:number)=>sqlite.transaction(()=>selectSharedSalesWarehouse(id,{id:1,name:'Admin'})).immediate();
  assert.equal(sharedSalesWarehouseId(),null);
  assert.throws(()=>selectSharedSalesWarehouse(2,{id:1,name:'Admin'}),/transaction/);
  assert.throws(()=>choose(4),/aktif bir depo/);
  sqlite.exec("INSERT INTO pos_shifts(warehouse_id,status,cashier_name) VALUES(2,'OPEN','Kasiyer')");
  assert.throws(()=>choose(2),/açık POS vardiyası/);
  assert.equal(sharedSalesWarehouseId(),null);
  sqlite.exec("DELETE FROM pos_shifts; INSERT INTO inventory_reservations(warehouse_id,product_id,qty,expires_at,status) VALUES(3,10,1,unixepoch()+1000,'ACTIVE')");
  assert.throws(()=>choose(2),/aktif stok rezervasyonu/);
  sqlite.exec("DELETE FROM inventory_reservations; UPDATE inventory SET reserved_qty=1 WHERE warehouse_id=3");
  assert.throws(()=>choose(2),/ayrılmış veya tutarsız stok/);
  sqlite.exec("UPDATE inventory SET reserved_qty=0 WHERE warehouse_id=3");
  sqlite.exec("INSERT INTO orders(order_number,customer_name,order_type,status,payment_status) VALUES('O1','Müşteri','ONLINE_B2C','BACKORDER','PENDING')");
  assert.throws(()=>choose(2),/açık online sipariş/);
  sqlite.exec("DELETE FROM orders; INSERT INTO order_returns(return_number,order_id,order_number,status) VALUES('R1',1,'O1','APPROVED')");
  assert.throws(()=>choose(2),/açık iade/);
  sqlite.exec("DELETE FROM order_returns; INSERT INTO pos_sale_intents(request_key,request_hash,actor_id,actor_name,shift_id,payload_json,quote_json,status) VALUES('K','H',1,'Kasiyer',1,'{}','{}','PREPARED')");
  assert.throws(()=>choose(2),/sonuçlanmamış POS satışı/);
  sqlite.exec("DELETE FROM pos_sale_intents");
  assert.deepEqual(choose(2),{id:2,changed:true});
  assert.equal(sharedSalesWarehouseId(),2);
  assert.deepEqual(choose(2),{id:2,changed:false});
  assert.deepEqual(sqlite.prepare('SELECT warehouse_id,physical_qty FROM inventory ORDER BY warehouse_id').all(),[{warehouse_id:2,physical_qty:7},{warehouse_id:3,physical_qty:4}]);
  sqlite.exec("CREATE TRIGGER block_selection_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'audit failure'); END");
  assert.throws(()=>choose(3),/audit failure/);assert.equal(sharedSalesWarehouseId(),2);
  sqlite.exec('DROP TRIGGER block_selection_audit');
  assert.deepEqual(choose(3),{id:3,changed:true});assert.equal(sharedSalesWarehouseId(),3);
  sqlite.exec("UPDATE warehouses SET is_active=0 WHERE id=3");assert.equal(sharedSalesWarehouseId(),null);
  sqlite.close();
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
