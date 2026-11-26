import {testPosGrant} from './helpers/pos-grant.mjs';
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

test('Ana fiyat değişimleri bütün varyantlara atomik uygulanır, ilgisiz kayıt ve eski veriler korunur', {timeout:60000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'product-price-sync-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try{
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);db=new Database(file);db.pragma('foreign_keys = ON');
  db.exec(`INSERT INTO categories(id,name,slug) VALUES(1,'İplik','iplik'); INSERT INTO warehouses(id,name,code) VALUES(1,'Mağaza','M'); INSERT INTO app_settings(key,value) VALUES('sales.shared_warehouse_id','1'); INSERT INTO users(id,name,email,password_hash,role) VALUES(1,'Admin','a@test.invalid','x','SUPER_ADMIN');
  INSERT INTO products(id,name,slug,sku,category_id,has_variants,buy_price,retail_price,campaign_price) VALUES(1,'Ürün','urun','P1',1,1,10,20,18),(2,'Diğer','diger','P2',1,1,12,24,NULL),(3,'Tek','tek','P3',1,0,1,2,NULL);
  INSERT INTO product_variants(id,product_id,sku,barcode,color_name,buy_price,retail_price,is_active) VALUES(1,1,'V1','B1','Mavi',5,20,1),(2,1,'V2','B2','Siyah',6,30,0),(3,1,'V3','B3','Beyaz',NULL,40,1),(4,2,'V4','B4','Diğer',12,24,1);
  INSERT INTO inventory(warehouse_id,product_id,variant_id,physical_qty,reserved_qty) VALUES(1,1,1,4,0),(1,1,2,0,0);
  INSERT INTO product_images(product_id,url,sort_order,is_primary) VALUES(1,'https://example.test/old.jpg',0,1);
  INSERT INTO orders(id,order_number,order_type,customer_name,status,payment_status,payment_method,grand_total) VALUES(1,'OLD','ONLINE_B2C','M','PENDING','PENDING','EFT_HAVALE',20);
  INSERT INTO order_items(order_id,product_id,variant_id,product_name,sku,unit_price,quantity,total_price) VALUES(1,1,1,'Ürün','V1',20,1,20);`);
  const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(1,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);
  const p=await port();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(p),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${p}`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/products');ready=true;break;}catch{await delay(100);}}assert.ok(ready);
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};const patch=body=>fetch(base+'/api/products',{method:'PATCH',headers,body:JSON.stringify(body)});
  const parent=()=>db.prepare('SELECT name,buy_price,retail_price,campaign_price,image_url FROM products WHERE id=1').get();
  const rows=()=>db.prepare('SELECT id,buy_price,retail_price,is_active FROM product_variants WHERE product_id=1 ORDER BY id').all();
  const prices=()=>rows().map(x=>[x.buy_price,x.retail_price]);const before=prices(),stock=()=>db.prepare('SELECT * FROM inventory ORDER BY id').all(),initialStock=stock(),order=()=>db.prepare('SELECT unit_price,total_price FROM order_items WHERE order_id=1').get();
  assert.equal((await fetch(base+'/api/products',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:1,retailPrice:99})})).status,401);
  assert.equal((await patch({id:1,name:'Ürün yeni',buyPrice:'10.00',retailPrice:'20.00'})).status,200);assert.deepEqual(prices(),before);assert.equal(parent().name,'Ürün yeni');
  assert.equal((await patch({id:1,retailPrice:'50.25',expectedPrices:{retailPrice:'20.00'}})).status,200);assert.deepEqual(prices(),[[5,50.25],[6,50.25],[null,50.25]]);assert.equal(parent().campaign_price,18);
  const listed=(await (await fetch(base+'/api/products?scope=all-warehouses',{headers})).json()).data.find(x=>x.id===1);assert.deepEqual(listed.variants.map(v=>Number(v.retailPrice)),[50.25,50.25,50.25]);
  const barcode=await (await fetch(base+'/api/products?barcode=B1')).json();assert.equal(Number(barcode.data.retailPrice),50.25);assert.deepEqual(stock(),initialStock);assert.deepEqual(order(),{unit_price:20,total_price:20});
  const posHeaders={...headers,'X-Pos-Grant':testPosGrant(db,1,token)};const quote=price=>fetch(base+'/api/pos/quote',{method:'POST',headers:posHeaders,body:JSON.stringify({items:[{productId:1,variantId:1,quantity:1,unitPrice:price}],discountTotal:0})});
  assert.equal((await quote(20)).status,409);const freshQuote=await quote(50.25);assert.equal(freshQuote.status,200,await freshQuote.clone().text());assert.equal((await freshQuote.json()).data.lines[0].unitPrice,50.25);
  assert.equal((await patch({id:1,buyPrice:'4.50'})).status,200);assert.deepEqual(prices(),[[4.5,50.25],[4.5,50.25],[4.5,50.25]]);
  assert.equal((await patch({id:1,buyPrice:'0',retailPrice:'6'})).status,200);assert.deepEqual(prices(),[[0,6],[0,6],[0,6]]);assert.deepEqual(db.prepare('SELECT buy_price,retail_price FROM product_variants WHERE id=4').get(),{buy_price:12,retail_price:24});
  assert.equal((await patch({id:3,buyPrice:'2.5',retailPrice:'7'})).status,200);assert.deepEqual(prices(),[[0,6],[0,6],[0,6]]);
  const snapshot=()=>({parent:parent(),variants:rows(),gallery:db.prepare('SELECT url FROM product_images WHERE product_id=1 ORDER BY id').all(),stock:stock()});
  for(const value of ['',null,{},true,'-1','1.234','1e2','NaN','100000001']){const before=snapshot(),res=await patch({id:1,name:'Yazılmamalı',retailPrice:value,images:['https://example.test/new.jpg']});assert.equal(res.status,422,JSON.stringify(value));assert.deepEqual(snapshot(),before);}
  let state=snapshot();assert.equal((await patch({id:1,buyPrice:'1',expectedPrices:{buyPrice:'9'},name:'Değişmemeli'})).status,409);assert.deepEqual(snapshot(),state);
  assert.equal((await patch({id:1,buyPrice:'1',expectedPrices:{retailPrice:'6'}})).status,422);assert.deepEqual(snapshot(),state);
  assert.equal((await patch({id:1,brandId:999,retailPrice:'9',images:['https://example.test/new.jpg']})).status,422);assert.deepEqual(snapshot(),state);
  // Variant previews fingerprint price data; a parent change must invalidate a stale editor.
  const previous=(await (await fetch(base+'/api/product-variant-edit?id=1',{headers})).json()).data;const v=previous.variants[0];const {id,colorName,colorHex,size,length,buyPrice,retailPrice,sku,barcode:bc,imageUrl,physicalQty}=v;
  assert.equal((await patch({id:1,retailPrice:'9'})).status,200);const stale=await fetch(base+'/api/product-variant-edit',{method:'PATCH',headers,body:JSON.stringify({productId:1,warehouseId:1,variantId:1,fingerprint:previous.fingerprint,physicalConfirmed:false,variants:[{id,colorName:'Lacivert',colorHex,size,length,buyPrice,retailPrice,sku,barcode:bc,imageUrl,physicalQty}]})});assert.equal(stale.status,409);assert.equal(db.prepare('SELECT color_name FROM product_variants WHERE id=1').get().color_name,'Mavi');
  // A failure during any variant update must roll back parent, all variants and gallery.
  state=snapshot();db.exec("CREATE TRIGGER fail_price_update BEFORE UPDATE OF retail_price ON product_variants WHEN OLD.id=2 BEGIN SELECT RAISE(ABORT,'price test rollback'); END");
  assert.equal((await patch({id:1,retailPrice:'99',name:'Geri alınmalı',images:['https://example.test/new.jpg']})).status,500);assert.deepEqual(snapshot(),state);db.exec('DROP TRIGGER fail_price_update');
  // Two operators editing the same captured price cannot silently overwrite each other.
  const concurrent=await Promise.all([patch({id:1,retailPrice:'10',expectedPrices:{retailPrice:'9'}}),patch({id:1,retailPrice:'11',expectedPrices:{retailPrice:'9'}})]);assert.deepEqual(concurrent.map(r=>r.status).sort((a,b)=>a-b),[200,409]);const finalPrice=parent().retail_price;assert.ok([10,11].includes(finalPrice));assert.ok(rows().every(row=>row.retail_price===finalPrice));assert.deepEqual(stock(),initialStock);assert.deepEqual(order(),{unit_price:20,total_price:20});
  assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
