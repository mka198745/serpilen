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

test('Kişisel veri içeren veritabanı yedekleri yalnız aktif Süper Admin tarafından yönetilir', {timeout:40000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-backup-')),file=path.join(dir,'db.sqlite'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try{
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);db=new Database(file);
  db.exec("INSERT INTO customers(id,name,phone,email) VALUES(1,'GİZLİ MÜŞTERİ','5551234567','private@example.test')");
  const tokens={},ids={};for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER','B2C_CUSTOMER']){const id=db.prepare('INSERT INTO users(name,email,password_hash,role,is_active) VALUES(?,?,?,?,1)').run(role,`${role}@example.test`,'hash',role).lastInsertRowid;ids[role]=id;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  db.prepare("INSERT INTO app_settings(key,value) VALUES('admin.role_matrix',?)").run(JSON.stringify({STORE_MANAGER:{database:true,crm:false}}));
  fs.mkdirSync(path.join(dir,'backups'));await db.backup(path.join(dir,'backups','tuhafiye-test.db'));fs.symlinkSync(file,path.join(dir,'backups','tuhafiye-link.db'));
  const p=await port();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(p),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${p}`,url=base+'/api/database';let ready=false;for(let i=0;i<100;i++){try{await fetch(url);ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const get=(suffix='',role='SUPER_ADMIN',headers={})=>fetch(url+suffix,{headers:{...(role?{Authorization:`Bearer ${tokens[role]}`} : {}),...headers}});
  const post=(body,role='SUPER_ADMIN',headers={})=>fetch(url,{method:'POST',headers:{...(role?{Authorization:`Bearer ${tokens[role]}`} : {}),'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await get('',null)).status,401);assert.equal((await get('','B2C_CUSTOMER')).status,403);
  for(const role of ['STORE_MANAGER','CASHIER']){assert.equal((await get('',role)).status,403);assert.equal((await get('?download=tuhafiye-test.db',role)).status,403);for(const action of ['backup','restore','download-ticket'])assert.equal((await post({action,name:'tuhafiye-test.db'},role)).status,403);const form=new FormData();form.append('file',new Blob(['bad']),'backup.db');assert.equal((await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${tokens[role]}`},body:form})).status,403);}
  assert.equal((await post({action:'backup'},'SUPER_ADMIN',{Origin:'https://evil.example'})).status,403);assert.equal((await post({action:'backup'},'SUPER_ADMIN',{'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await fetch(url,{method:'POST',headers:{Cookie:`ipek_session=${tokens.SUPER_ADMIN}`,Authorization:'Bearer forged','Content-Type':'application/json'},body:JSON.stringify({action:'backup'})})).status,403);
  assert.equal((await fetch(url,{method:'POST',headers:{Cookie:`ipek_session=${tokens.SUPER_ADMIN}`,'Content-Type':'application/json'},body:JSON.stringify({action:'backup'})})).status,403);
  const info=await get();assert.equal(info.status,200);assert.match(info.headers.get('cache-control'),/no-store/);assert.equal((await info.json()).data.engine,'SQLite');
  assert.equal((await get('?download=tuhafiye-link.db')).status,404);assert.equal((await get('?download=..%2Ftuhafiye-test.db')).status,422);assert.equal((await get('?download=tuhafiye-test.db','SUPER_ADMIN',{'Sec-Fetch-Site':'cross-site'})).status,403);
  const direct=await get('?download=tuhafiye-test.db');assert.equal(direct.status,200);assert.match(direct.headers.get('cache-control'),/no-store/);assert.match(direct.headers.get('referrer-policy'),/no-referrer/);assert.equal(Buffer.from(await direct.arrayBuffer()).subarray(0,16).toString('latin1'),'SQLite format 3\0');
  const ticket=async()=>{const r=await post({action:'download-ticket',name:'tuhafiye-test.db'});assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);const data=(await r.json()).data;assert.equal(data.expiresInSec,30);return data.url;};
  let t=await ticket();let download=await fetch(base+t);assert.equal(download.status,200);assert.match(download.headers.get('cache-control'),/no-store/);assert.equal((await fetch(base+t)).status,401);
  t=await ticket();db.prepare('UPDATE admin_sessions SET revoked_at=unixepoch() WHERE jti=?').run(crypto.createHash('sha256').update(tokens.SUPER_ADMIN).digest('hex'));assert.equal((await fetch(base+t)).status,403);assert.equal((await fetch(base+t)).status,401);db.prepare('UPDATE admin_sessions SET revoked_at=NULL WHERE jti=?').run(crypto.createHash('sha256').update(tokens.SUPER_ADMIN).digest('hex'));
  t=await ticket();db.prepare('UPDATE users SET is_active=0 WHERE id=?').run(ids.SUPER_ADMIN);assert.equal((await fetch(base+t)).status,403);db.prepare('UPDATE users SET is_active=1 WHERE id=?').run(ids.SUPER_ADMIN);
  t=await ticket();db.prepare("UPDATE users SET role='STORE_MANAGER' WHERE id=?").run(ids.SUPER_ADMIN);assert.equal((await fetch(base+t)).status,403);db.prepare("UPDATE users SET role='SUPER_ADMIN' WHERE id=?").run(ids.SUPER_ADMIN);
  t=await ticket();db.prepare('UPDATE admin_sessions SET expires_at=unixepoch()-1 WHERE jti=?').run(crypto.createHash('sha256').update(tokens.SUPER_ADMIN).digest('hex'));assert.equal((await fetch(base+t)).status,403);db.prepare('UPDATE admin_sessions SET expires_at=unixepoch()+3600 WHERE jti=?').run(crypto.createHash('sha256').update(tokens.SUPER_ADMIN).digest('hex'));
  for(const action of ['DB_BACKUP_DOWNLOAD','DB_BACKUP_TICKET','DB_BACKUP_CREATE']){db.exec(`CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs WHEN NEW.action='${action}' BEGIN SELECT RAISE(ABORT,'audit'); END`);const r=action==='DB_BACKUP_DOWNLOAD'?await get('?download=tuhafiye-test.db'):await post({action:action==='DB_BACKUP_TICKET'?'download-ticket':'backup',name:'tuhafiye-test.db'});assert.equal(r.status,500);db.exec('DROP TRIGGER fail_audit');}
  const invalid=new FormData();invalid.append('file',new Blob(['not a database']),'backup.db');assert.equal((await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${tokens.SUPER_ADMIN}`},body:invalid})).status,422);
  const multi=new FormData();multi.append('file',new Blob(['bad']),'backup.db');multi.append('other','value');assert.equal((await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${tokens.SUPER_ADMIN}`},body:multi})).status,422);
  const backup=await post({action:'backup'});assert.equal(backup.status,200);assert.equal(db.prepare('SELECT name FROM customers WHERE id=1').get().name,'GİZLİ MÜŞTERİ');
  const audits=db.prepare("SELECT action,details FROM audit_logs WHERE action IN ('DB_BACKUP_DOWNLOAD','DB_BACKUP_TICKET','DB_BACKUP_CREATE')").all();assert.ok(audits.length>=6);assert.doesNotMatch(JSON.stringify(audits),/GİZLİ MÜŞTERİ|private@example.test|5551234567|[a-f0-9]{64}/);
  // Actual restores run only on this disposable test database.
  db.prepare("UPDATE customers SET name='Restore öncesi' WHERE id=1").run();const restored=await post({action:'restore',name:'tuhafiye-test.db'});assert.equal(restored.status,200,JSON.stringify(await restored.json()));assert.equal(db.prepare('SELECT name FROM customers WHERE id=1').get().name,'GİZLİ MÜŞTERİ');
  db.prepare("UPDATE customers SET name='Yükleme öncesi' WHERE id=1").run();const upload=new FormData();upload.append('file',new Blob([fs.readFileSync(path.join(dir,'backups','tuhafiye-test.db'))]),'test.db');const uploaded=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${tokens.SUPER_ADMIN}`},body:upload});assert.equal(uploaded.status,200,JSON.stringify(await uploaded.json()));assert.equal(db.prepare('SELECT name FROM customers WHERE id=1').get().name,'GİZLİ MÜŞTERİ');
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
