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
import {testPosGrant} from './helpers/pos-grant.mjs';
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('ortak depo yetkisi, vitrin stoğu ve eşzamanlı POS/online işlemleri', {timeout:60000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shared-api-')),file=path.join(dir,'db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};const servers=[];let db;
 try{
  const m=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(m.status,0,m.stderr);db=new Database(file);
  db.exec(`INSERT INTO categories(id,name,slug) VALUES(1,'Kategori','kategori'); INSERT INTO warehouses(id,name,code) VALUES(2,'Mağaza','M'),(3,'Diğer','D');
   INSERT INTO users(id,name,email,password_hash,role) VALUES(1,'Admin','admin@shared.test','x','SUPER_ADMIN'),(2,'Kasiyer','cashier@shared.test','x','CASHIER');
   INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(1,'Ürün','shared','shared',1,10);
   INSERT INTO inventory(warehouse_id,product_id,physical_qty,reserved_qty) VALUES(2,1,1,0),(3,1,25,0);
   INSERT INTO app_settings(key,value) VALUES('site.checkout.eft_iban','TR330006100519786457841326'),('site.checkout.eft_account_name','Test account'),('site.cart.shipping_fee','0');`);
  const tokens={};for(const id of [1,2]){const token=crypto.randomBytes(32).toString('hex');tokens[id]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  const grant=testPosGrant(db,2,tokens[2]),bases=[];for(let i=0;i<2;i++){const p=await port(),s=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(p),NODE_ENV:'production'},stdio:'ignore'});servers.push(s);bases.push(`http://127.0.0.1:${p}`);let ready=false;for(let j=0;j<100;j++){try{await fetch(bases[i]+'/api/health');ready=true;break}catch{await delay(100)}}assert.ok(ready);}
  const headers=id=>({Authorization:`Bearer ${tokens[id]}`,'Content-Type':'application/json'});
  const choose=(id,wh,extra={})=>fetch(bases[0]+'/api/warehouses/sales-warehouse',{method:'POST',headers:{...headers(id),...extra},body:JSON.stringify({warehouseId:wh})});
  const posHeaders={...headers(2),'X-Pos-Grant':grant};
  assert.equal((await fetch(bases[0]+'/api/pos/bootstrap',{headers:posHeaders})).status,409);
  const noConfig=await fetch(bases[0]+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderType:'ONLINE_B2C',paymentMethod:'EFT_HAVALE',customerName:'Test',customerEmail:'buyer@example.test',items:[{productId:1,productName:'Ürün',sku:'shared',unitPrice:10,quantity:1,totalPrice:10}],subtotal:10,grandTotal:10,taxTotal:2})});assert.equal(noConfig.status,409);
  assert.equal((await choose(2,2)).status,403);assert.equal((await choose(1,2,{Origin:'https://evil.test'})).status,403);
  assert.deepEqual(db.prepare('SELECT * FROM pos_shifts').all(),[]);assert.equal(db.prepare('SELECT count(*) n FROM inventory WHERE reserved_qty IS NULL OR reserved_qty<>0 OR physical_qty IS NULL OR physical_qty<0').get().n,0);
  const chosen=await choose(1,2);assert.equal(chosen.status,200,await chosen.clone().text());assert.equal(db.prepare("SELECT value FROM app_settings WHERE key='sales.shared_warehouse_id'").get().value,'2');
  let products=await (await fetch(bases[0]+'/api/products')).json();assert.equal(products.data.find(x=>x.id===1).totalStock,1);
  const [changeRace,openRace]=await Promise.all([
   choose(1,3),
   fetch(bases[1]+'/api/pos/shift',{method:'POST',headers:posHeaders,body:JSON.stringify({action:'OPEN',warehouseId:2,openingAmount:'0'})})
  ]);
  assert.ok((changeRace.status===200 && openRace.status===409)||(changeRace.status===409 && openRace.status===200),`change ${changeRace.status}, open ${openRace.status}`);
  if(changeRace.status===200){assert.equal((await choose(1,2)).status,200);}
  else {const previous=(await openRace.json()).data;const close=await fetch(bases[1]+'/api/pos/shift',{method:'POST',headers:posHeaders,body:JSON.stringify({action:'CLOSE',shiftId:previous.id,closingAmount:0})});assert.equal(close.status,200);}
  let r=await fetch(bases[0]+'/api/pos/shift',{method:'POST',headers:posHeaders,body:JSON.stringify({action:'OPEN',warehouseId:2,openingAmount:'0'})});assert.equal(r.status,200,await r.clone().text());const shift=(await r.json()).data;
  assert.equal((await choose(1,3)).status,409);
  const disable=await fetch(bases[0]+'/api/warehouses',{method:'PATCH',headers:headers(1),body:JSON.stringify({id:2,isActive:false})});assert.equal(disable.status,409);
  const key=crypto.randomUUID(),pos={orderType:'POS',posRequestKey:key,paymentMethod:'CASH',warehouseId:2,posShiftId:shift.id,discountTotal:0,grandTotal:10,items:[{productId:1,quantity:1,unitPrice:10,productName:'Ürün',sku:'shared'}]};
  const online={orderType:'ONLINE_B2C',paymentMethod:'EFT_HAVALE',customerName:'Test',customerEmail:'buyer@example.test',items:[{productId:1,productName:'Ürün',sku:'shared',unitPrice:10,quantity:1,totalPrice:10}],subtotal:10,grandTotal:10,taxTotal:2};
  const [p,o]=await Promise.all([fetch(bases[0]+'/api/pos/sale',{method:'POST',headers:posHeaders,body:JSON.stringify({action:'PREPARE',payload:pos})}),fetch(bases[1]+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(online)})]);
  assert.equal(o.status,200,await o.clone().text());const order=(await o.json()).data.order;
  assert.ok([200,409].includes(p.status),await p.clone().text());
  const inv=db.prepare('SELECT physical_qty,reserved_qty FROM inventory WHERE warehouse_id=2 AND product_id=1').get();assert.deepEqual(inv,{physical_qty:1,reserved_qty:1});
  const holds=db.prepare("SELECT warehouse_id,reference_type FROM inventory_reservations WHERE status='ACTIVE'").all();assert.equal(holds.length,1);assert.equal(holds[0].warehouse_id,2);
  if(p.status===200)assert.equal(order.status,'BACKORDER');else assert.equal(order.status,'PENDING');
  assert.equal(db.prepare('SELECT physical_qty FROM inventory WHERE warehouse_id=3').get().physical_qty,25);
  products=await (await fetch(bases[0]+'/api/products')).json();assert.equal(products.data.find(x=>x.id===1).totalStock,0);
  r=await fetch(bases[0]+'/api/warehouses?id=2',{method:'DELETE',headers:headers(1)});assert.equal(r.status,409);
 }finally{for(const s of servers)if(s.exitCode===null){s.kill('SIGTERM');await new Promise(r=>s.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
