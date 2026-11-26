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

test('Dağıtılacak ZIP gerçek standalone ve 0029 veritabanı ile çalışır', {timeout:60000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'revizyon-package-'));const file=path.join(dir,'test.db');let db,server;
 try{
  const archive=path.resolve('hosting/serpilen-revizyon-9e0b357.zip');const unzip=spawnSync('unzip',['-q',archive,'-d',dir],{encoding:'utf8'});assert.equal(unzip.status,0,unzip.stderr);
  const app=path.join(dir,'serpilen/.next/standalone'),checker=path.join(dir,'serpilen/revizyon-deploy-check.cjs');
  const env={...process.env,DATABASE_URL:`sqlite:${file}`};const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);
  db=new Database(file);db.exec("INSERT INTO categories(id,name,slug) VALUES(1,'Diğer','diger'); INSERT INTO warehouses(id,name,code) VALUES(5,'Ortak','ORTAK'); INSERT INTO app_settings(key,value) VALUES('sales.shared_warehouse_id','5')");
  const tokens={};for(const role of ['SUPER_ADMIN','STORE_MANAGER']){const id=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(role,role+'@example.test','hash',role).lastInsertRowid;tokens[role]=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(tokens[role]).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  const backup=path.join(dir,'backup.db');for(const mode of ['inspect','backup','check']){const r=spawnSync(process.execPath,[checker,mode,file,mode==='inspect'?'-':backup,app],{encoding:'utf8'});assert.equal(r.status,0,`${mode}: ${r.stderr}`);}
  const port=await freePort();server=spawn(process.execPath,[path.join(app,'server.js')],{cwd:app,env:{...env,PORT:String(port),HOSTNAME:'127.0.0.1',NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${port}`;let ready=false;for(let i=0;i<100;i++){try{const response=await fetch(base+'/api/health');if(response.ok){const data=await response.json();assert.equal(data.status,'HEALTHY');ready=true;break}}catch{}await delay(100)}assert.ok(ready);
  for(const page of ['/','/urunler'])assert.equal((await fetch(base+page)).status,200,page);
  const api=(url,role,method,body)=>fetch(base+url,{method,headers:{Authorization:`Bearer ${tokens[role]}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const product={name:'Revizyon Test',sku:'REVIZYON-TEST',categoryId:1,warehouseId:5,buyPrice:'30',retailPrice:'55',initialStock:0,technicalDetails:{size:'20 mm'},variants:[{colorName:'Siyah',initialStock:'8'},{colorName:'Kırmızı',initialStock:'3'}]};
  let response=await api('/api/products','SUPER_ADMIN','POST',product);assert.equal(response.status,200,await response.clone().text());const id=(await response.json()).data.id;
  const stocks=db.prepare('SELECT variant_id,physical_qty FROM inventory WHERE product_id=? ORDER BY variant_id').all(id);assert.equal(stocks.length,2);assert.equal(stocks.reduce((n,x)=>n+x.physical_qty,0),11);assert.ok(stocks.every(x=>x.variant_id!==null));
  assert.equal((await api('/api/products','STORE_MANAGER','DELETE',{id})).status,403);
  response=await api('/api/role-matrix','SUPER_ADMIN','POST',{matrix:{STORE_MANAGER:{catalog:true,productDelete:true}}});assert.equal(response.status,200);
  assert.equal((await api('/api/products','STORE_MANAGER','DELETE',{id})).status,409,'stok koruması');
  response=await api('/api/products','SUPER_ADMIN','POST',{...product,name:'Silinebilir Test',sku:'SILINEBILIR',variants:[{colorName:'Siyah',initialStock:'0'}]});assert.equal(response.status,200,await response.clone().text());const cleanId=(await response.json()).data.id;
  assert.equal((await api('/api/products','STORE_MANAGER','DELETE',{id:cleanId})).status,200);assert.equal(db.prepare('SELECT id FROM products WHERE id=?').get(cleanId),undefined);
  assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
