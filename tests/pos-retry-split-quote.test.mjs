import {testPosGrant} from './helpers/pos-grant.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import net from 'node:net';import {spawn,spawnSync} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';import Database from 'better-sqlite3';
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('POS quote, split and concurrent identical retries record one sale and correct shift amounts',{timeout:60000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-retry-')),file=path.join(dir,'db'),env={...process.env,DATABASE_URL:`sqlite:${file}`},servers=[];let db;
 try{const m=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(m.status,0,m.stderr);db=new Database(file);db.exec(`INSERT INTO warehouses(id,name,code) VALUES(2,'Mağaza','M'),(3,'Diğer','O'); INSERT INTO app_settings(key,value) VALUES('sales.shared_warehouse_id','2'); INSERT INTO users(id,name,email,password_hash,role) VALUES(1,'Cashier','cash@invalid.test','x','CASHIER'),(2,'Admin','admin@invalid.test','x','SUPER_ADMIN');
 INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(1,'Item','pos-quote','posquote',1,100);
 INSERT INTO inventory(warehouse_id,product_id,physical_qty,reserved_qty) VALUES(2,1,1,0);
 INSERT INTO pos_shifts(id,cashier_name,warehouse_id,opening_amount,expected_amount) VALUES(1,'Cashier',2,100,100);
 INSERT INTO promotions(id,name,rule_type,category_id,percent_value,start_date) VALUES(1,'Ten','PERCENT_CATEGORY',1,10,1);`);
 const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(1,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);
 const adminToken=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(2,?,?)').run(crypto.createHash('sha256').update(adminToken).digest('hex'),Math.floor(Date.now()/1000)+3600);
 const bases=[];for(let i=0;i<2;i++){let p=await port(),s=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(p),NODE_ENV:'production'},stdio:'ignore'});servers.push(s);bases.push(`http://127.0.0.1:${p}`);for(let j=0;j<100;j++){try{await fetch(bases[i]+'/api/payments/status');break}catch{await delay(100)}}}
 let grant=testPosGrant(db,1,token);
 const headers={'X-Pos-Grant':grant,Authorization:`Bearer ${token}`,'Content-Type':'application/json'};const item={productId:1,quantity:1,unitPrice:100,productName:'Item',sku:'posquote',totalPrice:100};
 const quote=await fetch(bases[0]+'/api/pos/quote',{method:'POST',headers,body:JSON.stringify({items:[item],discountTotal:5})});assert.equal(quote.status,200,await quote.clone().text());const q=(await quote.json()).data;assert.equal(q.grandTotal,85);assert.equal(q.promotionDiscount,10);
 const key=crypto.randomUUID(),payload={orderType:'POS',posRequestKey:key,paymentMethod:'SPLIT',splitCash:30,splitCard:55,posShiftId:1,warehouseId:2,items:[item],subtotal:100,discountTotal:5,grandTotal:85};
 const post=(b,p)=>fetch(b+'/api/pos/sale',{method:'POST',headers,body:JSON.stringify(p)});
 let stale=await post(bases[0],{action:'PREPARE',payload:{...payload,posRequestKey:crypto.randomUUID(),grandTotal:90}});assert.equal(stale.status,409);assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
 const prepares=await Promise.all([post(bases[0],{action:'PREPARE',payload}),post(bases[1],{action:'PREPARE',payload})]);assert.deepEqual(prepares.map(r=>r.status),[200,200]);
 assert.deepEqual(db.prepare('SELECT physical_qty,reserved_qty FROM inventory WHERE product_id=1').get(),{physical_qty:1,reserved_qty:1});assert.equal(db.prepare('SELECT used_count FROM promotions WHERE id=1').get().used_count,1);
 const closed=await fetch(bases[1]+'/api/pos/shift',{method:'POST',headers,body:JSON.stringify({action:'CLOSE',shiftId:1,closingAmount:100})});assert.equal(closed.status,409);
 // Price and promotion changes after prepare must not alter the captured price.
 db.exec("UPDATE products SET retail_price=120 WHERE id=1; UPDATE promotions SET is_active=0 WHERE id=1");
 for(const action of ['RELEASE','CONSUME']) {const r=await fetch(bases[0]+'/api/reservations',{method:'POST',headers,body:JSON.stringify({action,referenceId:key})});assert.equal(r.status,200);}
 assert.equal(db.prepare("SELECT status FROM inventory_reservations WHERE reference_id=?").get(key).status,'ACTIVE');
 // Lock/re-entry must leave the paid-but-unconfirmed intent recoverable.
 db.prepare('DELETE FROM pos_screen_grants WHERE user_id=1').run();
 assert.equal((await post(bases[0],{action:'COMPLETE',key,confirmPayment:true})).status,403);
 grant=testPosGrant(db,1,token);headers['X-Pos-Grant']=grant;
 const complete={action:'COMPLETE',key,confirmPayment:true};
 const results=await Promise.all([post(bases[0],complete),post(bases[1],complete)]);assert.deepEqual(results.map(r=>r.status),[200,200]);const bodies=await Promise.all(results.map(r=>r.json()));assert.equal(bodies[0].data.order.id,bodies[1].data.order.id);assert.equal(bodies[0].data.cashierName,'Cashier');assert.equal(bodies[1].data.cashierName,'Cashier');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,1);assert.equal(db.prepare('SELECT physical_qty FROM inventory WHERE product_id=1').get().physical_qty,0);assert.deepEqual(db.prepare('SELECT total_sales_cash,total_sales_card,total_sales_split,expected_amount FROM pos_shifts WHERE id=1').get(),{total_sales_cash:30,total_sales_card:55,total_sales_split:85,expected_amount:130});assert.deepEqual(db.prepare('SELECT cash_amount,card_amount FROM pos_sale_payments').get(),{cash_amount:3000,card_amount:5500});assert.equal(db.prepare('SELECT used_count FROM promotions WHERE id=1').get().used_count,1);
 assert.equal((await post(bases[0],complete)).status,200);assert.equal((await post(bases[0],{action:'PREPARE',payload:{...payload,splitCash:31,splitCard:54}})).status,409);
 db.exec("INSERT INTO orders(id,order_number,order_type,customer_name,status,payment_status,payment_method,discount_total,grand_total) VALUES(99,'OLD-99','ONLINE_B2C','Test','PENDING','PENDING','EFT_HAVALE',5,95); INSERT INTO inventory_reservations(warehouse_id,product_id,qty,reference_type,reference_id,status,expires_at) VALUES(3,1,1,'PAYMENT_HOLD','99','ACTIVE',253402300799)");
 assert.equal((await fetch(bases[0]+'/api/orders/reconciliation',{headers})).status,403);
 const review=await fetch(bases[0]+'/api/orders/reconciliation',{headers:{Authorization:`Bearer ${adminToken}`}});assert.equal(review.status,200);const reviewData=(await review.json()).data;assert.equal(reviewData.total,1);assert.equal(reviewData.rows[0].orderNumber,'OLD-99');assert.equal(reviewData.rows[0].longHold,1);assert.equal(reviewData.rows[0].noClaims,1);assert.equal(db.prepare("SELECT status FROM orders WHERE id=99").get().status,'PENDING');

 }finally{for(const s of servers)if(s.exitCode===null){s.kill('SIGTERM');await new Promise(r=>s.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
