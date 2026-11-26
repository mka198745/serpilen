import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';

async function port() { const s=net.createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r)); const p=s.address().port; await new Promise(r=>s.close(r)); return p; }
test('tedarikçi silme geçmişi arşivler, yetkiyi denetler ve pasife sipariş açmaz', {timeout:60000}, async () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'supplier-delete-')), file=path.join(dir,'db'), env={...process.env,DATABASE_URL:`sqlite:${file}`}; let db,server;
 try {
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'}); assert.equal(migration.status,0,migration.stderr);
  db=new Database(file);
  db.exec(`INSERT INTO categories(id,name,slug) VALUES(1,'Kat','kat');
   INSERT INTO warehouses(id,name,code) VALUES(1,'Depo','DEP');
   INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(1,'Ürün','urun','urun',1,10);
   INSERT INTO users(id,name,email,password_hash,role) VALUES(1,'Admin','admin@s.test','x','SUPER_ADMIN'),(2,'Kasiyer','cashier@s.test','x','CASHIER');
   INSERT INTO suppliers(id,name) VALUES(1,'Boş'),(2,'Geçmişi olan'),(3,'Fırsatı olan');
   INSERT INTO purchase_orders(id,po_number,supplier_id,warehouse_id,status) VALUES(1,'PO1',2,1,'RECEIVED');
   INSERT INTO commercial_opportunities(opportunity_key,opportunity_type,title,source_module,related_supplier_id) VALUES('opp1','SUPPLIER_IMPROVEMENT','Test','suppliers',3);`);
  const tokens={}; for(const id of [1,2]) {const token=crypto.randomBytes(32).toString('hex');tokens[id]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  const p=await port();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(p),NODE_ENV:'production'},stdio:'ignore'}); const base=`http://127.0.0.1:${p}`;
  let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/health');ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const headers=id=>({Authorization:`Bearer ${tokens[id]}`,'Content-Type':'application/json'});
  const remove=(id,user=1,extra={})=>fetch(`${base}/api/suppliers?id=${id}`,{method:'DELETE',headers:{...headers(user),...extra}});
  assert.equal((await remove(1,2)).status,403);assert.equal((await remove(1,1,{Origin:'https://evil.test'})).status,403);
  let create=await fetch(base+'/api/suppliers',{method:'POST',headers:headers(1),body:JSON.stringify({action:'CREATE_SUPPLIER',name:'Puan denenmesi',rating:5})});assert.equal(create.status,422);create=await fetch(base+'/api/suppliers',{method:'POST',headers:headers(1),body:JSON.stringify({action:'CREATE_SUPPLIER',name:'Puan denenmesi'})});assert.equal(create.status,200);const created=(await create.json()).data;assert.equal(created.rating,null);
  let update=await fetch(base+'/api/suppliers',{method:'POST',headers:headers(1),body:JSON.stringify({action:'UPDATE_SUPPLIER',id:created.id,rating:5})});assert.equal(update.status,422);assert.equal(db.prepare('SELECT rating FROM suppliers WHERE id=?').get(created.id).rating,null);
  let res=await remove(created.id);assert.equal(res.status,200);
  res=await remove(1);assert.equal(res.status,200,await res.clone().text());assert.equal((await res.json()).mode,'deleted');assert.equal(db.prepare('SELECT * FROM suppliers WHERE id=1').get(),undefined);
  for(const id of [2,3]) {res=await remove(id);assert.equal(res.status,200,await res.clone().text());assert.equal((await res.json()).mode,'archived');assert.equal(db.prepare('SELECT is_active FROM suppliers WHERE id=?').get(id).is_active,0);}
  assert.equal(db.prepare('SELECT supplier_id FROM purchase_orders WHERE id=1').get().supplier_id,2);
  res=await fetch(base+'/api/suppliers');assert.equal(res.status,401);
  res=await fetch(base+'/api/suppliers',{headers:headers(1)});assert.deepEqual((await res.json()).suppliers,[]);
  res=await fetch(base+'/api/suppliers',{method:'POST',headers:headers(1),body:JSON.stringify({action:'CREATE_PO',supplierId:2,warehouseId:1,items:[{productId:1,quantity:1,unitCost:10}]})});assert.equal(res.status,409);
  assert.equal(db.prepare('SELECT count(*) n FROM audit_logs WHERE entity=\'Supplier\'').get().n,4);
 } finally { if(server && server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true}); }
});
