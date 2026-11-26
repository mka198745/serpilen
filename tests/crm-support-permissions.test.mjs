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
test('Destek mesajları modül yetkisiyle korunur, durum ve audit atomiktir', {timeout:45000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-support-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try{
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);db=new Database(file);
  const tokens={};for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER','B2C_CUSTOMER']){const id=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(role,`${role}@example.test`,'hash',role).lastInsertRowid;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  db.prepare("INSERT INTO contact_messages(name,phone,email,subject,message) VALUES(?,?,?,?,?)").run('Özel Ad','5551234567','private@example.test','Özel konu','Gizli mesaj');
  const port=await freePort();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${port}`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/contact');ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const req=(role,method='GET',body,extra={},query='')=>fetch(base+'/api/contact'+query,{method,headers:{...(role?{Authorization:`Bearer ${tokens[role]}`} : {}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const matrix=async(value)=>{const r=await fetch(base+'/api/role-matrix',{method:'POST',headers:{Authorization:`Bearer ${tokens.SUPER_ADMIN}`,'Content-Type':'application/json'},body:JSON.stringify({matrix:value})});assert.equal(r.status,200);};
  assert.equal((await req(null)).status,401);assert.equal((await req('B2C_CUSTOMER')).status,403);assert.equal((await req('CASHIER')).status,403);assert.equal((await req('CASHIER','PATCH',{id:1,status:'READ'})).status,403);
  const manager=await req('STORE_MANAGER');assert.equal(manager.status,200);assert.match(manager.headers.get('cache-control'),/no-store/);const data=await manager.json();assert.equal(data.data[0].name,'Özel Ad');assert.equal(data.counts.NEW,1);assert.equal((await req('STORE_MANAGER','GET',undefined,{},'?status=bad')).status,422);
  await matrix({CASHIER:{support:true,crm:false,crmWrite:false},STORE_MANAGER:{support:false}});
  assert.equal((await req('STORE_MANAGER')).status,403);assert.equal((await req('STORE_MANAGER','PATCH',{id:1,status:'READ'})).status,403);assert.equal((await req('CASHIER')).status,200);
  const change={id:1,status:'READ'};assert.equal((await req('CASHIER','PATCH',change,{Origin:'https://evil.example'})).status,403);
  const forged=await fetch(base+'/api/contact',{method:'PATCH',headers:{Cookie:`ipek_session=${tokens.CASHIER}`,Authorization:'Bearer forged','Content-Type':'application/json'},body:JSON.stringify(change)});assert.equal(forged.status,403);
  const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(' '.repeat(17000)));c.close();}});assert.equal((await fetch(base+'/api/contact',{method:'PATCH',headers:{Authorization:`Bearer ${tokens.CASHIER}`,'Content-Type':'application/json'},body:stream,duplex:'half'})).status,413);
  for(const invalid of [{id:1,status:'BAD'},{id:'1',status:'READ'},{id:-1,status:'READ'},{id:1,status:'READ',message:'X'}])assert.equal((await req('CASHIER','PATCH',invalid)).status,422);
  assert.equal((await req('CASHIER','PATCH',{id:99,status:'READ'})).status,404);
  db.exec("CREATE TRIGGER fail_contact_audit BEFORE INSERT ON audit_logs WHEN NEW.action='CONTACT_STATUS_CHANGED' BEGIN SELECT RAISE(ABORT,'audit fail'); END");assert.equal((await req('CASHIER','PATCH',change)).status,500);assert.equal(db.prepare('SELECT status FROM contact_messages WHERE id=1').get().status,'NEW');db.exec('DROP TRIGGER fail_contact_audit');
  const changed=await req('CASHIER','PATCH',change);assert.equal(changed.status,200);assert.match(changed.headers.get('cache-control'),/no-store/);assert.deepEqual((await changed.json()).data,change);assert.ok(db.prepare('SELECT read_at FROM contact_messages WHERE id=1').get().read_at);assert.equal((await req('CASHIER','PATCH',change)).status,200);assert.equal(db.prepare("SELECT count(*) n FROM audit_logs WHERE action='CONTACT_STATUS_CHANGED'").get().n,1);
  assert.equal((await req('CASHIER','PATCH',{id:1,status:'NEW'})).status,200);assert.equal(db.prepare('SELECT read_at FROM contact_messages WHERE id=1').get().read_at,null);
  const logs=db.prepare("SELECT * FROM audit_logs WHERE action='CONTACT_STATUS_CHANGED'").all();assert.doesNotMatch(JSON.stringify(logs),/Özel Ad|5551234567|private@example|Gizli mesaj|Özel konu/);
  const publicPost=await req(null,'POST',{name:'Ziyaretçi',phone:'5551112233',message:'Yeni destek mesajı'});assert.equal(publicPost.status,201);
  await matrix({CASHIER:{support:false}});assert.equal((await req('CASHIER')).status,403);assert.equal((await req('CASHIER','PATCH',change)).status,403);assert.equal(db.prepare('SELECT status FROM contact_messages WHERE id=1').get().status,'NEW');
  db.exec('DROP TABLE contact_messages');assert.equal((await req('CASHIER')).status,403);assert.equal((await req('CASHIER','PATCH',change)).status,403);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
