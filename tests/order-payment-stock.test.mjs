import {testPosGrant} from './helpers/pos-grant.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import Database from 'better-sqlite3';
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}

test('Havale beklerken stok tutulur, banka onayı ve iptal atomiktir; stok aşımı ve sahte ödeme engellenir', {timeout:60000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eft-test-')),file=path.join(dir,'db'),env={...process.env,DATABASE_URL:`sqlite:${file}`},servers=[];let db;
 try{
  const mig=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(mig.status,0,mig.stderr);db=new Database(file);
  const tokens={},grants={};for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER']){const id=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(role,role+'@test.invalid','x',role).lastInsertRowid;tokens[role]=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(tokens[role]).digest('hex'),Math.floor(Date.now()/1000)+3600);grants[role]=testPosGrant(db,id,tokens[role]);}
  db.exec(`INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(1,'One','one','S1',1,10),(2,'Two','two','S2',1,10),(3,'Three','three','S3',1,10);
   INSERT INTO inventory(warehouse_id,product_id,physical_qty,reserved_qty) VALUES(3,1,1,0),(3,2,3,0),(3,3,0,0),(2,1,2,0);
   INSERT INTO pos_shifts(id,cashier_name,warehouse_id,opening_amount,expected_amount) VALUES(1,'Test',2,100,100);
   INSERT INTO app_settings(key,value) VALUES('site.checkout.eft_iban','TR330006100519786457841326'),('site.checkout.eft_account_name','Test account'),('site.cart.shipping_fee','0');`);
  const bases=[];for(let i=0;i<2;i++){const p=await port(),s=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(p),NODE_ENV:'production'},stdio:'ignore'});servers.push(s);bases.push(`http://127.0.0.1:${p}`);let ready=false;for(let j=0;j<100;j++){try{await fetch(bases[i]+'/api/products');ready=true;break}catch{await delay(100)}}assert.ok(ready);}
  const auth=role=>({Authorization:`Bearer ${tokens[role]}`,'X-Pos-Grant':grants[role],'Content-Type':'application/json'});
  const line=id=>({productId:id,productName:'forged',sku:'fake',unitPrice:10,quantity:1,totalPrice:10});
  const post=(base,items,patch={},role)=>fetch(base+'/api/orders',{method:'POST',headers:role?auth(role):{'Content-Type':'application/json'},body:JSON.stringify({orderType:'ONLINE_B2C',paymentMethod:'EFT_HAVALE',customerName:'Test',customerEmail:'buyer@example.test',warehouseId:3,items,subtotal:items.length*10,grandTotal:items.length*10,taxTotal:2,...patch})});
  const patch=(id,status,role='SUPER_ADMIN')=>fetch(bases[0]+'/api/orders',{method:'PATCH',headers:auth(role),body:JSON.stringify({id,status})});
  const snap=()=>Object.fromEntries(['orders','order_items','order_number_reservations','inventory','inventory_reservations','inventory_ledger','order_status_history'].map(t=>[t,db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
  const setSite=(role,body,headers={})=>fetch(bases[0]+'/api/site-settings',{method:'POST',headers:{...auth(role),...headers},body:JSON.stringify({patch:body})});
  assert.equal((await setSite('CASHIER',{'site.checkout.eft_iban':'TR330006100519786457841326'})).status,403);
  assert.equal((await setSite('STORE_MANAGER',{'site.checkout.eft_iban':''})).status,403);
  assert.equal((await setSite('SUPER_ADMIN',{'site.checkout.eft_iban':''},{Origin:'https://evil.test'})).status,403);
  const initial=snap();assert.equal((await post(bases[0],[line(1)],{paymentMethod:'CREDIT_CARD'})).status,409);assert.equal((await post(bases[0],[line(1)],{paymentMethod:'CASH'})).status,409);assert.equal((await post(bases[0],[line(1)],{orderType:'POS',paymentMethod:'CASH',warehouseId:2})).status,401);assert.deepEqual(snap(),initial);
  assert.equal((await post(bases[0],[{...line(1),quantity:-1}])).status,422);assert.equal((await post(bases[0],[{...line(1),unitPrice:0.01}])).status,409);assert.deepEqual(snap(),initial);
  // Concurrent last-item orders on separate server processes: exactly one reservation.
  const responses=await Promise.all([post(bases[0],[line(1)]),post(bases[1],[line(1)])]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,200]);const data=await Promise.all(responses.map(r=>r.json()));const success=data.find(d=>d.data.order.status==='PENDING');const waiting=data.find(d=>d.data.order.status==='BACKORDER');assert.ok(success&&waiting);const id=success.data.order.id;
  for(const endpoint of ['/api/returns','/api/pos/return']){
    const res=await fetch(bases[0]+endpoint,{method:'POST',headers:auth('SUPER_ADMIN'),body:JSON.stringify({action:endpoint==='/api/returns'?'CREATE':'PREPARE',orderId:id,orderNumber:success.data.order.orderNumber,posShiftId:1,refundMethod:'CASH',items:[{orderItemId:1,productId:1,quantity:1}]})});assert.ok([409,422].includes(res.status));
  }
  assert.equal(success.data.order.status,'PENDING');assert.equal(success.data.order.paymentStatus,'PENDING');assert.equal(db.prepare('SELECT product_name FROM order_items WHERE order_id=?').get(id).product_name,'One');
  assert.deepEqual(db.prepare('SELECT physical_qty,reserved_qty FROM inventory WHERE warehouse_id=3 AND product_id=1').get(),{physical_qty:1,reserved_qty:1});
  const hold=db.prepare("SELECT * FROM inventory_reservations WHERE reference_type='PAYMENT_HOLD' AND reference_id=?").get(String(id));assert.equal(hold.status,'ACTIVE');
  // Generic reservation APIs must not release/consume payment holds.
  for(const action of ['RELEASE','CONSUME']){const res=await fetch(bases[0]+'/api/reservations',{method:'POST',headers:auth('SUPER_ADMIN'),body:JSON.stringify({action,referenceId:String(id)})});assert.equal(res.status,200);}
  assert.equal(db.prepare('SELECT status FROM inventory_reservations WHERE id=?').get(hold.id).status,'ACTIVE');
  const forged=await fetch(bases[0]+'/api/reservations',{method:'POST',headers:auth('SUPER_ADMIN'),body:JSON.stringify({action:'RESERVE',warehouseId:3,productId:2,qty:1,referenceType:'PAYMENT_HOLD',referenceId:'fake'})});assert.equal(forged.status,409);
  const adjustment=await fetch(bases[0]+'/api/inventory',{method:'POST',headers:auth('SUPER_ADMIN'),body:JSON.stringify({action:'ADJUST',warehouseId:3,productId:1,quantityDelta:-1})});assert.notEqual(adjustment.status,200);
  await fetch(bases[0]+'/api/reservations',{headers:auth('SUPER_ADMIN')});assert.equal(db.prepare('SELECT status FROM inventory_reservations WHERE id=?').get(hold.id).status,'ACTIVE');
  assert.equal((await patch(id,'PAID','CASHIER')).status,403);
  const before=snap();db.exec("CREATE TRIGGER reject_history BEFORE INSERT ON order_status_history BEGIN SELECT RAISE(ABORT,'test'); END");assert.equal((await patch(id,'PAID')).status,500);assert.deepEqual(snap(),before);db.exec('DROP TRIGGER reject_history');
  const approved=await patch(id,'PAID');assert.equal(approved.status,200,await approved.clone().text());const order=(await approved.json()).data;assert.equal(order.paymentStatus,'PAID');assert.equal(order.status,'PAID');assert.deepEqual(db.prepare('SELECT physical_qty,reserved_qty FROM inventory WHERE warehouse_id=3 AND product_id=1').get(),{physical_qty:0,reserved_qty:0});assert.equal(db.prepare('SELECT status FROM inventory_reservations WHERE id=?').get(hold.id).status,'CONSUMED');
  assert.notEqual((await patch(id,'PAID')).status,200);assert.equal((await patch(id,'CANCELLED')).status,409);assert.equal(db.prepare("SELECT COUNT(*) n FROM inventory_ledger WHERE transaction_type='SALE' AND reference_id=?").get(order.orderNumber).n,1);
  const pending=await post(bases[0],[line(2)]);assert.equal(pending.status,200,await pending.clone().text());const id2=(await pending.json()).data.order.id;const beforeCancel=snap();db.exec("CREATE TRIGGER reject_history BEFORE INSERT ON order_status_history BEGIN SELECT RAISE(ABORT,'test'); END");assert.equal((await patch(id2,'CANCELLED')).status,500);assert.deepEqual(snap(),beforeCancel);db.exec('DROP TRIGGER reject_history');
  const cancelled=await patch(id2,'CANCELLED');assert.equal(cancelled.status,200);assert.equal((await cancelled.json()).data.paymentStatus,'CANCELLED');assert.deepEqual(db.prepare('SELECT physical_qty,reserved_qty FROM inventory WHERE warehouse_id=3 AND product_id=2').get(),{physical_qty:3,reserved_qty:0});
  // Approval and cancellation arriving together cannot both settle the same hold.
  const race=await post(bases[0],[line(2)]);assert.equal(race.status,200,await race.clone().text());const rid=(await race.json()).data.order.id;
  const racing=await Promise.all(['PAID','CANCELLED'].map((status,i)=>fetch(bases[i]+'/api/orders',{method:'PATCH',headers:auth('SUPER_ADMIN'),body:JSON.stringify({id:rid,status})})));
  assert.deepEqual(racing.map(r=>r.status).sort(),[200,409]);const settled=db.prepare('SELECT status,payment_status FROM orders WHERE id=?').get(rid);assert.ok((settled.status==='PAID'&&settled.payment_status==='PAID')||(settled.status==='CANCELLED'&&settled.payment_status==='CANCELLED'));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM inventory_reservations WHERE reference_type='PAYMENT_HOLD' AND reference_id=? AND status='ACTIVE'").get(String(rid)).n,0);
  // A separate reservation writer competes for the same final unit as an order.
  db.prepare('UPDATE inventory SET physical_qty=1 WHERE warehouse_id=3 AND product_id=3').run();
  const [ordinary,orderRace]=await Promise.all([fetch(bases[1]+'/api/reservations',{method:'POST',headers:auth('SUPER_ADMIN'),body:JSON.stringify({action:'RESERVE',warehouseId:3,productId:3,qty:1,referenceId:'OTHER'})}),post(bases[0],[line(3)])]);
  assert.ok([200,409].includes(ordinary.status));assert.equal(orderRace.status,200);assert.deepEqual(db.prepare('SELECT physical_qty,reserved_qty FROM inventory WHERE warehouse_id=3 AND product_id=3').get(),{physical_qty:1,reserved_qty:1});
  const posPayload={orderType:'POS',paymentMethod:'CASH',warehouseId:2,posShiftId:1,posRequestKey:crypto.randomUUID(),items:[line(1)],subtotal:10,discountTotal:0,grandTotal:10};
  const posSale=payload=>fetch(bases[0]+'/api/pos/sale',{method:'POST',headers:auth('CASHIER'),body:JSON.stringify(payload)});
  const pos=await posSale({action:'PREPARE',payload:posPayload});assert.equal(pos.status,200,await pos.clone().text());const done=await posSale({action:'COMPLETE',key:posPayload.posRequestKey,confirmPayment:true});assert.equal(done.status,200,await done.clone().text());assert.equal((await done.json()).data.order.status,'DELIVERED');assert.equal(db.prepare('SELECT physical_qty FROM inventory WHERE warehouse_id=2 AND product_id=1').get().physical_qty,1);
  const excessive=await posSale({action:'PREPARE',payload:{...posPayload,posRequestKey:crypto.randomUUID(),items:[{...line(1),quantity:2}],grandTotal:20}});assert.equal(excessive.status,409);

 }finally{for(const s of servers)if(s.exitCode===null){s.kill('SIGTERM');await new Promise(r=>s.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
