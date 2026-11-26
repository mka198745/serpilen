import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'refund-guard-'));
process.env.DATABASE_URL=`sqlite:${path.join(dir,'db')}`;
const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env:process.env,encoding:'utf8'});
assert.equal(migration.status,0,migration.stderr);
const {sqlite}=require('../src/db/index');
const {createReturn,receiveReturn,completeReturn,rejectReturn}=require('../src/lib/order-returns');
const {retainRefundReplayGuard}=require('../src/lib/refund-replay-guard');
const tx=<T>(fn:()=>T)=>sqlite.transaction(fn).immediate();
const actor={id:1,name:'Yetkili'};
sqlite.exec("INSERT INTO categories(id,name,slug) VALUES(1,'Diğer','diger'); INSERT INTO warehouses(id,name,code) VALUES(3,'Mağaza','M'); INSERT INTO app_settings(key,value) VALUES('sales.shared_warehouse_id','3'); INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(1,'A','a','a',1,10)");
function order(id:number) {
 sqlite.prepare("INSERT INTO orders(id,order_number,order_type,customer_name,status,payment_status,payment_method,grand_total) VALUES(?,?,'ONLINE_B2C','Test','DELIVERED','PAID','EFT_HAVALE',20)").run(id,`R-${id}`);
 return Number(sqlite.prepare("INSERT INTO order_items(order_id,product_id,product_name,sku,unit_price,quantity,total_price) VALUES(?,1,'A','a',10,3,30)").run(id).lastInsertRowid);
}
function create(orderId:number,itemId:number, approved=true) {return tx(()=>createReturn(orderId,[{orderItemId:itemId,quantity:1}],3,false,'test',actor,approved));}
function complete(id:number){tx(()=>receiveReturn(id,actor));return tx(()=>completeReturn(id,actor));}
function remove(id:number){tx(()=>{retainRefundReplayGuard(id);sqlite.prepare('DELETE FROM order_returns WHERE id=?').run(id);sqlite.prepare('DELETE FROM order_return_items WHERE return_id=?').run(id);});}

test('Silinen tamamlanmış iade miktarı, kuruş tahsisi ve para üst sınırını korur',()=>{
 const item=order(1),a=create(1,item);assert.equal(a.refundAmount,'6.67');complete(a.id);
 assert.throws(()=>retainRefundReplayGuard(a.id),/işlemin içinde/);
 assert.throws(()=>sqlite.prepare('DELETE FROM order_return_items WHERE return_id=?').run(a.id),/completed_refund_delete_header_first/);
 assert.throws(()=>sqlite.prepare('DELETE FROM order_returns WHERE id=?').run(a.id),/completed_refund_guard_required/);
 assert.throws(()=>tx(()=>{retainRefundReplayGuard(a.id);throw Error('fault');}),/fault/);assert.equal((sqlite.prepare('SELECT count(*) n FROM deleted_refund_guards').get() as {n:number}).n,0);
 tx(()=>{retainRefundReplayGuard(a.id);retainRefundReplayGuard(a.id);});
 assert.throws(()=>sqlite.prepare('DELETE FROM deleted_refund_guards WHERE return_id=?').run(a.id),/refund_guard_immutable/);
 assert.throws(()=>sqlite.prepare('UPDATE deleted_refund_guard_items SET quantity=2 WHERE return_id=?').run(a.id),/refund_guard_immutable/);
 assert.throws(()=>sqlite.prepare('INSERT OR REPLACE INTO deleted_refund_guards(return_id,order_id,refund_cents) VALUES(?,?,?)').run(a.id,1,667),/refund_guard_immutable/);
 assert.throws(()=>sqlite.prepare('INSERT OR REPLACE INTO deleted_refund_guard_items(return_id,order_item_id,quantity,refund_cents) VALUES(?,?,?,?)').run(a.id,item,1,667),/refund_guard_immutable/);
 assert.throws(()=>sqlite.prepare("INSERT INTO order_return_items(return_id,order_item_id,product_id,product_name,quantity) VALUES(?,?,1,'A',1)").run(a.id,item),/completed_refund_immutable/);
 assert.throws(()=>sqlite.prepare("INSERT OR REPLACE INTO order_returns(id,return_number,order_id,order_number,status) VALUES(?,? ,1,'R-1','REQUESTED')").run(a.id,a.returnNumber),/completed_refund_immutable/);
 // A prepared guard is not double counted while the original exists.
 const b=create(1,item);assert.equal(b.refundAmount,'6.66');
 remove(a.id);assert.throws(()=>sqlite.prepare("INSERT INTO order_returns(id,return_number,order_id,order_number,status) VALUES(?,'REPLAY',1,'R-1','REQUESTED')").run(a.id),/completed_refund_immutable/);assert.equal((sqlite.prepare('SELECT count(*) n FROM order_returns WHERE id=?').get(a.id) as {n:number}).n,0);
 complete(b.id);const c=create(1,item);assert.equal(c.refundAmount,'6.67');complete(c.id);
 assert.throws(()=>create(1,item),/yalnız ödenmiş|aşıyor/i);
 const o=sqlite.prepare('SELECT status,payment_status FROM orders WHERE id=1').get();assert.deepEqual(o,{status:'REFUNDED',payment_status:'REFUNDED'});
 assert.equal((sqlite.prepare('SELECT sum(refund_cents) total FROM deleted_refund_guards WHERE order_id=1').get() as {total:number}).total,667);
 assert.equal(sqlite.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(sqlite.pragma('foreign_key_check'),[]);
});

test('Sonraki tamamlanmış iade silinse bile önceki tahsis geri alınamaz',()=>{
 const item=order(2),a=create(2,item,false),b=create(2,item);complete(b.id);remove(b.id);
 assert.throws(()=>tx(()=>rejectReturn(a.id,actor)),/daha sonra/);
 assert.throws(()=>sqlite.prepare('INSERT INTO deleted_refund_guards(return_id,order_id,refund_cents) VALUES(999,2,0)').run(),/refund_guard_source_invalid/);
});

test('Silinen iadeler sadakat puanı ters işleminde de sayılır',()=>{
 const item=order(3);sqlite.exec("INSERT INTO customers(id,name,phone,loyalty_points) VALUES(1,'Test','555',0); UPDATE orders SET customer_id=1 WHERE id=3; INSERT INTO loyalty_transactions(customer_id,points,type,order_id) VALUES(1,7,'EARN',3),(1,-4,'SPEND',3)");
 const a=create(3,item);complete(a.id);remove(a.id);const b=create(3,item);complete(b.id);const c=create(3,item);complete(c.id);
 assert.equal((sqlite.prepare('SELECT loyalty_points FROM customers WHERE id=1').get() as {loyalty_points:number}).loyalty_points,-3);
 assert.deepEqual(sqlite.prepare("SELECT type,SUM(points) total FROM loyalty_transactions WHERE order_id=3 AND type LIKE 'RETURN_%' GROUP BY type ORDER BY type").all(),[{type:'RETURN_RESTORE_SPEND',total:4},{type:'RETURN_REVERSE_EARN',total:-7}]);
});

test.after(()=>{sqlite.close();fs.rmSync(dir,{recursive:true,force:true});});
