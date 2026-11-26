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
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}

test('Denetim kaydı yalnız güncel audit yetkisiyle okunur ve istemci olay üretemez', {timeout:60000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-audit-')),file=path.join(dir,'db.sqlite'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try{
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);db=new Database(file);
  const tokens={},ids={};for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER','B2C_CUSTOMER']){const id=db.prepare('INSERT INTO users(name,email,password_hash,role,is_active) VALUES(?,?,?,?,1)').run(role,`${role}@example.test`,'hash',role).lastInsertRowid;ids[role]=id;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  const matrix=values=>db.prepare("INSERT INTO app_settings(key,value) VALUES('admin.role_matrix',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({STORE_MANAGER:values}));matrix({audit:false,crm:true});
  db.exec("INSERT INTO audit_logs(user_name,action,entity,details) VALUES('Personel','LOGIN_SUCCESS','User','private@example.test'),('Personel','LOGIN_SUFFER','Fake','benzer ama güvenlik kaydı değil');");
  const insert=db.prepare("INSERT INTO audit_logs(user_name,action,entity,details) VALUES('Personel','OTHER','Customer','GİZLİ MÜŞTERİ 5551234567')");for(let i=0;i<45;i++)insert.run();
  const trigger=path.join(dir,'pause'),waiting=path.join(dir,'waiting'),release=path.join(dir,'release'),hook=path.join(dir,'hook.cjs');
  fs.writeFileSync(hook,`const D=require(${JSON.stringify(path.resolve('.next/standalone/node_modules/better-sqlite3'))}),fs=require('fs');const original=D.prototype.transaction;D.prototype.transaction=function(fn){const tx=original.call(this,fn);function wrap(...args){return tx(...args)};for(const k of ['deferred','exclusive','default'])wrap[k]=tx[k];wrap.immediate=(...args)=>{if(fs.existsSync(${JSON.stringify(trigger)})){fs.unlinkSync(${JSON.stringify(trigger)});fs.writeFileSync(${JSON.stringify(waiting)},'1');const end=Date.now()+6000;while(!fs.existsSync(${JSON.stringify(release)})&&Date.now()<end)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}return tx.immediate(...args)};return wrap};`);
  const p=await port();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(p),NODE_ENV:'production',NODE_OPTIONS:`--require=${hook}`},stdio:'ignore'});const url=`http://127.0.0.1:${p}/api/audit`;let ready=false;for(let i=0;i<100;i++){try{await fetch(url);ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const get=(role='SUPER_ADMIN',suffix='',headers={})=>fetch(url+suffix,{headers:{...(role?{Authorization:`Bearer ${tokens[role]}`} : {}),...headers}});
  const count=()=>db.prepare('SELECT count(*) AS n FROM audit_logs').get().n;
  let r=await get(null);assert.equal(r.status,401);assert.match(r.headers.get('cache-control'),/no-store/);
  for(const role of ['B2C_CUSTOMER','CASHIER','STORE_MANAGER']){const before=count();r=await get(role);assert.equal(r.status,403);assert.doesNotMatch(await r.text(),/GİZLİ|5551234567|private@example/);assert.equal(count(),before);}
  for(const role of [null,'CASHIER','STORE_MANAGER','SUPER_ADMIN']){const before=count();r=await fetch(url,{method:'POST',headers:{...(role?{Authorization:`Bearer ${tokens[role]}`} : {}),'Content-Type':'application/json'},body:JSON.stringify({action:'LOGIN_SUCCESS',entity:'User',userName:'Fake',details:'fake'})});assert.equal(r.status,405);assert.equal(r.headers.get('allow'),'GET');assert.equal(count(),before);}
  assert.equal((await get('SUPER_ADMIN','',{'Sec-Fetch-Site':'cross-site'})).status,403);assert.equal((await get('SUPER_ADMIN','?scope=unknown')).status,400);assert.equal((await get('SUPER_ADMIN','?scope=security&scope=security')).status,400);
  r=await get();assert.equal(r.status,200,await r.clone().text());assert.match(r.headers.get('cache-control'),/no-store/);const list=await r.json();assert.equal(list.count,40);assert.equal(list.data[0].details,'GİZLİ MÜŞTERİ 5551234567');assert.ok(!list.data.some(x=>x.action==='AUDIT_LOG_VIEW'));
  r=await get('SUPER_ADMIN','?scope=security');const security=await r.json();assert.equal(r.status,200);assert.deepEqual(security.data.map(x=>x.action),['LOGIN_SUCCESS']);assert.equal(security.data[0].details,'private@example.test');assert.ok(!Number.isNaN(Date.parse(security.data[0].createdAt)));
  matrix({audit:true,crm:false});r=await get('STORE_MANAGER');assert.equal(r.status,200);assert.match(await r.text(),/GİZLİ MÜŞTERİ/);
  db.exec("CREATE TRIGGER fail_audit_view BEFORE INSERT ON audit_logs WHEN NEW.action='AUDIT_LOG_VIEW' BEGIN SELECT RAISE(ABORT,'audit'); END");r=await get();assert.equal(r.status,500);assert.doesNotMatch(await r.text(),/GİZLİ|private@example/);db.exec('DROP TRIGGER fail_audit_view');
  // Remove permission after authentication but before the protected transaction.
  fs.writeFileSync(trigger,'1');const before=count();const pending=get('STORE_MANAGER');for(let i=0;i<200&&!fs.existsSync(waiting);i++)await delay(10);assert.ok(fs.existsSync(waiting));matrix({audit:false,crm:true});fs.writeFileSync(release,'1');r=await pending;assert.equal(r.status,403);assert.equal(count(),before);assert.doesNotMatch(await r.text(),/GİZLİ|private@example/);
  matrix({audit:true});db.prepare('UPDATE users SET is_active=0 WHERE id=?').run(ids.STORE_MANAGER);assert.equal((await get('STORE_MANAGER')).status,401);
  const logs=db.prepare("SELECT user_id,user_name,details,ip_address FROM audit_logs WHERE action='AUDIT_LOG_VIEW'").all();assert.ok(logs.some(x=>x.user_id===String(ids.STORE_MANAGER)&&x.user_name==='STORE_MANAGER'));assert.ok(logs.every(x=>x.ip_address===null));assert.doesNotMatch(JSON.stringify(logs),/GİZLİ|private@example|5551234567/);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
