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
test('Web üyeliğinde kart, hesap, oturum ve audit atomiktir; mevcut karta otomatik bağlanmaz', {timeout:60000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-web-register-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db;const servers=[];
 try{
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);db=new Database(file);db.pragma('foreign_keys=ON');
  db.exec("INSERT INTO customers(id,name,phone,email,notes) VALUES(1,'Mevcut Gizli','05321112233','ortak@example.test','Özel not'); INSERT INTO users(name,email,password_hash,role) VALUES('Eski Üye',' EsKi@example.test ','hash','B2C_CUSTOMER')");
  const bases=[];for(let n=0;n<2;n++){const port=await freePort();const s=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});servers.push(s);const base=`http://127.0.0.1:${port}`;bases.push(base);let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/auth/me');ready=true;break}catch{await delay(100)}}assert.ok(ready);}
  const body={name:'Yeni Üye',email:'  ORTAK@example.test ',phone:'05321112233',password:'test-sifre-123',city:'Adana'};
  const req=(data,extra={},base=bases[0])=>fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(data)});
  const snapshot=()=>Object.fromEntries(['customers','users','admin_sessions','audit_logs'].map(t=>[t,db.prepare(`SELECT * FROM ${t} ORDER BY id`).all()]));const before=snapshot();
  for(const v of [null,[],{}, {...body,name:'x'}, {...body,name:'x'.repeat(121)}, {...body,email:'bozuk'}, {...body,phone:'abc05321112233'}, {...body,phone:'123'}, {...body,password:'12345'}, {...body,password:'x'.repeat(257)}, {...body,city:'x'.repeat(101)}, {...body,role:'SUPER_ADMIN'}])assert.equal((await req(v)).status,422,JSON.stringify(v));
  assert.equal((await req(body,{Origin:'https://attacker.example'})).status,403);assert.equal((await req(body,{'Sec-Fetch-Site':'cross-site'})).status,403);assert.equal((await req(body,{'Content-Type':'text/plain'})).status,415);
  const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(' '.repeat(17000)));c.close();}});assert.equal((await fetch(bases[0]+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'})).status,413);assert.deepEqual(snapshot(),before);
  const old=await req({...body,email:'ESKI@example.test'});assert.equal(old.status,409);assert.equal((await old.json()).error.code,'DUPLICATE');assert.deepEqual(snapshot(),before);
  for(const [table,action] of [['users',"NEW.email='ortak@example.test'"],['admin_sessions','1=1'],['audit_logs',"NEW.action='WEB_CUSTOMER_REGISTERED'"]]){db.exec(`CREATE TRIGGER test_fail BEFORE INSERT ON ${table} WHEN ${action} BEGIN SELECT RAISE(ABORT,'private db error'); END`);const fail=await req(body);assert.equal(fail.status,500);assert.doesNotMatch(await fail.text(),/private db error|test-sifre|ortak@example/);assert.deepEqual(snapshot(),before);db.exec('DROP TRIGGER test_fail');}
  // Existing customer data alone never establishes ownership and is not disclosed as a conflict.
  const created=await req(body,{Origin:bases[0]});assert.equal(created.status,200);assert.match(created.headers.get('cache-control'),/no-store/);assert.match(created.headers.get('set-cookie'),/ipek_session=/);const response=await created.json();assert.equal(response.success,true);assert.equal(response.data.user.email,'ortak@example.test');assert.equal(response.data.user.role,'B2C_CUSTOMER');assert.equal(response.data.user.isStaff,false);assert.notEqual(response.data.customerId,1);assert.match(response.data.token,/^[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(response),/test-sifre-123|passwordHash|Özel not/);
  const newUser=db.prepare('SELECT * FROM users WHERE id=?').get(response.data.user.id);assert.equal(newUser.customer_id,response.data.customerId);assert.match(newUser.password_hash,/^scrypt\$/);assert.notEqual(newUser.password_hash,body.password);const session=db.prepare('SELECT * FROM admin_sessions WHERE user_id=?').get(newUser.id);assert.equal(session.jti,crypto.createHash('sha256').update(response.data.token).digest('hex'));assert.notEqual(session.jti,response.data.token);assert.equal(db.prepare('SELECT notes FROM customers WHERE id=1').get().notes,'Özel not');assert.equal(db.prepare('SELECT count(*) n FROM customers WHERE phone=?').get(body.phone).n,2);
  const me=await fetch(bases[0]+'/api/auth/me',{headers:{Authorization:`Bearer ${response.data.token}`}});assert.equal(me.status,200);assert.equal((await me.json()).data.user.id,newUser.id);const login=await fetch(bases[0]+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'ortak@example.test',password:body.password})});assert.equal(login.status,200);
  const raceBody={...body,email:'race@example.test',phone:'05329998877'};const race=await Promise.all(bases.map(b=>req(raceBody,{},b)));assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.equal(db.prepare("SELECT count(*) n FROM users WHERE email='race@example.test'").get().n,1);assert.equal(db.prepare("SELECT count(*) n FROM customers WHERE email='race@example.test'").get().n,1);assert.equal(db.prepare("SELECT count(*) n FROM admin_sessions WHERE user_id=(SELECT id FROM users WHERE email='race@example.test')").get().n,1);
  const logs=db.prepare("SELECT * FROM audit_logs WHERE action='WEB_CUSTOMER_REGISTERED'").all();assert.equal(logs.length,2);assert.doesNotMatch(JSON.stringify(logs),/Yeni Üye|test-sifre|ortak@example|05321112233/);assert.deepEqual(db.pragma('foreign_key_check'),[]);
 }finally{await Promise.all(servers.map(async s=>{if(s.exitCode===null){s.kill('SIGTERM');await new Promise(r=>s.once('exit',r));}}));db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
