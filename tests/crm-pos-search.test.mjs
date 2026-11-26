import {testPosGrant} from './helpers/pos-grant.mjs';
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
test('POS arama izinli, sınırlı, sayfalı ve içeriksiz audit ile kayıtlıdır', {timeout:45000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-search-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try {
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);db=new Database(file);db.pragma('foreign_keys=ON');
  const insert=db.prepare('INSERT INTO customers(name,phone,email,address,notes,loyalty_points) VALUES(?,?,?,?,?,?)');for(let i=0;i<25;i++)insert.run(`Ortak Müşteri ${i}`,`555100${String(i).padStart(4,'0')}`,`m${i}@example.test`,'özel adres','özel not',i);insert.run('Ayrı Kişi','(555) 111-2233','private@example.test','gizli adres','gizli not',123);insert.run('100% Gerçek','5550001234','percent@example.test','a','b',0);
  const tokens={},ids={};for(const role of ['SUPER_ADMIN','CASHIER','WAREHOUSE_KEEPER','B2C_CUSTOMER']){const id=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(role,`${role}@example.test`,'hash',role).lastInsertRowid;ids[role]=id;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  const grants=Object.fromEntries(Object.keys(tokens).map(role=>[role,testPosGrant(db,ids[role],tokens[role])]));
  const port=await freePort();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${port}`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/pos/customers/search',{method:'POST'});ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const search=(role,query,page=1,extra={})=>fetch(base+'/api/pos/customers/search',{method:'POST',headers:{...(role?{Authorization:`Bearer ${tokens[role]}`,'X-Pos-Grant':grants[role]} : {}),'Content-Type':'application/json',...extra},body:JSON.stringify({query,page})});
  const matrix=(value)=>db.prepare("INSERT INTO app_settings(key,value) VALUES('admin.role_matrix',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(value));
  assert.equal((await search(null,'Ortak')).status,401);assert.equal((await search('B2C_CUSTOMER','Ortak')).status,403);assert.equal((await search('WAREHOUSE_KEEPER','Ortak')).status,403);assert.equal((await search('CASHIER','Ortak',1,{Origin:'https://evil.example'})).status,403);
  assert.equal((await fetch(base+'/api/pos/customers/search',{method:'POST',headers:{Cookie:`ipek_session=${tokens.CASHIER}`,Authorization:'Bearer fake','Content-Type':'application/json'},body:JSON.stringify({query:'Ortak',page:1})})).status,403);
  for(const [query,page] of [['',1],['ab',1],['%%%',1],['123',1],['email@bad',1],['Ortak',0],['Ortak',1001],['#999999999999999999',1]])assert.equal((await search('CASHIER',query,page)).status,422,query);
  const r=await search('CASHIER','Ortak');assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);const first=await r.json();assert.equal(first.data.length,20);assert.equal(first.pagination.hasMore,true);assert.deepEqual(Object.keys(first.data[0]).sort(),['companyName','id','loyaltyPoints','name','phone']);assert.doesNotMatch(JSON.stringify(first),/özel adres|özel not|example\.test/);
  const second=await(await search('CASHIER','Ortak',2)).json();assert.equal(second.data.length,5);assert.equal(second.pagination.hasMore,false);assert.equal(new Set([...first.data,...second.data].map(x=>x.id)).size,25);
  const phone=await(await search('CASHIER','1112233')).json();assert.equal(phone.data[0].name,'Ayrı Kişi');const email=await(await search('CASHIER',' PRIVATE@example.test ')).json();assert.equal(email.data[0].name,'Ayrı Kişi');assert.doesNotMatch(JSON.stringify(email),/private@example/);const id=await(await search('CASHIER','#26')).json();assert.equal(id.data[0].name,'Ayrı Kişi');const wildcard=await(await search('CASHIER','100% Gerçek')).json();assert.equal(wildcard.data.length,1);assert.equal((await(await search('CASHIER','Mevcut değil')).json()).data.length,0);
  matrix({CASHIER:{pos:true,crm:false,crmWrite:false}});assert.equal((await search('CASHIER','Ortak')).status,200);
  const logs=db.prepare("SELECT * FROM audit_logs WHERE action='POS_CUSTOMER_SEARCH'").all();assert.ok(logs.length>=6);assert.doesNotMatch(JSON.stringify(logs),/Ortak|1112233|private@example|Ayrı Kişi/);
  db.exec("CREATE TRIGGER fail_search_audit BEFORE INSERT ON audit_logs WHEN NEW.action='POS_CUSTOMER_SEARCH' BEGIN SELECT RAISE(ABORT,'audit'); END");assert.equal((await search('CASHIER','Ortak')).status,500);db.exec('DROP TRIGGER fail_search_audit');
  let controller;const stream=new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode(' '));}});const pending=fetch(base+'/api/pos/customers/search',{method:'POST',headers:{Authorization:`Bearer ${tokens.CASHIER}`,'X-Pos-Grant':grants.CASHIER,'Content-Type':'application/json'},body:stream,duplex:'half'});await delay(180);matrix({CASHIER:{pos:false}});controller.enqueue(new TextEncoder().encode(JSON.stringify({query:'Ortak',page:1})));controller.close();assert.equal((await pending).status,403);assert.equal((await search('CASHIER','Ortak')).status,403);
  db.exec('DROP TABLE customers');assert.equal((await search('CASHIER','Ortak')).status,403);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
