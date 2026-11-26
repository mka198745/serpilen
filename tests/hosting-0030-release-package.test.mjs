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
import {useHistorical0029} from './helpers/sqlite-0029-fixture.mjs';
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('0030 dağıtım ZIP: bağımsız yedek, atomik geçiş ve yeni uygulama provası', {timeout:90000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'release-0030-')),file=path.join(dir,'live.db'),backup=path.join(dir,'backup.db');let db,server;
 try{
  const archive=path.resolve('hosting/serpilen-siparis-varyant-0030.zip');let r=spawnSync('unzip',['-q',archive,'-d',dir],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  const root=path.join(dir,'serpilen'),app=path.join(root,'.next/standalone'),checker=path.join(root,'migrate-0030.cjs');
  r=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env:{...process.env,DATABASE_URL:`sqlite:${file}`},encoding:'utf8'});assert.equal(r.status,0,r.stderr);db=new Database(file);useHistorical0029(db);
  db.exec("INSERT INTO categories(id,name,slug) VALUES(1,'K','k'); INSERT INTO warehouses(id,name,code) VALUES(5,'Ortak','O'); INSERT INTO app_settings(key,value) VALUES('sales.shared_warehouse_id','5'); INSERT INTO users(id,name,email,password_hash,role) VALUES(1,'Yönetici','y@test.invalid','x','SUPER_ADMIN'); INSERT INTO products(id,name,slug,sku,category_id,has_variants,retail_price) VALUES(1,'Ürün','urun','u',1,1,10); INSERT INTO product_variants(id,product_id,sku,color_name,retail_price) VALUES(1,1,'v1','Mavi',10); INSERT INTO orders(id,order_number,order_type,customer_name,status,payment_status,payment_method,grand_total) VALUES(1,'O-1','ONLINE_B2C','M','DELIVERED','PAID','EFT_HAVALE',20); INSERT INTO order_items(order_id,product_id,variant_id,product_name,sku,unit_price,quantity,total_price) VALUES(1,1,1,'Ürün','v1',10,2,20); INSERT INTO inventory_ledger(transaction_type,warehouse_id,product_id,variant_id,quantity,reference_type,reference_id) VALUES('SALE',5,1,1,-2,'ORDER','O-1'); INSERT INTO order_discount_claims(order_id,kind,target_id) VALUES(1,'COVERAGE',0)");
  const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(1,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);
  for(const mode of ['inspect','backup','apply']){r=spawnSync(process.execPath,[checker,mode,file,backup,app],{encoding:'utf8'});assert.equal(r.status,0,`${mode}: ${r.stderr}`);}
  assert.equal(db.prepare("SELECT count(*) n FROM __migrations WHERE tag='0030_refund_replay_guards'").get().n,1);const saved=new Database(backup,{readonly:true});assert.equal(saved.prepare("SELECT count(*) n FROM __migrations WHERE tag='0030_refund_replay_guards'").get().n,0);assert.equal(saved.pragma('integrity_check',{simple:true}),'ok');saved.close();
  const p=await port();server=spawn(process.execPath,[path.join(app,'server.js')],{cwd:app,env:{...process.env,DATABASE_URL:`sqlite:${file}`,PORT:String(p),HOSTNAME:'127.0.0.1',NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${p}`;let ready=false;for(let i=0;i<100;i++){try{const res=await fetch(base+'/api/health');if(res.ok){assert.equal((await res.json()).status,'HEALTHY');ready=true;break;}}catch{}await delay(100)}assert.ok(ready);
  for(const page of ['/','/urunler'])assert.equal((await fetch(base+page)).status,200);
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  let response=await fetch(base+'/api/product-variant-edit?id=1',{headers});assert.equal(response.status,200,await response.clone().text());const v=(await response.json()).data;assert.equal(v.variants[0].physicalQty,0);
  const variants=v.variants.map(({id,colorName,colorHex,size,length,buyPrice,retailPrice,sku,barcode,imageUrl})=>({id,colorName,colorHex,size,length,buyPrice,retailPrice,sku,barcode,imageUrl,physicalQty:5}));response=await fetch(base+'/api/product-variant-edit',{method:'PATCH',headers,body:JSON.stringify({productId:1,warehouseId:5,fingerprint:v.fingerprint,physicalConfirmed:true,variants})});assert.equal(response.status,200,await response.clone().text());
  response=await fetch(base+'/api/order-deletion?kind=order&id=1',{headers});assert.equal(response.status,200,await response.clone().text());const deletion=(await response.json()).data;assert.equal(deletion.stocks[0].delta,2);
  response=await fetch(base+'/api/order-deletion',{method:'DELETE',headers,body:JSON.stringify({kind:'order',id:1,fingerprint:deletion.fingerprint,physicalConfirmed:true,cascadeConfirmed:false,rightsConfirmed:false,legacyConfirmed:false})});assert.equal(response.status,200,await response.clone().text());
  assert.equal(db.prepare('SELECT physical_qty FROM inventory WHERE product_id=1 AND variant_id=1').get().physical_qty,7);assert.equal(db.prepare('SELECT count(*) n FROM orders WHERE id=1').get().n,0);assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
