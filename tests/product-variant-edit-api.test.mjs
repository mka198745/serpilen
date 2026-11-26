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
test('Varyant API: kaynak, rol, oturum, stok ve iki sunucuda eşzamanlı kayıt', {timeout:60000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'variant-api-')),file=path.join(dir,'db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db;const servers=[];
 try{
  const m=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(m.status,0,m.stderr);db=new Database(file);
  db.exec("INSERT INTO categories(id,name,slug) VALUES(1,'K','k'); INSERT INTO warehouses(id,name,code) VALUES(1,'Ana','A'); INSERT INTO app_settings(key,value) VALUES('sales.shared_warehouse_id','1'); INSERT INTO users(id,name,email,password_hash,role) VALUES(1,'Yönetici','y@test.invalid','x','STORE_MANAGER'); INSERT INTO products(id,name,slug,sku,category_id,has_variants,retail_price) VALUES(1,'Ürün','urun','u',1,1,10); INSERT INTO product_variants(id,product_id,sku,color_name,retail_price) VALUES(1,1,'v1','Mavi',10)");
  const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(1,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);
  const bases=[];for(let i=0;i<2;i++){const p=await port(),s=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(p),NODE_ENV:'production'},stdio:'ignore'});servers.push(s);bases.push(`http://127.0.0.1:${p}`);let ready=false;for(let j=0;j<100;j++){try{await fetch(bases[i]+'/api/health');ready=true;break}catch{await delay(100)}}assert.ok(ready);}
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'},get=i=>fetch(bases[i]+'/api/product-variant-edit?id=1',{headers}),patch=(i,b,extra={})=>fetch(bases[i]+'/api/product-variant-edit',{method:'PATCH',headers:{...headers,...extra},body:JSON.stringify(b)});
  const matrix=enabled=>db.prepare("INSERT INTO app_settings(key,value) VALUES('admin.role_matrix',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({STORE_MANAGER:{catalog:enabled}}));matrix(false);assert.equal((await get(0)).status,403);matrix(true);
  let res=await get(0);assert.equal(res.status,200,await res.clone().text());const p=(await res.json()).data;
  const variants=p.variants.map(({id,colorName,colorHex,size,length,buyPrice,retailPrice,sku,barcode,imageUrl})=>({id,colorName,colorHex,size,length,buyPrice,retailPrice,sku,barcode,imageUrl,physicalQty:5}));const body={productId:1,warehouseId:1,fingerprint:p.fingerprint,physicalConfirmed:true,variants};
  assert.equal((await patch(0,body,{origin:'https://attacker.test'})).status,403);assert.equal((await patch(0,{...body,physicalConfirmed:false})).status,422);
  const invalid=structuredClone(body);invalid.variants[0].imageUrl='https://127.0.0.1/secret';assert.equal((await patch(0,invalid)).status,422);
  db.exec('BEGIN IMMEDIATE');matrix(false);const pending=patch(0,body);await delay(150);db.exec('COMMIT');assert.equal((await pending).status,403);matrix(true);
  db.exec('BEGIN IMMEDIATE; UPDATE admin_sessions SET revoked_at=unixepoch() WHERE user_id=1');const revoked=patch(0,body);await delay(150);db.exec('COMMIT');assert.ok([401,403].includes((await revoked).status));db.exec('UPDATE admin_sessions SET revoked_at=NULL WHERE user_id=1');
  const results=await Promise.all([patch(0,body),patch(1,body)]);assert.deepEqual(results.map(r=>r.status).sort((a,b)=>a-b),[200,409]);assert.equal(db.prepare('SELECT physical_qty FROM inventory WHERE product_id=1 AND variant_id=1').get().physical_qty,5);assert.equal(db.prepare("SELECT count(*) n FROM inventory_ledger WHERE reference_type='VARIANT_EDIT'").get().n,1);
  db.exec("INSERT INTO product_variants(id,product_id,sku,color_name,buy_price,retail_price) VALUES(2,1,'v2','Kırmızı',8.25,23.50)");
  const parentChange=await fetch(bases[0]+'/api/products',{method:'PATCH',headers,body:JSON.stringify({id:1,buyPrice:'4.00',retailPrice:'17.00'})});assert.equal(parentChange.status,200,await parentChange.clone().text());
  assert.deepEqual(db.prepare('SELECT buy_price,retail_price FROM product_variants WHERE id=2').get(),{buy_price:4,retail_price:17});
  res=await get(0);const singlePreview=(await res.json()).data;const target=singlePreview.variants[1];const {id,colorName,colorHex,size,length,buyPrice,retailPrice,sku,barcode,imageUrl,physicalQty}=target;
  const single={productId:1,warehouseId:1,variantId:2,fingerprint:singlePreview.fingerprint,physicalConfirmed:false,variants:[{id,colorName:'Bordo',colorHex,size,length,buyPrice,retailPrice,sku,barcode,imageUrl,physicalQty}]};
  assert.equal((await patch(0,{...single,variantId:1})).status,409);assert.equal((await patch(0,single)).status,200);assert.equal(db.prepare('SELECT color_name FROM product_variants WHERE id=1').get().color_name,'Mavi');assert.equal(db.prepare('SELECT color_name FROM product_variants WHERE id=2').get().color_name,'Bordo');assert.deepEqual(db.prepare('SELECT buy_price,retail_price FROM product_variants WHERE id=2').get(),{buy_price:4,retail_price:17});assert.deepEqual(db.prepare('SELECT buy_price,retail_price FROM products WHERE id=1').get(),{buy_price:4,retail_price:17});assert.equal((await patch(0,single)).status,409);
  const cookieHeaders={cookie:`ipek_session=${token}`,'Content-Type':'application/json',origin:bases[0]};res=await fetch(bases[0]+'/api/product-variant-edit?id=1',{headers:cookieHeaders});assert.equal(res.status,200);const cp=(await res.json()).data;const cv=cp.variants.map(({id,colorName,colorHex,size,length,buyPrice,retailPrice,sku,barcode,imageUrl,physicalQty})=>({id,colorName,colorHex,size,length,buyPrice,retailPrice,sku,barcode,imageUrl,physicalQty}));cv[0].colorName='Yeşil';res=await fetch(bases[0]+'/api/product-variant-edit',{method:'PATCH',headers:cookieHeaders,body:JSON.stringify({productId:1,warehouseId:1,fingerprint:cp.fingerprint,physicalConfirmed:false,variants:cv})});assert.equal(res.status,200,await res.clone().text());
 }finally{for(const s of servers)s.kill('SIGTERM');db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
