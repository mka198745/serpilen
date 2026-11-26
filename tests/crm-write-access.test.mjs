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
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('CRM yazmaları gerçek Bearer ister ve yazma sırasında güncel rolü denetler', {timeout:60000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-write-access-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try{
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);db=new Database(file);
  db.exec("INSERT INTO customers(id,name,phone,email) VALUES(1,'Bir','5551111111','bir@example.test'),(2,'İki','5552222222','iki@example.test')");
  const tokens={},ids={};for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER']){const id=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(role,`${role}@example.test`,'hash',role).lastInsertRowid;ids[role]=id;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  db.prepare("INSERT INTO crm_customer_notes(id,customer_id,body,created_by_id,created_by_name) VALUES(1,1,'Özel not',?,'Personel')").run(ids.SUPER_ADMIN);
  const port=await freePort();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${port}`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/crm/customers');ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const get=async url=>(await fetch(base+url,{headers:{Authorization:`Bearer ${tokens.STORE_MANAGER}`}})).json();const detail1=await get('/api/crm/customers/1'),detail2=await get('/api/crm/customers/2');
  const inputs=[
   ['/api/crm/customers','POST',{name:'Yeni',phone:'5553333333',email:'',city:'',address:'',companyName:''}],
   ['/api/crm/customers/1','PATCH',{name:'Değişik',phone:'5551111111',email:'bir@example.test',city:'',address:'',companyName:'',editVersion:detail1.data.editVersion}],
   ['/api/crm/customers/1/notes','POST',{body:'Yeni not'}],
   ['/api/crm/customers/1/notes/1','PATCH',{body:'Değişik not',expectedRevision:1}],
   ['/api/crm/customers/1/tags','POST',{action:'ADD',name:'Özel etiket'}],
   ['/api/crm/customers/1/duplicate-review','POST',{targetId:2,status:'UNSURE',sourceVersion:detail1.data.editVersion,targetVersion:detail2.data.editVersion,expectedRevision:null}],
  ];
  const tables=['customers','crm_customer_notes','crm_note_edit_state','crm_tags','crm_customer_tags','crm_duplicate_reviews'];const snapshot=()=>Object.fromEntries(tables.map(t=>[t,db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));const before=snapshot();
  const call=(url,method,body,headers)=>fetch(base+url,{method,headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  for(const [url,method,body] of inputs){
   for(const auth of ['Bearer forged',`Bearer ${tokens.CASHIER}`])assert.equal((await call(url,method,body,{Cookie:`ipek_session=${tokens.STORE_MANAGER}`,Authorization:auth})).status,403,url);
   assert.equal((await call(url,method,body,{Cookie:`ipek_session=${tokens.STORE_MANAGER}`,Origin:'https://attacker.example'})).status,403,url);
  }
  assert.deepEqual(snapshot(),before);
  const matrix=(write)=>db.prepare("INSERT INTO app_settings(key,value) VALUES('admin.role_matrix',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({STORE_MANAGER:{crm:true,crmWrite:write}}));
  // Request body remains open while the permission is withdrawn, then finishes.
  for(const [url,method,body] of inputs){
   matrix(true);let controller;const stream=new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode(' '));}});
   const pending=fetch(base+url,{method,headers:{Authorization:`Bearer ${tokens.STORE_MANAGER}`,'Content-Type':'application/json'},body:stream,duplex:'half'});await delay(180);matrix(false);controller.enqueue(new TextEncoder().encode(JSON.stringify(body)));controller.close();assert.equal((await pending).status,403,url);assert.deepEqual(snapshot(),before);
  }
  matrix(true);let controller;const stream=new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode(' '));}});const pending=fetch(base+inputs[2][0],{method:'POST',headers:{Authorization:`Bearer ${tokens.STORE_MANAGER}`,'Content-Type':'application/json'},body:stream,duplex:'half'});await delay(180);db.prepare('UPDATE users SET is_active=0 WHERE id=?').run(ids.STORE_MANAGER);controller.enqueue(new TextEncoder().encode(JSON.stringify(inputs[2][2])));controller.close();assert.equal((await pending).status,403);assert.deepEqual(snapshot(),before);db.prepare('UPDATE users SET is_active=1 WHERE id=?').run(ids.STORE_MANAGER);
  // Normal same-origin cookie and originless valid Bearer workflows remain functional.
  const success=await call(inputs[2][0],inputs[2][1],inputs[2][2],{Cookie:`ipek_session=${tokens.STORE_MANAGER}`,Origin:base});assert.equal(success.status,201);const valid=await call(inputs[4][0],inputs[4][1],inputs[4][2],{Authorization:`Bearer ${tokens.STORE_MANAGER}`});assert.equal(valid.status,200);
  const audit=db.prepare("SELECT details FROM audit_logs WHERE action IN ('CRM_NOTE_CREATED','CRM_TAG_ADDED')").all();assert.doesNotMatch(JSON.stringify(audit),/Yeni not|Özel etiket|5551111111|bir@example/);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
