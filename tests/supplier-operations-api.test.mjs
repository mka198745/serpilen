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
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('mal kabul ve tedarikçiye iade: atomiklik, yetki, tekrar, yarış ve puan', {timeout:90000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'supplier-ops-')),file=path.join(dir,'db'),env={...process.env,DATABASE_URL:`sqlite:${file}`},servers=[];let db;
 try {
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);
  db=new Database(file);db.pragma('foreign_keys=ON');
  db.exec(`INSERT INTO categories(id,name,slug) VALUES(1,'Kategori','kategori'); INSERT INTO warehouses(id,name,code) VALUES(2,'Depo','D');
  INSERT INTO users(id,name,email,password_hash,role) VALUES(1,'Admin','a@s.test','x','SUPER_ADMIN'),(2,'Kasiyer','c@s.test','x','CASHIER');
  INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(1,'Ürün','urun','urun',1,10),(2,'İkinci','ikinci','ikinci',1,10);
  INSERT INTO app_settings(key,value) VALUES('site.checkout.eft_iban','TR330006100519786457841326'),('site.checkout.eft_account_name','Test account'),('site.cart.shipping_fee','0');
  INSERT INTO suppliers(id,name,payment_terms) VALUES(1,'A','60 Gün Vade'),(2,'B','30 Gün Vade'),(3,'Eski','30 Gün Vade');
  INSERT INTO purchase_orders(id,po_number,supplier_id,warehouse_id,status,expected_date,created_at) VALUES(900,'OLD1',3,2,'RECEIVED','2020-01-01',1577836800),(901,'OLD2',3,2,'RECEIVED','2020-01-01',1577836800),(902,'OLD3',3,2,'RECEIVED','2020-01-01',1577836800);
  INSERT INTO purchase_order_items(id,purchase_order_id,product_id,quantity,received_qty,unit_cost,total_cost) VALUES(900,900,2,1,1,1,1),(901,901,2,1,1,1,1),(902,902,2,1,1,1,1);
  INSERT INTO goods_receipts(id,receipt_number,purchase_order_id,warehouse_id,created_at) VALUES(900,'OLD-R1',900,2,1577836801),(901,'OLD-R2',901,2,1577836801),(902,'OLD-R3',902,2,1577836801);
  INSERT INTO goods_receipt_items(receipt_id,purchase_order_item_id,product_id,qty) VALUES(900,900,2,1),(901,901,2,1),(902,902,2,1);`);
  const tokens={};for(const id of [1,2]){const t=crypto.randomBytes(32).toString('hex');tokens[id]=t;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(t).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  const bases=[];for(let i=0;i<2;i++){const p=await port();const server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(p),NODE_ENV:'production'},stdio:'ignore'});servers.push(server);const base=`http://127.0.0.1:${p}`;bases.push(base);let ready=false;for(let j=0;j<100;j++){try{await fetch(base+'/api/health');ready=true;break;}catch{await delay(100)}}assert.ok(ready);}
  const headers=(id=1)=>({Authorization:`Bearer ${tokens[id]}`,'Content-Type':'application/json'});
  const post=(body,server=0,id=1,extra={})=>fetch(bases[server]+'/api/suppliers',{method:'POST',headers:{...headers(id),...extra},body:JSON.stringify(body)});
  const makePO=async()=>{const r=await post({action:'CREATE_PO',supplierId:1,warehouseId:2,expectedDate:'2099-01-01',items:[{productId:1,quantity:10,unitCost:2}]});assert.equal(r.status,200,await r.clone().text());const po=(await r.json()).data;return {po,item:db.prepare('SELECT id FROM purchase_order_items WHERE purchase_order_id=?').get(po.id).id};};
  const a=await makePO(),b=await makePO(),c=await makePO();
  const command=(po,item,qty)=>({action:'RECEIVE_GOODS',purchaseOrderId:po.id,requestKey:crypto.randomUUID(),lines:[{purchaseOrderItemId:item,qty}]});
  let cmd=command(a.po,b.item,2);let r=await post(cmd);assert.equal(r.status,409,await r.clone().text());assert.equal(db.prepare('SELECT count(*) n FROM goods_receipts WHERE purchase_order_id IN (?,?,?)').get(a.po.id,b.po.id,c.po.id).n,0);
  cmd=command(a.po,a.item,6);assert.equal((await post(cmd,0,2)).status,403);assert.equal((await post(cmd,0,1,{Origin:'https://evil.test'})).status,403);
  let pair=await Promise.all([post(cmd,0),post(cmd,1)]);assert.deepEqual(pair.map(x=>x.status),[200,200]);let data=await pair[0].json();const firstReceipt=data.data.receipt.id;assert.equal((await pair[1].json()).data.receipt.id,firstReceipt);assert.equal(db.prepare('SELECT physical_qty FROM inventory WHERE warehouse_id=2 AND product_id=1').get().physical_qty,6);
  r=await post({...cmd,lines:[{purchaseOrderItemId:a.item,qty:5}]});assert.equal(r.status,409);
  r=await post(command(a.po,a.item,5));assert.equal(r.status,409);assert.equal(db.prepare('SELECT received_qty FROM purchase_order_items WHERE id=?').get(a.item).received_qty,6);
  // Fault after stock mutation must roll back all rows.
  db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON goods_receipt_items BEGIN SELECT RAISE(ABORT,'test'); END");r=await post(command(a.po,a.item,4));assert.equal(r.status,500);assert.equal(db.prepare('SELECT physical_qty FROM inventory').get().physical_qty,6);assert.equal(db.prepare('SELECT count(*) n FROM goods_receipts WHERE purchase_order_id=?').get(a.po.id).n,1);db.exec('DROP TRIGGER fail_receipt');
  r=await post(command(a.po,a.item,4));assert.equal(r.status,200,await r.clone().text());
  for(const x of [b,c]){r=await post(command(x.po,x.item,10));assert.equal(r.status,200,await r.clone().text());}
  let report=await (await fetch(bases[0]+'/api/suppliers',{headers:headers()})).json();assert.equal(report.suppliers.find(x=>x.id===1).rating,5);const old=report.suppliers.find(x=>x.id===3);assert.equal(old.rating,null);assert.ok(old.ratingDetails.missing.some(x=>x.includes('İade geçmişi')));
  const ri=db.prepare('SELECT id FROM goods_receipt_items WHERE receipt_id=?').get(firstReceipt).id;
  const ret=(qty,key=crypto.randomUUID())=>({action:'RETURN_TO_SUPPLIER',receiptId:firstReceipt,requestKey:key,reason:'Hasarlı',lines:[{receiptItemId:ri,qty}]});
  db.prepare('UPDATE inventory SET reserved_qty=29 WHERE warehouse_id=2 AND product_id=1').run();r=await post(ret(2));assert.equal(r.status,409,await r.clone().text());assert.equal(db.prepare('SELECT count(*) n FROM supplier_returns').get().n,0);db.prepare('UPDATE inventory SET reserved_qty=0').run();
  db.exec("CREATE TRIGGER fail_return BEFORE INSERT ON supplier_return_items BEGIN SELECT RAISE(ABORT,'test'); END");r=await post(ret(2));assert.equal(r.status,500);assert.equal(db.prepare('SELECT physical_qty FROM inventory').get().physical_qty,30);assert.equal(db.prepare('SELECT count(*) n FROM supplier_returns').get().n,0);db.exec('DROP TRIGGER fail_return');
  cmd=ret(3);pair=await Promise.all([post(cmd,0),post(cmd,1)]);assert.deepEqual(pair.map(x=>x.status),[200,200]);assert.equal((await pair[0].json()).data.id,(await pair[1].json()).data.id);assert.equal(db.prepare('SELECT physical_qty FROM inventory').get().physical_qty,27);
  pair=await Promise.all([post(ret(3),0),post(ret(3),1)]);assert.deepEqual(pair.map(x=>x.status).sort(),[200,409]);assert.equal(db.prepare('SELECT SUM(qty) n FROM supplier_return_items').get().n,6);assert.equal(db.prepare('SELECT physical_qty FROM inventory').get().physical_qty,24);
  report=await (await fetch(bases[0]+'/api/suppliers',{headers:headers()})).json();assert.equal(report.suppliers.find(x=>x.id===1).rating,4.8);assert.equal(report.receipts.find(x=>x.id===firstReceipt).items[0].returnedQty,6);
  // A resolver must either observe a commit or fence every delayed retry under the same SQLite lock.
  const cReceipt=db.prepare('SELECT id FROM goods_receipts WHERE purchase_order_id=?').get(c.po.id).id;
  const cItem=db.prepare('SELECT id FROM goods_receipt_items WHERE receipt_id=?').get(cReceipt).id;
  const delayed={action:'RETURN_TO_SUPPLIER',receiptId:cReceipt,requestKey:crypto.randomUUID(),reason:'Kontrol',lines:[{receiptItemId:cItem,qty:1}]};
  const [late,resolve]=await Promise.all([post(delayed,0),post({action:'FENCE_PURCHASING',requestKey:delayed.requestKey},1)]);assert.equal(resolve.status,200);const resolution=(await resolve.json()).data;
  if(resolution.status==='fenced'){assert.equal(late.status,409);assert.equal((await post(delayed)).status,409);}else {assert.equal(resolution.status,'completed');assert.equal(late.status,200);assert.equal((await post(delayed)).status,200);}
  assert.ok([2,3].includes(db.prepare("SELECT count(*) n FROM inventory_ledger WHERE reference_type='SUPPLIER_RETURN'").get().n));
  // One last physical unit: a supplier return races an online payment hold.
  r=await post({action:'CREATE_PO',supplierId:1,warehouseId:2,expectedDate:'2099-01-01',items:[{productId:2,quantity:1,unitCost:1}]});assert.equal(r.status,200,await r.clone().text());const po2=(await r.json()).data;const item2=db.prepare('SELECT id FROM purchase_order_items WHERE purchase_order_id=?').get(po2.id).id;
  r=await post(command(po2,item2,1));assert.equal(r.status,200,await r.clone().text());const receipt2=(await r.json()).data.receipt.id;const ri2=db.prepare('SELECT id FROM goods_receipt_items WHERE receipt_id=?').get(receipt2).id;
  db.exec("INSERT INTO app_settings(key,value) VALUES('sales.shared_warehouse_id','2')");
  const supplierReturn={action:'RETURN_TO_SUPPLIER',receiptId:receipt2,requestKey:crypto.randomUUID(),reason:'Hasar',lines:[{receiptItemId:ri2,qty:1}]};
  const online={orderType:'ONLINE_B2C',paymentMethod:'EFT_HAVALE',customerName:'Test',customerEmail:'buyer@example.test',items:[{productId:2,productName:'İkinci',sku:'ikinci',unitPrice:10,quantity:1,totalPrice:10}],subtotal:10,grandTotal:10,taxTotal:2};
  const [supplierRes,onlineRes]=await Promise.all([post(supplierReturn,0),fetch(bases[1]+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(online)})]);
  assert.equal(onlineRes.status,200,await onlineRes.clone().text());const onlineOrder=(await onlineRes.json()).data.order;assert.ok([200,409].includes(supplierRes.status),await supplierRes.clone().text());
  const afterRace=db.prepare('SELECT physical_qty,reserved_qty FROM inventory WHERE warehouse_id=2 AND product_id=2').get();
  if(supplierRes.status===200){assert.deepEqual(afterRace,{physical_qty:0,reserved_qty:0});assert.equal(onlineOrder.status,'BACKORDER');}
  else {assert.deepEqual(afterRace,{physical_qty:1,reserved_qty:1});assert.equal(onlineOrder.status,'PENDING');}
  assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
 } finally {for(const s of servers)if(s.exitCode===null){s.kill('SIGTERM');await new Promise(r=>s.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
