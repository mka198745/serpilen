import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'queue-returns-'));
process.env.DATABASE_URL=`sqlite:${path.join(dir,'db')}`;
const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env:process.env,encoding:'utf8'});
assert.equal(migration.status,0,migration.stderr);
const {sqlite}=require('../src/db/index');
const {processOrderQueue}=require('../src/lib/order-queue');
const returns=require('../src/lib/order-returns');
const discounts=require('../src/lib/order-discounts');
const actor={id:1,name:'Test'};
const tx=<T>(fn:()=>T)=>sqlite.transaction(fn).immediate();
sqlite.exec(`INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(1,'A','queue-a','qa',1,10),(2,'B','queue-b','qb',1,10),(3,'C','queue-c','qc',1,10);
INSERT INTO inventory(warehouse_id,product_id,physical_qty,reserved_qty) VALUES(3,1,1,0),(3,2,0,0),(3,3,1,0);
INSERT OR IGNORE INTO warehouses(id,name,code,type) VALUES(3,'Online','ONLINE','ONLINE');
INSERT INTO customers(id,name,phone,loyalty_points) VALUES(1,'Test','555',0);
`);
function order(id:number,status:string,items:Array<[number,number]>,grand=10,customer:number|null=null) {
 sqlite.prepare("INSERT INTO orders(id,order_number,order_type,customer_id,customer_name,status,payment_status,payment_method,grand_total) VALUES(?,?, 'ONLINE_B2C',?,'Test',?,?, 'EFT_HAVALE',?)").run(id,`TEST-${id}`,customer,status,status==='DELIVERED'?'PAID':'PENDING',grand);
 const stmt=sqlite.prepare("INSERT INTO order_items(order_id,product_id,product_name,sku,unit_price,quantity,total_price) VALUES(?,?,?,'q',10,?,?)");
 for(const [p,q] of items)stmt.run(id,p,'Test',q,q*10);
}
function item(orderId:number){return (sqlite.prepare('SELECT id FROM order_items WHERE order_id=? ORDER BY id LIMIT 1').get(orderId) as {id:number}).id;}
function status(id:number){return (sqlite.prepare('SELECT status FROM orders WHERE id=?').get(id) as {status:string}).status;}

test('FIFO blocks shared items, promotes independent orders and expires holds atomically',()=>{
 order(1,'BACKORDER',[[1,1],[2,1]],20);order(2,'BACKORDER',[[1,1]]);order(3,'BACKORDER',[[3,1]]);
 assert.deepEqual(processOrderQueue(),{expired:0,promoted:1});assert.equal(status(1),'BACKORDER');assert.equal(status(2),'BACKORDER');assert.equal(status(3),'PENDING');assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM order_notification_outbox WHERE order_id=3").get() as {n:number}).n,1);
 const hold=sqlite.prepare("SELECT expires_at,created_at FROM inventory_reservations WHERE reference_id='3'").get() as {expires_at:number;created_at:number};assert.equal(hold.expires_at-hold.created_at,86400);
 sqlite.exec("UPDATE inventory SET physical_qty=1 WHERE warehouse_id=3 AND product_id=2; UPDATE inventory_reservations SET expires_at=1 WHERE reference_id='3'");
 sqlite.exec("CREATE TRIGGER fail_hist BEFORE INSERT ON order_status_history BEGIN SELECT RAISE(ABORT,'fail'); END");
 assert.throws(()=>processOrderQueue());assert.equal(status(3),'PENDING');assert.equal(status(1),'BACKORDER');assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM order_notification_outbox WHERE order_id=1").get() as {n:number}).n,0);sqlite.exec('DROP TRIGGER fail_hist');
 assert.deepEqual(processOrderQueue(),{expired:1,promoted:1});assert.equal(status(3),'CANCELLED');assert.equal(status(1),'PENDING');assert.equal(status(2),'BACKORDER');
 assert.deepEqual(processOrderQueue(),{expired:0,promoted:0});
});

test('partial returns allocate exact cents, enforce quantities, reverse loyalty, and roll back',()=>{
 order(10,'DELIVERED',[[1,3]],20,1);const line=item(10);
 sqlite.exec("INSERT INTO loyalty_transactions(customer_id,points,type,order_id) VALUES(1,7,'EARN',10),(1,-4,'SPEND',10)");
 const create=()=>tx(()=>returns.createReturn(10,[{orderItemId:line,quantity:1}],3,true,'test',actor));
 const a=create(),b=create();assert.equal(a.refundAmount,'6.67');assert.equal(b.refundAmount,'6.66');
 assert.throws(()=>tx(()=>returns.rejectReturn(a.id,actor)),/daha sonra/);
 tx(()=>returns.rejectReturn(b.id,actor));const c=create();assert.equal(c.refundAmount,'6.66');const d=create();assert.equal(d.refundAmount,'6.67');assert.throws(create,/aşıyor/);
 for(const r of [a,c,d]){tx(()=>returns.approveReturn(r.id,actor));tx(()=>returns.receiveReturn(r.id,actor));}
 sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'fail'); END");
 assert.throws(()=>tx(()=>returns.completeReturn(a.id,actor)));assert.equal((sqlite.prepare('SELECT status FROM order_returns WHERE id=?').get(a.id) as {status:string}).status,'RECEIVED');assert.equal((sqlite.prepare('SELECT loyalty_points FROM customers WHERE id=1').get() as {loyalty_points:number}).loyalty_points,0);sqlite.exec('DROP TRIGGER fail_audit');
 tx(()=>returns.completeReturn(a.id,actor));assert.equal(tx(()=>returns.completeReturn(a.id,actor)).alreadyCompleted,true);
 tx(()=>returns.completeReturn(c.id,actor));tx(()=>returns.completeReturn(d.id,actor));
 assert.equal(status(10),'REFUNDED');assert.equal((sqlite.prepare('SELECT loyalty_points FROM customers WHERE id=1').get() as {loyalty_points:number}).loyalty_points,-3);
 assert.equal((sqlite.prepare("SELECT SUM(refund_amount) sum FROM order_returns WHERE order_id=10 AND status='REFUNDED'").get() as {sum:number}).sum,20);
});

test('discount claims release once and inconsistent counters roll back',()=>{
 sqlite.exec("INSERT INTO coupons(id,code,discount_value,used_count) VALUES(1,'COUPON',10,1); INSERT INTO promotions(id,name,used_count) VALUES(1,'Promo',1)");
 tx(()=>discounts.claimOrderDiscounts(88,1,[1,1]));tx(()=>discounts.releaseOrderDiscounts(88));tx(()=>discounts.releaseOrderDiscounts(88));
 assert.equal((sqlite.prepare('SELECT used_count FROM coupons WHERE id=1').get() as {used_count:number}).used_count,0);
 assert.equal((sqlite.prepare('SELECT used_count FROM promotions WHERE id=1').get() as {used_count:number}).used_count,0);
 tx(()=>discounts.claimOrderDiscounts(89,1,[1]));assert.throws(()=>tx(()=>discounts.releaseOrderDiscounts(89)),/inconsistent/);
 assert.equal((sqlite.prepare("SELECT COUNT(*) n FROM order_discount_claims WHERE order_id=89 AND status='ACTIVE'").get() as {n:number}).n,2);
});

test.after(()=>{sqlite.close();fs.rmSync(dir,{recursive:true,force:true});});
