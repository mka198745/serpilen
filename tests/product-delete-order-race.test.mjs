import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import Database from 'better-sqlite3';
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}

test('Ürün silme ile eşzamanlı sipariş ve eski sepetler kayıpsız doğrulanır', {timeout:60000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'product-order-race-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server,server2;
 try{
  const m=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(m.status,0,m.stderr);db=new Database(file);
  const uid=db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES('Admin','admin@example.test','x','SUPER_ADMIN')").run().lastInsertRowid;const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(uid,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);
  const add=db.prepare('INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(?,?,?,?,1,10)');for(let i=1;i<=23;i++)add.run(i,`Product ${i}`,`product-${i}`,`SKU-${i}`);
  db.exec("INSERT INTO product_variants(id,product_id,sku,retail_price) VALUES(101,2,'V101',10),(102,3,'V102',10); INSERT INTO coupons(code,discount_value) VALUES('TEST',5); INSERT INTO inventory(warehouse_id,product_id,variant_id,physical_qty,reserved_qty) VALUES(3,2,101,5,0),(3,3,102,5,0),(2,4,NULL,5,0); INSERT INTO pos_shifts(id,cashier_name,warehouse_id,opening_amount,expected_amount) VALUES(1,'Test',2,100,100); INSERT INTO app_settings(key,value) VALUES('site.checkout.eft_iban','TR330006100519786457841326'),('site.checkout.eft_account_name','Test account'),('site.cart.shipping_fee','0')");
  const port=await freePort();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${port}`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/products');ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const port2=await freePort();server2=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port2),NODE_ENV:'production'},stdio:'ignore'});const base2=`http://127.0.0.1:${port2}`;ready=false;for(let i=0;i<100;i++){try{await fetch(base2+'/api/products');ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const del=id=>fetch(base2+'/api/products',{method:'DELETE',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({id})});
  const line=(productId,variantId=null)=>({productId,variantId,productName:`Product ${productId}`,sku:`SKU-${productId}`,unitPrice:10,quantity:1,totalPrice:10});
  const order=(items,extra={})=>fetch(base+'/api/orders',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({customerName:'Test',customerEmail:'buyer@example.test',items,subtotal:items.length*10,taxTotal:2,grandTotal:items.length*10-(extra.couponCode?items.length*0.5:0),warehouseId:3,paymentMethod:'EFT_HAVALE',applyCampaigns:false,...extra})});
  const snapshot=()=>({orders:db.prepare('SELECT COUNT(*) n FROM orders').get().n,items:db.prepare('SELECT COUNT(*) n FROM order_items').get().n,ledger:db.prepare('SELECT COUNT(*) n FROM inventory_ledger').get().n});
  assert.equal((await del(1)).status,200);
  const reservation=await (await fetch(base+'/api/orders/next-number',{method:'POST'})).json();
  const initial=snapshot();const stale=await order([line(1),line(2,101)],{orderNumber:reservation.orderNumber,orderNumberToken:reservation.token,couponCode:'TEST'});assert.equal(stale.status,409);assert.match((await stale.json()).error,/artık mevcut değil/);assert.deepEqual(snapshot(),initial);
  assert.equal(db.prepare('SELECT used FROM order_number_reservations WHERE token=?').get(reservation.token).used,0);assert.equal(db.prepare("SELECT used_count FROM coupons WHERE code='TEST'").get().used_count,0);
  assert.equal((await order([line(true)])).status,409);assert.equal((await order([line(2,false)])).status,409);
  assert.equal((await order([line(2,102)])).status,409,'variant belongs to another product');assert.equal((await order([line(2,999)])).status,409);assert.deepEqual(snapshot(),initial);
  db.exec("CREATE TRIGGER reject_order_item BEFORE INSERT ON order_items WHEN NEW.product_id=3 BEGIN SELECT RAISE(ABORT,'test failure'); END");
  assert.equal((await order([line(2,101),line(3,102)],{orderNumber:reservation.orderNumber,orderNumberToken:reservation.token})).status,500);assert.deepEqual(snapshot(),initial);assert.equal(db.prepare('SELECT used FROM order_number_reservations WHERE token=?').get(reservation.token).used,0);db.exec('DROP TRIGGER reject_order_item');
  const success=await order([line(2,101),line(3,102)],{orderNumber:reservation.orderNumber,orderNumberToken:reservation.token,couponCode:'TEST'});assert.equal(success.status,200,await success.clone().text());assert.equal(db.prepare('SELECT used FROM order_number_reservations WHERE token=?').get(reservation.token).used,1);assert.equal(db.prepare("SELECT used_count FROM coupons WHERE code='TEST'").get().used_count,1);
  assert.equal((await del(2)).status,409);assert.equal((await del(3)).status,409);
  const posPayload={orderType:'POS',paymentMethod:'CASH',warehouseId:2,posShiftId:1,posRequestKey:crypto.randomUUID(),items:[line(4)],discountTotal:0,grandTotal:10};
  const sale=body=>fetch(base+'/api/pos/sale',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const pos=await sale({action:'PREPARE',payload:posPayload});assert.equal(pos.status,200,await pos.clone().text());assert.equal((await del(4)).status,409);const posComplete=await sale({action:'COMPLETE',key:posPayload.posRequestKey,confirmPayment:true});assert.equal(posComplete.status,200,await posComplete.clone().text());const posResult=await posComplete.json();assert.match(posResult.data.order.orderNumber,/^POS-/);assert.equal(posResult.data.order.status,'DELIVERED');assert.equal((await del(4)).status,409);
  const stalePos=await sale({action:'PREPARE',payload:{...posPayload,posRequestKey:crypto.randomUUID(),items:[line(1)]}});assert.equal(stalePos.status,409);

  db.prepare("INSERT INTO product_variants(id,product_id,sku,retail_price) VALUES(103,23,'V103',10)").run();db.prepare('DELETE FROM product_variants WHERE id=103').run();assert.equal((await order([line(23,103)])).status,409);
  // Hold a separate SQLite write lock with uncommitted changes. Each real API
  // must wait and evaluate the other writer's committed result, not a stale snapshot.
  db.exec('BEGIN IMMEDIATE; DELETE FROM products WHERE id=21');
  let pending=order([line(21)]);assert.equal(await Promise.race([pending.then(()=>false),delay(200).then(()=>true)]),true);db.exec('COMMIT');assert.equal((await pending).status,409);
  db.exec("BEGIN IMMEDIATE; INSERT INTO orders(order_number,customer_name) VALUES('LOCK-TEST','Test'); INSERT INTO order_items(order_id,product_id,product_name,sku,unit_price,quantity,total_price) VALUES(last_insert_rowid(),22,'Product 22','SKU-22',10,1,10)");
  pending=del(22);assert.equal(await Promise.race([pending.then(()=>false),delay(200).then(()=>true)]),true);db.exec('COMMIT');assert.equal((await pending).status,409);
  for(let id=5;id<=20;id++){
    const [d,o]=await Promise.all([del(id),order([line(id)])]);
    assert.ok((d.status===200 && o.status===409)||(d.status===409 && o.status===200),`id=${id}, delete=${d.status}, order=${o.status}`);
    const product=!!db.prepare('SELECT id FROM products WHERE id=?').get(id), item=!!db.prepare('SELECT id FROM order_items WHERE product_id=?').get(id);
    assert.equal(product,item,`id=${id} orphan check`);
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM order_items i LEFT JOIN products p ON p.id=i.product_id WHERE p.id IS NULL').get().n,0);
 }finally{if(server2&&server2.exitCode===null){server2.kill('SIGTERM');await new Promise(r=>server2.once('exit',r));}if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
