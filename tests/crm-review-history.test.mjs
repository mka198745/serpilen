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
import {customerEditVersion} from '../src/lib/crm-customer.ts';
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}

test('Kaydedilmiş müşteri değerlendirmeleri eşleşme yokken de sayfalı, yetkili ve güncellik uyarılıdır', {timeout:40000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-history-')),file=path.join(dir,'db.sqlite'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try{
  const m=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(m.status,0,m.stderr);db=new Database(file);db.pragma('foreign_keys=ON');
  const add=db.prepare('INSERT INTO customers(id,name,phone,email,city,address,company_name) VALUES(?,?,?,?,?,?,?)');
  const source={id:50,name:'Ana Kart',phone:'5559999999',email:'secret-main@example.test',city:null,address:'Gizli adres',companyName:null};add.run(source.id,source.name,source.phone,source.email,source.city,source.address,source.companyName);
  const review=db.prepare('INSERT INTO crm_duplicate_reviews(customer_low_id,customer_high_id,status,low_version,high_version,revision,reviewed_by_id,reviewed_by_name,reviewed_at) VALUES(?,?,?,?,?,?,?,?,?)');
  const ids=[...Array.from({length:24},(_,i)=>i+1),60];for(const id of ids){const c={id,name:`Aday ${id}`,phone:`555${String(id).padStart(7,'0')}`,email:`secret-${id}@example.test`,city:null,address:'Gizli adres',companyName:null};add.run(c.id,c.name,c.phone,c.email,c.city,c.address,c.companyName);review.run(Math.min(id,50),Math.max(id,50),id%2?'UNSURE':'DISTINCT',customerEditVersion(id<50?c:source),customerEditVersion(id<50?source:c),1,1,'İnceleyen',1700000000+id);}
  db.prepare("UPDATE customers SET city='Adana' WHERE id=5").run();
  const tokens={};for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER','B2C_CUSTOMER']){const id=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(role,`${role}@example.test`,'hash',role).lastInsertRowid;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  const before=db.prepare('SELECT * FROM crm_duplicate_reviews ORDER BY customer_low_id,customer_high_id').all();
  const p=await port();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(p),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${p}`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/crm/customers');ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const get=(url,role='SUPER_ADMIN')=>fetch(base+url,{headers:role?{Authorization:`Bearer ${tokens[role]}`}:{}}),endpoint='/api/crm/customers/50/duplicate-reviews';
  assert.equal((await get(endpoint,null)).status,401);assert.equal((await get(endpoint,'CASHIER')).status,403);assert.equal((await get(endpoint,'B2C_CUSTOMER')).status,403);assert.equal((await get('/api/crm/customers/999/duplicate-reviews')).status,404);
  for(const q of ['?page=0','?page=1000000','?status=stale','?status=MERGE'])assert.equal((await get(endpoint+q)).status,422);
  const response=await get(endpoint);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);const first=await response.json(),second=await(await get(endpoint+'?page=2')).json();assert.equal(first.data.length,20);assert.equal(first.pagination.hasMore,true);assert.equal(second.data.length,5);assert.equal(second.pagination.hasMore,false);
  const all=[...first.data,...second.data];assert.equal(new Set(all.map(x=>x.customer.id)).size,25);assert.deepEqual(all.map(x=>x.customer.id),[...ids].sort((a,b)=>b-a));assert.equal(all.find(x=>x.customer.id===5).stale,true);assert.equal(all.find(x=>x.customer.id===60).stale,false);assert.equal(all.find(x=>x.customer.id===4).status,'DISTINCT');assert.doesNotMatch(JSON.stringify(all),/secret-|example.test|5559999999|Gizli adres|lowVersion|highVersion/);
  const reverse=await(await get('/api/crm/customers/5/duplicate-reviews')).json();assert.equal(reverse.data[0].customer.id,50);assert.equal(reverse.data[0].stale,true);
  const unsure=await(await get(endpoint+'?status=UNSURE')).json();assert.equal(unsure.data.length,12);assert.ok(unsure.data.every(x=>x.status==='UNSURE'));const distinct=await(await get(endpoint+'?status=DISTINCT')).json();assert.equal(distinct.data.length,13);assert.ok(distinct.data.every(x=>x.status==='DISTINCT'));
  const candidates=await(await get('/api/crm/customers/50/duplicate-candidates')).json();assert.deepEqual(candidates.data,[],'saved reviews remain even without a contact match');
  const logs=db.prepare("SELECT details FROM audit_logs WHERE action='CRM_DUPLICATE_REVIEWS_VIEW'").all();assert.ok(logs.length>=5);assert.doesNotMatch(JSON.stringify(logs),/example.test|555|Gizli adres|Aday [0-9]/);
  db.exec("CREATE TRIGGER fail_history_audit BEFORE INSERT ON audit_logs WHEN NEW.action='CRM_DUPLICATE_REVIEWS_VIEW' BEGIN SELECT RAISE(ABORT,'audit failed'); END");const fail=await get(endpoint);assert.equal(fail.status,500);assert.doesNotMatch(JSON.stringify(await fail.json()),/Ana Kart|Aday/);db.exec('DROP TRIGGER fail_history_audit');
  db.prepare("INSERT INTO app_settings(key,value) VALUES('admin.role_matrix',?)").run(JSON.stringify({STORE_MANAGER:{crm:true,crmWrite:false}}));assert.equal((await get(endpoint,'STORE_MANAGER')).status,403);assert.deepEqual(db.prepare('SELECT * FROM crm_duplicate_reviews ORDER BY customer_low_id,customer_high_id').all(),before);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
