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
test('İzole standalone: uygulama, SQLite, yükleme ve dağıtım kontrolü', {timeout:90000},async()=>{
 const source=path.resolve('.next/standalone'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'standalone-tracing-')),app=path.join(dir,'app'),file=path.join(dir,'data','live.db'),backup=path.join(dir,'backup.db');let db,server,relativeServer;
 try{
  assert.ok(fs.existsSync(path.join(source,'server.js')),'Önce npm run build çalıştırın');
  for(const omitted of ['hosting','tests','docs','serpilen-hosting-prebuilt.zip','data'])assert.equal(fs.existsSync(path.join(source,omitted)),false,`${omitted} dağıtımda bulunmamalı`);
  for(const required of ['.next/static','drizzle-sqlite/0030_refund_replay_guards.sql','drizzle-sqlite/meta/_journal.json','node_modules/better-sqlite3/build/Release/better_sqlite3.node'])assert.ok(fs.existsSync(path.join(source,required)),required);
  fs.cpSync(source,app,{recursive:true,verbatimSymlinks:true});
  const native=path.resolve('hosting/better_sqlite3-linux-x64-glibc228.node');for(const target of ['node_modules/better-sqlite3/build/Release/better_sqlite3.node','node_modules/better-sqlite3/prebuilds/linux-x64.node'])fs.copyFileSync(native,path.join(app,target));
  const migrated=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env:{...process.env,DATABASE_URL:`sqlite:${file}`},encoding:'utf8'});assert.equal(migrated.status,0,migrated.stderr);
  db=new Database(file);db.exec("INSERT INTO categories(id,name,slug) VALUES(1,'İplik','iplik'); INSERT INTO warehouses(id,name,code) VALUES(5,'Ortak','O'); INSERT INTO app_settings(key,value) VALUES('sales.shared_warehouse_id','5'); INSERT INTO users(id,name,email,password_hash,role) VALUES(1,'Yönetici','admin@test.invalid','x','SUPER_ADMIN'); INSERT INTO products(id,name,slug,sku,category_id,has_variants,retail_price) VALUES(1,'Ürün','urun','sku',1,1,10); INSERT INTO product_variants(id,product_id,sku,color_name,retail_price) VALUES(1,1,'variant','Mavi',10); INSERT INTO inventory(warehouse_id,product_id,variant_id,physical_qty,reserved_qty) VALUES(5,1,1,4,0)");
  const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(1,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);
  const checker=path.resolve('hosting/varyant-deploy-check.cjs');for(const mode of ['inspect','backup','check']){const result=spawnSync(process.execPath,[checker,mode,file,mode==='inspect'?'-':backup,app],{encoding:'utf8'});assert.equal(result.status,0,`${mode}: ${result.stderr}`);}
  const p=await port();server=spawn(process.execPath,[path.join(app,'server.js')],{cwd:app,env:{...process.env,DATABASE_URL:`sqlite:${file}`,PORT:String(p),HOSTNAME:'127.0.0.1',NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${p}`;let ready=false;
  for(let i=0;i<100;i++){try{const r=await fetch(base+'/api/health');if(r.ok){assert.equal((await r.json()).status,'HEALTHY');ready=true;break;}}catch{}await delay(100);}assert.ok(ready,'Standalone sunucu başlamadı');
  const page=await fetch(base+'/urunler');assert.equal(page.status,200);const html=await page.text();const staticAsset=html.match(/\/_next\/static\/[^"? ]+\.js/);assert.ok(staticAsset);assert.equal((await fetch(base+staticAsset[0])).status,200);
  const headers={Authorization:`Bearer ${token}`};const inventory=await fetch(base+'/api/inventory',{headers});assert.equal(inventory.status,200);const data=await inventory.json();assert.equal(data.salesWarehouseId,5);assert.equal(data.inventory.find(x=>x.variantId===1).physicalQty,4);
  const payload=Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);const form=new FormData();form.append('file',new Blob([payload],{type:'image/png'}),'example.png');const upload=await fetch(base+'/api/uploads',{method:'POST',headers,body:form});assert.equal(upload.status,200,await upload.clone().text());const url=(await upload.json()).data.url;
  const saved=path.join(path.dirname(file),'uploads','products',path.basename(url));assert.deepEqual(fs.readFileSync(saved),payload);const downloaded=await fetch(base+url);assert.equal(downloaded.status,200);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),payload);assert.equal(fs.existsSync(path.join(app,'data')),false);assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
  // The compiled bundle must resolve a relative DATABASE_URL after standalone changes cwd.
  const relativeFile=path.join(app,'runtime-relative','other.db');const migration2=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env:{...process.env,DATABASE_URL:`sqlite:${relativeFile}`},encoding:'utf8'});assert.equal(migration2.status,0,migration2.stderr);
  const db2=new Database(relativeFile);db2.exec("INSERT INTO categories(id,name,slug) VALUES(1,'Farklı','farkli'); INSERT INTO warehouses(id,name,code) VALUES(6,'İkinci','I'); INSERT INTO app_settings(key,value) VALUES('sales.shared_warehouse_id','6'); INSERT INTO users(id,name,email,password_hash,role) VALUES(1,'Yönetici','relative@test.invalid','x','SUPER_ADMIN')");db2.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(1,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);db2.close();
  const p2=await port();relativeServer=spawn(process.execPath,[path.join(app,'server.js')],{cwd:dir,env:{...process.env,DATABASE_URL:'sqlite:./runtime-relative/other.db',PORT:String(p2),HOSTNAME:'127.0.0.1',NODE_ENV:'production'},stdio:'ignore'});const relativeBase=`http://127.0.0.1:${p2}`;let relativeReady=false;
  for(let i=0;i<100;i++){try{const r=await fetch(relativeBase+'/api/inventory',{headers});if(r.ok){assert.equal((await r.json()).salesWarehouseId,6);relativeReady=true;break;}}catch{}await delay(100);}assert.ok(relativeReady,'Göreli SQLite yolu standalone içinde açılamadı');assert.equal(fs.existsSync(path.join(dir,'runtime-relative','other.db')),false);

 }finally{for(const process of [server,relativeServer])if(process&&process.exitCode===null){process.kill('SIGTERM');await new Promise(r=>process.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
