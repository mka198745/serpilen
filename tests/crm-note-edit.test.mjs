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

async function freePort() { const s=net.createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r)); const p=s.address().port; await new Promise(r=>s.close(r)); return p; }
test('Müşteri notu düzenleme: erişim, sürüm yarışı, kapsam ve denetim bütünlüğü', {timeout:60000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-note-edit-')), dbPath=path.join(dir,'db.sqlite'), env={...process.env,DATABASE_URL:`sqlite:${dbPath}`}; const servers=[]; let db;
 const migrate=()=>spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8',timeout:15000});
 try {
  let migration=migrate(); assert.equal(migration.status,0,migration.stderr); db=new Database(dbPath); db.pragma('foreign_keys=ON');
  // Simulate existing 0019 data and reapply the additive migration twice.
  db.exec("DROP TABLE crm_note_edit_state; DELETE FROM __migrations WHERE tag='0020_crm_note_edit_state'; INSERT INTO customers(id,name,phone) VALUES (1,'A','5551234567'),(2,'B','5557654321'); INSERT INTO crm_customer_notes(id,customer_id,body,created_by_id,created_by_name,created_at) VALUES (1,1,'İlk özel not',1,'Önceki',1700000000),(2,2,'Başka müşteri notu',1,'Önceki',1700000001)");
  migration=migrate();assert.equal(migration.status,0,migration.stderr); migration=migrate();assert.equal(migration.status,0,migration.stderr);
  assert.equal(db.prepare('SELECT body FROM crm_customer_notes WHERE id=1').get().body,'İlk özel not');assert.equal(db.prepare('SELECT COUNT(*) n FROM crm_note_edit_state').get().n,0);
  const tokens={};for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER','B2C_CUSTOMER']) {const id=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)').run(role,`${role}@example.test`,'hash',role).lastInsertRowid;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES (?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  const urls=[];for(let i=0;i<2;i++){const port=await freePort();const proc=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});servers.push(proc);const base=`http://127.0.0.1:${port}`;urls.push(base);let ready=false;for(let n=0;n<100;n++){try{await fetch(base+'/api/crm/customers');ready=true;break}catch{await delay(100)}}assert.ok(ready);}
  const request=(endpoint,role,method='GET',body,extra={},server=0)=>fetch(urls[server]+endpoint,{method,headers:{...(role?{Authorization:`Bearer ${tokens[role]}`} : {}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const path1='/api/crm/customers/1/notes/1', list='/api/crm/customers/1/notes'; const patch=(role,body,extra={},server=0,endpoint=path1)=>request(endpoint,role,'PATCH',body,extra,server);
  assert.equal((await patch(null,{body:'x',expectedRevision:1})).status,401);
  for(const role of ['CASHIER','B2C_CUSTOMER'])assert.equal((await patch(role,{body:'x',expectedRevision:1})).status,403);
  const initial=await (await request(list,'SUPER_ADMIN')).json();assert.equal(initial.data[0].revision,1);assert.equal(initial.data[0].updatedAt,null);
  const detail=await (await request('/api/crm/customers/1','SUPER_ADMIN')).json();assert.equal(detail.data.notes[0].revision,1);
  for(const body of [{body:' ',expectedRevision:1},{body:'x'.repeat(2001),expectedRevision:1},{body:'x',expectedRevision:'1'},{body:'x',expectedRevision:0},{body:'x',expectedRevision:1,customerId:2},[]]) assert.equal((await patch('SUPER_ADMIN',body)).status,422);
  assert.equal((await patch('SUPER_ADMIN',{body:'x',expectedRevision:1},{Origin:'https://attacker.example'})).status,403);
  const forged=await fetch(urls[0]+path1,{method:'PATCH',headers:{Cookie:`ipek_session=${tokens.SUPER_ADMIN}`,Authorization:'Bearer forged','Content-Type':'application/json'},body:JSON.stringify({body:'x',expectedRevision:1})});assert.equal(forged.status,403);
  assert.equal((await patch('SUPER_ADMIN',{body:'x',expectedRevision:1},{'Content-Type':'text/plain'})).status,415);
  assert.equal((await patch('SUPER_ADMIN',{body:'x'.repeat(17000),expectedRevision:1})).status,413);
  const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(JSON.stringify({body:'x'.repeat(17000),expectedRevision:1})));controller.close();}});
  assert.equal((await fetch(urls[0]+path1,{method:'PATCH',headers:{Authorization:`Bearer ${tokens.SUPER_ADMIN}`,'Content-Type':'application/json'},body:stream,duplex:'half'})).status,413);
  assert.equal((await patch('SUPER_ADMIN',{body:'x',expectedRevision:1},{},0,'/api/crm/customers/1/notes/2')).status,404);
  assert.equal((await patch('SUPER_ADMIN',{body:'x',expectedRevision:1},{},0,'/api/crm/customers/2/notes/1')).status,404);
  assert.equal((await request('/api/role-matrix','SUPER_ADMIN','POST',{matrix:{STORE_MANAGER:{crm:true,crmWrite:false}}})).status,200);
  assert.equal((await request(list,'STORE_MANAGER')).status,200);assert.equal((await patch('STORE_MANAGER',{body:'x',expectedRevision:1})).status,403);
  const noop=await patch('SUPER_ADMIN',{body:'İlk özel not',expectedRevision:1});assert.equal(noop.status,200);assert.equal((await noop.json()).data.revision,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM crm_note_edit_state').get().n,0);
  const race=await Promise.all([patch('SUPER_ADMIN',{body:'Yarış bir',expectedRevision:1},{},0),patch('SUPER_ADMIN',{body:'Yarış iki',expectedRevision:1},{},1)]);assert.deepEqual(race.map(x=>x.status).sort(),[200,409]);
  let row=db.prepare('SELECT body FROM crm_customer_notes WHERE id=1').get();assert.ok(['Yarış bir','Yarış iki'].includes(row.body));let state=db.prepare('SELECT * FROM crm_note_edit_state WHERE note_id=1').get();assert.equal(state.revision,2);assert.equal(state.updated_by_name,'SUPER_ADMIN');
  const stale=await patch('SUPER_ADMIN',{body:'Eski taslak',expectedRevision:1});assert.equal(stale.status,409);
  // A -> B -> A still invalidates clients holding the original revision.
  const restore=await patch('SUPER_ADMIN',{body:'İlk özel not',expectedRevision:2});assert.equal(restore.status,200);assert.equal((await restore.json()).data.revision,3);assert.equal((await patch('SUPER_ADMIN',{body:'Aynı eski sürüm',expectedRevision:1})).status,409);
  db.exec("CREATE TRIGGER fail_note_audit BEFORE INSERT ON audit_logs WHEN NEW.action='CRM_NOTE_UPDATED' BEGIN SELECT RAISE(ABORT,'audit fail'); END");
  assert.equal((await patch('SUPER_ADMIN',{body:'Yazılmamalı',expectedRevision:3})).status,500);
  assert.equal(db.prepare('SELECT body FROM crm_customer_notes WHERE id=1').get().body,'İlk özel not');assert.equal(db.prepare('SELECT revision FROM crm_note_edit_state WHERE note_id=1').get().revision,3);db.exec('DROP TRIGGER fail_note_audit');
  const logs=db.prepare("SELECT details FROM audit_logs WHERE action='CRM_NOTE_UPDATED'").all();assert.equal(logs.length,2);assert.ok(!JSON.stringify(logs).includes('Yarış'));assert.ok(!JSON.stringify(logs).includes('İlk özel not'));
  const timeline=await(await request('/api/crm/customers/1/timeline?kind=NOTE_UPDATED','SUPER_ADMIN')).json();assert.equal(timeline.pagination.total,2);assert.equal(timeline.data[0].actor,'SUPER_ADMIN');assert.ok(!JSON.stringify(timeline).includes('İlk özel not'));
  const other=await(await request('/api/crm/customers/2/timeline?kind=NOTE_UPDATED','SUPER_ADMIN')).json();assert.equal(other.pagination.total,0);
  const updated=await(await request(list,'SUPER_ADMIN')).json();assert.equal(updated.data[0].revision,3);assert.equal(updated.data[0].updatedByName,'SUPER_ADMIN');assert.equal(updated.data[0].createdByName,'Önceki');
  assert.equal(db.pragma('foreign_key_check').length,0);
 } finally {for(const s of servers)if(s.exitCode===null){s.kill('SIGTERM');await new Promise(r=>s.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
