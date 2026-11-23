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

test('Sadakat API ayarları sınırlar, CRM verisini korur ve puanı atomik günceller', {timeout:45000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-loyalty-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db;const servers=[];
 try {
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);db=new Database(file);db.pragma('foreign_keys=ON');
  db.exec("INSERT INTO customers(id,name,phone,email,loyalty_points) VALUES(1,'Gizli Müşteri','5551234567','secret@example.test',100); INSERT INTO loyalty_transactions(customer_id,points,type,description) VALUES(1,100,'EARN','Gizli açıklama'); INSERT INTO app_settings(key,value) VALUES('site.payment.secret','private-token-example'),('custom.secret','other-private-example')");
  const tokens={};for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER','B2C_CUSTOMER']){const id=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(role,`${role}@example.test`,'hash',role).lastInsertRowid;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  const bases=[];for(let n=0;n<2;n++){const port=await freePort();const s=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});servers.push(s);const base=`http://127.0.0.1:${port}`;bases.push(base);let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/loyalty');ready=true;break}catch{await delay(100)}}assert.ok(ready);}
  const req=(role,method='GET',body,base=bases[0],extra={})=>fetch(base+'/api/loyalty',{method,headers:{...(role?{Authorization:`Bearer ${tokens[role]}`} : {}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const matrix=async(value)=>{const r=await fetch(bases[0]+'/api/role-matrix',{method:'POST',headers:{Authorization:`Bearer ${tokens.SUPER_ADMIN}`,'Content-Type':'application/json'},body:JSON.stringify({matrix:value})});assert.equal(r.status,200);};
  assert.equal((await req(null)).status,401);for(const role of ['CASHIER','B2C_CUSTOMER'])assert.equal((await req(role)).status,403);
  const admin=await req('SUPER_ADMIN');assert.equal(admin.status,200);assert.match(admin.headers.get('cache-control'),/no-store/);const data=await admin.json();assert.equal(data.members[0].name,'Gizli Müşteri');assert.equal(data.members[0].earned,100);assert.equal(data.transactions[0].customerName,'Gizli Müşteri');assert.equal(data.settingsWriteKeys.length,6);assert.doesNotMatch(JSON.stringify(data),/private-token-example|other-private-example|admin\.role_matrix|site\.payment/);
  const change={action:'ADJUST',customerId:1,points:10,description:'özel not'};assert.equal((await req('CASHIER','POST',change)).status,403);assert.equal((await req('B2C_CUSTOMER','POST',change)).status,403);assert.equal((await req('SUPER_ADMIN','POST',change,bases[0],{Origin:'https://attacker.example'})).status,403);
  const forged=await fetch(bases[0]+'/api/loyalty',{method:'POST',headers:{Cookie:`ipek_session=${tokens.SUPER_ADMIN}`,Authorization:'Bearer forged','Content-Type':'application/json'},body:JSON.stringify(change)});assert.equal(forged.status,403);
  const stream=()=>new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(' '.repeat(17000)));c.close();}});assert.equal((await fetch(bases[0]+'/api/loyalty',{method:'POST',headers:{Authorization:`Bearer ${tokens.SUPER_ADMIN}`,'Content-Type':'application/json'},body:stream(),duplex:'half'})).status,413);
  for(const invalid of [{...change,points:1.5},{...change,points:'10'},{...change,points:0},{...change,points:1000001},{...change,customerId:-1},{...change,description:'x'.repeat(501)},{...change,extra:1}])assert.equal((await req('SUPER_ADMIN','POST',invalid)).status,422);
  for(const key of ['admin.role_matrix','site.payment.secret','custom.secret','__proto__'])assert.equal((await req('SUPER_ADMIN','POST',{action:'SAVE_SETTINGS',settings:{[key]:'bad'}})).status,422,key);
  for(const value of ['', 'Infinity', '-1', '0','12.5','x'])assert.equal((await req('SUPER_ADMIN','POST',{action:'SAVE_SETTINGS',settings:{'reservation.minutes':value}})).status,422,value);
  await matrix({CASHIER:{coupons:true,crm:false,crmWrite:false},STORE_MANAGER:{coupons:true,crm:true,crmWrite:false}});
  const limited=await(await req('CASHIER')).json();assert.equal(limited.members,null);assert.equal(limited.transactions,null);assert.equal(limited.crmAllowed,false);assert.doesNotMatch(JSON.stringify(limited),/Gizli Müşteri|özel not|5551234567|private-token-example/);assert.equal((await req('CASHIER','POST',change)).status,403);assert.equal((await req('STORE_MANAGER','POST',change)).status,403);
  assert.equal((await req('CASHIER','POST',{action:'SAVE_SETTINGS',settings:{'shipping.free_threshold':'123'}})).status,403);assert.equal((await req('CASHIER','POST',{action:'SAVE_SETTINGS',settings:{'loyalty.earn_points':'15'}})).status,200);assert.equal(db.prepare("SELECT value FROM app_settings WHERE key='loyalty.earn_points'").get().value,'15');
  db.exec("CREATE TRIGGER fail_settings_audit BEFORE INSERT ON audit_logs WHEN NEW.action='LOYALTY_SETTINGS' BEGIN SELECT RAISE(ABORT,'audit fail'); END");assert.equal((await req('SUPER_ADMIN','POST',{action:'SAVE_SETTINGS',settings:{'loyalty.earn_points':'77','reservation.minutes':'30'}})).status,500);assert.equal(db.prepare("SELECT value FROM app_settings WHERE key='loyalty.earn_points'").get().value,'15');assert.equal(db.prepare("SELECT value FROM app_settings WHERE key='reservation.minutes'").get(),undefined);db.exec('DROP TRIGGER fail_settings_audit');
  await matrix({CASHIER:{coupons:true,crm:true,crmWrite:true}});
  assert.equal((await req('CASHIER','POST',{...change,points:-101})).status,422);assert.equal(db.prepare('SELECT loyalty_points p FROM customers WHERE id=1').get().p,100);
  const race=await Promise.all([req('CASHIER','POST',{...change,points:-70},bases[0]),req('CASHIER','POST',{...change,points:-70},bases[1])]);assert.deepEqual(race.map(x=>x.status).sort(),[200,422]);assert.equal(db.prepare('SELECT loyalty_points p FROM customers WHERE id=1').get().p,30);assert.equal(db.prepare("SELECT COUNT(*) n FROM loyalty_transactions WHERE type='SPEND'").get().n,1);
  db.exec("CREATE TRIGGER fail_adjust_audit BEFORE INSERT ON audit_logs WHEN NEW.action='LOYALTY_ADJUSTED' BEGIN SELECT RAISE(ABORT,'audit fail'); END");assert.equal((await req('SUPER_ADMIN','POST',change)).status,500);db.exec('DROP TRIGGER fail_adjust_audit');assert.equal(db.prepare('SELECT loyalty_points p FROM customers WHERE id=1').get().p,30);assert.equal(db.prepare('SELECT COUNT(*) n FROM loyalty_transactions').get().n,2);
  const audit=db.prepare("SELECT * FROM audit_logs WHERE action IN ('LOYALTY_SETTINGS','LOYALTY_ADJUSTED')").all();assert.ok(audit.length>=2);assert.doesNotMatch(JSON.stringify(audit),/5551234567|özel not|private-token-example|secret@example\.test/);assert.deepEqual(db.pragma('foreign_key_check'),[]);
  await matrix({CASHIER:{coupons:true,crm:false,crmWrite:false}});
  // The CRM-restricted read must not touch either customer table (temporary DB only).
  db.pragma('foreign_keys=OFF');db.exec('DROP TABLE loyalty_transactions; DROP TABLE customers');
  const noCustomerTables=await req('CASHIER');assert.equal(noCustomerTables.status,200);const safe=await noCustomerTables.json();assert.equal(safe.members,null);assert.equal(safe.transactions,null);
 }finally{await Promise.all(servers.map(async s=>{if(s.exitCode===null){s.kill('SIGTERM');await new Promise(r=>s.once('exit',r));}}));db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
