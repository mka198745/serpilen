import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';

async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}

test('Profil ve not okumaları işlem içinde güncel yetki ve içeriksiz audit gerektirir', {timeout:40000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-profile-tx-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try{
  const m=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(m.status,0,m.stderr);db=new Database(file);
  db.exec("INSERT INTO customers(id,name,phone) VALUES(1,'Gizli Ad','5551234567'),(2,'Diğer','5551234568'); INSERT INTO crm_customer_notes(customer_id,body,created_by_id,created_by_name) VALUES(1,'Gizli not',1,'Personel')");
  const id=db.prepare("INSERT INTO users(name,email,password_hash,role,is_active) VALUES('Yönetici','staff@example.test','hash','STORE_MANAGER',1)").run().lastInsertRowid;
  const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);
  // Pause only immediately before the route's transaction starts, after the initial access gate.
  // This deterministic test hook is never part of the application or production build.
  const trigger=path.join(dir,'pause'),waiting=path.join(dir,'waiting'),release=path.join(dir,'release'),hook=path.join(dir,'hook.cjs');
  fs.writeFileSync(hook,`const D=require(${JSON.stringify(path.resolve('.next/standalone/node_modules/better-sqlite3'))}),fs=require('fs');const original=D.prototype.transaction;
  D.prototype.transaction=function(fn){const tx=original.call(this,fn);function wrap(...args){return tx(...args)};for(const k of ['deferred','exclusive','default'])wrap[k]=tx[k];wrap.immediate=(...args)=>{if(fs.existsSync(${JSON.stringify(trigger)})){fs.unlinkSync(${JSON.stringify(trigger)});fs.writeFileSync(${JSON.stringify(waiting)},'1');const end=Date.now()+6000;while(!fs.existsSync(${JSON.stringify(release)})&&Date.now()<end)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}return tx.immediate(...args)};return wrap};`);
  const port=await freePort();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production',NODE_OPTIONS:`--require=${hook}`},stdio:'ignore'});const base=`http://127.0.0.1:${port}`;
  let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/crm/customers');ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const get=endpoint=>fetch(base+endpoint,{headers:{Authorization:`Bearer ${token}`}});
  db.exec("INSERT INTO orders(id,order_number,customer_id,customer_name) VALUES(1,'ORDER-1',1,'Gizli Ad')");
  const count=()=>db.prepare("SELECT count(*) AS n FROM audit_logs WHERE action IN ('CRM_CUSTOMER_VIEW','CRM_NOTES_VIEW','CRM_ORDERS_VIEW','CRM_TIMELINE_VIEW','CRM_ORDER_ITEMS_VIEW','CRM_MERGE_PREVIEW','CRM_DUPLICATE_REVIEWS_VIEW','CRM_DUPLICATE_CANDIDATES')").get().n;
  for(const endpoint of ['/api/crm/customers/1','/api/crm/customers/1/notes','/api/crm/customers/1/orders','/api/crm/customers/1/timeline?actor=Personel','/api/crm/customers/1/orders/1/items','/api/crm/customers/1/merge-preview?target=2','/api/crm/customers/1/duplicate-reviews','/api/crm/customers/1/duplicate-candidates']){
   fs.rmSync(release,{force:true});fs.rmSync(waiting,{force:true});fs.writeFileSync(trigger,'1');const before=count();const pending=get(endpoint);
   for(let i=0;i<200&&!fs.existsSync(waiting);i++)await delay(10);assert.ok(fs.existsSync(waiting),'request passed first gate and reached transaction');
   db.prepare("INSERT INTO app_settings(key,value) VALUES('admin.role_matrix',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({STORE_MANAGER:(endpoint.includes('merge-preview')||endpoint.includes('duplicate-'))?{crm:true,crmWrite:false}:{crm:false}}));fs.writeFileSync(release,'1');
   const denied=await pending;assert.equal(denied.status,403);assert.match(denied.headers.get('cache-control'),/no-store/);assert.doesNotMatch(JSON.stringify(await denied.json()),/Gizli/);assert.equal(count(),before);
   db.prepare("UPDATE app_settings SET value=? WHERE key='admin.role_matrix'").run(JSON.stringify({STORE_MANAGER:{crm:true,crmWrite:true}}));
   const ok=await get(endpoint);assert.equal(ok.status,200);assert.equal(count(),before+1);
  }
  // An account deactivated between the gate and transaction must likewise be denied.
  fs.rmSync(release,{force:true});fs.rmSync(waiting,{force:true});fs.writeFileSync(trigger,'1');const before=count();const pending=get('/api/crm/customers/1');
  for(let i=0;i<200&&!fs.existsSync(waiting);i++)await delay(10);assert.ok(fs.existsSync(waiting));db.prepare('UPDATE users SET is_active=0 WHERE id=?').run(id);fs.writeFileSync(release,'1');assert.equal((await pending).status,403);assert.equal(count(),before);
  const logs=db.prepare("SELECT details FROM audit_logs WHERE action IN ('CRM_CUSTOMER_VIEW','CRM_NOTES_VIEW','CRM_ORDERS_VIEW','CRM_TIMELINE_VIEW','CRM_ORDER_ITEMS_VIEW')").all();assert.doesNotMatch(JSON.stringify(logs),/Gizli|5551234567|Personel|ORDER-1/);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
