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

async function freePort(){const s=net.createServer();await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve);});const p=s.address().port;await new Promise(resolve=>s.close(resolve));return p;}
test('İki kart değerlendirmesi yetkili, eşzamanlılık kontrollü ve birleştirmesizdir', {timeout:30000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-review-'));const dbPath=path.join(dir,'test.db');const env={...process.env,DATABASE_URL:`sqlite:${dbPath}`};const servers=[];
 try{
  const migrate=()=>spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8',timeout:15000});let m=migrate();assert.equal(m.status,0,m.stderr);
  const db=new Database(dbPath);db.pragma('foreign_keys=ON');db.prepare("INSERT INTO customers (id,name,phone,email) VALUES (1,'Birinci','5551234567','one@example.test'),(2,'İkinci','5551234567','two@example.test'),(3,'Üçüncü','5559876543','third@example.test')").run();
  db.prepare("INSERT INTO orders (order_number,customer_id,customer_name,grand_total) VALUES ('REVIEW-ORDER',1,'Birinci','100')").run();
  const tokens={};for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER','B2C_CUSTOMER']){const id=db.prepare('INSERT INTO users (email,password_hash,name,role) VALUES (?,?,?,?)').run(`${role}@example.test`,'hash',role,role).lastInsertRowid;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions (user_id,jti,expires_at) VALUES (?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}db.close();
  m=migrate();assert.equal(m.status,0,m.stderr);assert.match(m.stdout,/atlandı \(uygulanmış\): 0019_crm_duplicate_reviews/);
  const bases=[];for(let n=0;n<2;n++){const port=await freePort();const s=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});servers.push(s);const base=`http://127.0.0.1:${port}`;bases.push(base);let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/crm/customers');ready=true;break;}catch{if(s.exitCode!==null)throw Error('Sunucu kapandı');await delay(100);}}assert.ok(ready);}
  const req=(url,role='SUPER_ADMIN',method='GET',body,base=bases[0],extra={})=>fetch(base+url,{method,headers:{...(role?{Authorization:`Bearer ${tokens[role]}`} : {}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const preview=async(a=1,b=2)=>{const r=await req(`/api/crm/customers/${a}/merge-preview?target=${b}`);assert.equal(r.status,200);return r.json();};
  let p=await preview();assert.equal(p.canMerge,false);assert.equal(p.review,null);assert.match(p.versions.source,/^[a-f0-9]{64}$/);
  const payload=(view,status='DISTINCT')=>({targetId:2,status,sourceVersion:view.versions.source,targetVersion:view.versions.target,expectedRevision:view.review?.revision??null});
  const endpoint='/api/crm/customers/1/duplicate-review';
  assert.equal((await req(endpoint,null,'POST',payload(p))).status,401);assert.equal((await req(endpoint,'CASHIER','POST',payload(p))).status,403);assert.equal((await req(endpoint,'B2C_CUSTOMER','POST',payload(p))).status,403);
  assert.equal((await req(endpoint,'SUPER_ADMIN','POST',payload(p),bases[0],{Origin:'https://bad.example'})).status,403);
  for(const body of [{...payload(p),status:'MERGE'}, {...payload(p),targetId:1}, {...payload(p),targetId:999,sourceVersion:'bad'}, {...payload(p),reason:'ek veri'}, {...payload(p),expectedRevision:0}])assert.equal((await req(endpoint,'SUPER_ADMIN','POST',body)).status,422);
  assert.equal((await req(endpoint,'SUPER_ADMIN','POST',{...payload(p),targetId:999})).status,404);
  const tooLong=()=>new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(' '.repeat(17000)));c.close();}});
  assert.equal((await fetch(bases[0]+endpoint,{method:'POST',headers:{Authorization:`Bearer ${tokens.SUPER_ADMIN}`,'Content-Type':'application/json'},body:tooLong(),duplex:'half'})).status,413);
  const saved=await req(endpoint,'SUPER_ADMIN','POST',payload(p));assert.equal(saved.status,200);const review=(await saved.json()).review;assert.equal(review.status,'DISTINCT');assert.equal(review.revision,1);assert.equal(review.stale,false);
  assert.equal((await req(endpoint,'SUPER_ADMIN','POST',payload(p))).status,409);
  let reverse=await preview(2,1);assert.equal(reverse.review.status,'DISTINCT');assert.equal(reverse.review.revision,1);assert.equal(reverse.review.stale,false);
  const candidates=await(await req('/api/crm/customers/1/duplicate-candidates')).json();assert.ok(candidates.data.some(x=>x.id===2)); // decision never hides candidate
  const otherDb=new Database(dbPath);otherDb.exec("UPDATE customers SET city='Adana' WHERE id=2");otherDb.close();
  let stale=await preview();assert.equal(stale.review.stale,true);
  assert.equal((await req(endpoint,'SUPER_ADMIN','POST',{...payload(p),expectedRevision:1})).status,409);
  const update=await req(endpoint,'SUPER_ADMIN','POST',payload(stale,'UNSURE'));assert.equal(update.status,200);assert.equal((await update.json()).review.revision,2);
  p=await preview();assert.equal(p.review.status,'UNSURE');assert.equal(p.review.stale,false);
  const racing=await Promise.all([req(endpoint,'SUPER_ADMIN','POST',payload(p,'DISTINCT'),bases[0]),req(endpoint,'SUPER_ADMIN','POST',payload(p,'UNSURE'),bases[1])]);assert.deepEqual(racing.map(r=>r.status).sort(),[200,409]);
  p=await preview();assert.equal(p.review.revision,3);
  const guard=new Database(dbPath);guard.pragma('foreign_keys=ON');assert.throws(()=>guard.prepare('DELETE FROM customers WHERE id=1').run(),/FOREIGN KEY/);assert.throws(()=>guard.prepare('DELETE FROM customers WHERE id=2').run(),/FOREIGN KEY/);
  assert.equal(guard.prepare('SELECT count(*) n FROM customers').get().n,3);assert.equal(guard.prepare('SELECT customer_id FROM orders WHERE order_number=?').get('REVIEW-ORDER').customer_id,1);
  const audits=guard.prepare("SELECT details FROM audit_logs WHERE action='CRM_DUPLICATE_REVIEWED'").all();assert.equal(audits.length,3);assert.ok(!JSON.stringify(audits).includes('example.test'));assert.ok(!JSON.stringify(audits).includes('5551234567'));
  guard.exec("CREATE TRIGGER fail_review BEFORE INSERT ON audit_logs WHEN NEW.action='CRM_DUPLICATE_REVIEWED' BEGIN SELECT RAISE(ABORT,'audit failure'); END");guard.close();
  assert.equal((await req(endpoint,'SUPER_ADMIN','POST',payload(p,'UNSURE'))).status,500);
  const verify=new Database(dbPath);assert.equal(verify.prepare('SELECT revision FROM crm_duplicate_reviews').get().revision,3);verify.exec('DROP TRIGGER fail_review');verify.close();
  assert.equal((await req('/api/role-matrix','SUPER_ADMIN','POST',{matrix:{STORE_MANAGER:{crm:true,crmWrite:false}}})).status,200);assert.equal((await req(endpoint,'STORE_MANAGER','POST',payload(p))).status,403);
 }finally{await Promise.all(servers.map(async s=>{if(s.exitCode===null){s.kill('SIGTERM');await new Promise(resolve=>s.once('exit',resolve));}}));fs.rmSync(dir,{recursive:true,force:true});}
});
