import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import net from 'node:net';import {spawn,spawnSync} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';import Database from 'better-sqlite3';
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('standalone workers settle expiry once on startup across processes; POS refund confirmation is idempotent',{timeout:60000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'queue-worker-')),file=path.join(dir,'db'),env={...process.env,DATABASE_URL:`sqlite:${file}`},servers=[];let db;
 try {const mig=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(mig.status,0,mig.stderr);db=new Database(file);db.exec(`INSERT OR IGNORE INTO warehouses(id,name,code,type) VALUES(2,'Store','STORE','STORE'),(3,'Online','ONLINE','ONLINE');
 INSERT INTO users(id,name,email,password_hash,role) VALUES(1,'Admin','queue@test.invalid','x','SUPER_ADMIN');
 INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(1,'Product','worker-product','wrk',1,10);
 INSERT INTO inventory(warehouse_id,product_id,physical_qty,reserved_qty) VALUES(3,1,1,1),(2,1,0,0);
 INSERT INTO orders(id,order_number,order_type,customer_name,status,payment_status,payment_method,grand_total) VALUES(1,'EXP','ONLINE_B2C','Test','PENDING','PENDING','EFT_HAVALE',10),(2,'WAIT','ONLINE_B2C','Test','BACKORDER','PENDING','EFT_HAVALE',10),(3,'POS-TEST','POS','Test','DELIVERED','PAID','CASH',10);
 INSERT INTO order_items(order_id,product_id,product_name,sku,unit_price,quantity,total_price) VALUES(1,1,'Product','wrk',10,1,10),(2,1,'Product','wrk',10,1,10),(3,1,'Product','wrk',10,1,10);
 INSERT INTO inventory_reservations(warehouse_id,product_id,qty,reference_type,reference_id,status,expires_at) VALUES(3,1,1,'PAYMENT_HOLD','1','ACTIVE',1);
 INSERT INTO pos_shifts(id,cashier_name,warehouse_id,status,opening_amount,expected_amount) VALUES(1,'Test',2,'OPEN',100,100);`);
 const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(1,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);
 const bases=[];for(let i=0;i<2;i++){let p=await port();let s=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(p),NODE_ENV:'production'},stdio:'ignore'});servers.push(s);bases.push(`http://127.0.0.1:${p}`);for(let j=0;j<100;j++){try{await fetch(bases[i]+'/api/payments/status');break}catch{await delay(100)}}}
 assert.deepEqual(db.prepare('SELECT id,status FROM orders WHERE id IN (1,2) ORDER BY id').all(),[{id:1,status:'CANCELLED'},{id:2,status:'PENDING'}]);assert.deepEqual(db.prepare('SELECT physical_qty,reserved_qty FROM inventory WHERE warehouse_id=3 AND product_id=1').get(),{physical_qty:1,reserved_qty:1});assert.equal(db.prepare("SELECT COUNT(*) n FROM order_status_history WHERE order_id=1 AND to_status='CANCELLED'").get().n,1);
 const post=body=>fetch(bases[0]+'/api/pos/return',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const line=db.prepare('SELECT id FROM order_items WHERE order_id=3').get().id;
 let res=await post({action:'PREPARE',orderNumber:'POS-TEST',items:[{orderItemId:line,quantity:1}],posShiftId:1,refundMethod:'CASH'});assert.equal(res.status,200,await res.clone().text());const prepared=(await res.json()).data;assert.equal(prepared.refundAmount,'10.00');
 assert.equal((await post({action:'COMPLETE',returnId:prepared.id,confirmedAmount:10})).status,422);
 res=await post({action:'COMPLETE',returnId:prepared.id,confirmedAmount:10,confirmRefund:true});assert.equal(res.status,200,await res.clone().text());assert.equal((await post({action:'COMPLETE',returnId:prepared.id,confirmedAmount:10,confirmRefund:true})).status,200);
 assert.equal(db.prepare('SELECT physical_qty FROM inventory WHERE warehouse_id=2 AND product_id=1').get().physical_qty,1);assert.deepEqual(db.prepare('SELECT total_returns_cash,expected_amount FROM pos_shifts WHERE id=1').get(),{total_returns_cash:10,expected_amount:90});assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='REFUND_CONFIRMED'").get().n,1);
 // No order request: periodic workers must expire and advance a later order.
 db.exec("INSERT INTO orders(id,order_number,order_type,customer_name,status,payment_status,payment_method,grand_total) VALUES(4,'WAIT2','ONLINE_B2C','Test','BACKORDER','PENDING','EFT_HAVALE',10); INSERT INTO order_items(order_id,product_id,product_name,sku,unit_price,quantity,total_price) VALUES(4,1,'Product','wrk',10,1,10); UPDATE inventory_reservations SET expires_at=1 WHERE reference_type='PAYMENT_HOLD' AND reference_id='2'");
 await delay(32000);
 assert.deepEqual(db.prepare('SELECT id,status FROM orders WHERE id IN (2,4) ORDER BY id').all(),[{id:2,status:'CANCELLED'},{id:4,status:'PENDING'}]);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM order_status_history WHERE order_id=2 AND to_status='CANCELLED'").get().n,1);
 }finally{for(const s of servers)if(s.exitCode===null){s.kill('SIGTERM');await new Promise(r=>s.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
