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
test('AI müşteri analizi ve tüm sohbet yolları güncel yetkiye bağlıdır', {timeout:60000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-ai-')),file=path.join(dir,'db.sqlite'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try {
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);db=new Database(file);
  db.exec("INSERT INTO customers(id,name,phone,email) VALUES(1,'ÖZEL MÜŞTERİ','5551234567','private@example.test'); INSERT INTO products(id,name,slug,sku,category_id) VALUES(1,'Deneme','deneme','TEST',1)");
  const tokens={},ids={};for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER','B2C_CUSTOMER']){const id=db.prepare('INSERT INTO users(name,email,password_hash,role,is_active) VALUES(?,?,?,?,1)').run(role,`${role}@example.test`,'hash',role).lastInsertRowid;ids[role]=id;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  const matrix=(values)=>db.prepare("INSERT INTO app_settings(key,value) VALUES('admin.role_matrix',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({STORE_MANAGER:values}));
  matrix({ai:true,crm:false});
  const p=await port();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(p),NODE_ENV:'production'},stdio:'ignore'});const url=`http://127.0.0.1:${p}/api/ai`;let ready=false;for(let i=0;i<100;i++){try{await fetch(url);ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const post=(body,role='SUPER_ADMIN',headers={})=>fetch(url,{method:'POST',headers:{...(role?{Authorization:`Bearer ${tokens[role]}`} : {}),'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  const get=(role)=>fetch(url,{headers:role?{Authorization:`Bearer ${tokens[role]}`}:{}});
  let r=await post({module:'crm_assistant'},null);assert.equal(r.status,401);assert.match(r.headers.get('cache-control'),/no-store/);
  assert.equal((await post({module:'crm_assistant'},'B2C_CUSTOMER')).status,403);
  assert.equal((await post({module:'crm_assistant'},'CASHIER')).status,403);
  for(const prompt of ['VIP müşteriler','RFM segmentleri','kohort analizi','satış analizi','karar önerileri']){r=await post({module:'chat',prompt},'STORE_MANAGER');assert.equal(r.status,403,prompt);assert.doesNotMatch(await r.text(),/ÖZEL MÜŞTERİ/);}
  r=await post({module:'crm_assistant'},'STORE_MANAGER');assert.equal(r.status,403);assert.doesNotMatch(await r.text(),/ÖZEL MÜŞTERİ/);
  r=await get('STORE_MANAGER');const listed=await r.json();assert.ok(!listed.modules.some(x=>x.id==='crm_assistant'||x.id==='chat'));
  matrix({ai:true,crm:true});r=await post({module:'crm_assistant'},'STORE_MANAGER');assert.equal(r.status,200,await r.clone().text());assert.match(r.headers.get('cache-control'),/no-store/);const data=await r.json();assert.equal(data.data.topCustomers[0].name,'ÖZEL MÜŞTERİ');assert.match(data.guardrail,/doğrulanmış değildir/);
  matrix({ai:false,crm:true});assert.equal((await post({module:'crm_assistant'},'STORE_MANAGER')).status,403);
  matrix({ai:true,crm:true,intelligence:false});assert.equal((await post({module:'chat',prompt:'RFM'},'STORE_MANAGER')).status,403);
  matrix({ai:true,crm:true,intelligence:true,catalog:true,wms:true,purchasing:true,orders:true,coupons:true});
  for(const prompt of ['VIP müşteriler','RFM segmentleri','kohort analizi','satış analizi']){r=await post({module:'chat',prompt},'STORE_MANAGER');assert.equal(r.status,200,`${prompt}: ${await r.clone().text()}`);assert.ok((await r.json()).data.answer);}
  matrix({ai:true,crm:true});db.exec("CREATE TRIGGER fail_ai_audit BEFORE INSERT ON audit_logs WHEN NEW.action='AI_MODULE_VIEW' BEGIN SELECT RAISE(ABORT,'audit'); END");r=await post({module:'crm_assistant'},'STORE_MANAGER');assert.equal(r.status,500);assert.doesNotMatch(await r.text(),/ÖZEL MÜŞTERİ/);db.exec('DROP TRIGGER fail_ai_audit');
  db.prepare('UPDATE users SET is_active=0 WHERE id=?').run(ids.STORE_MANAGER);assert.equal((await post({module:'crm_assistant'},'STORE_MANAGER')).status,401);db.prepare('UPDATE users SET is_active=1 WHERE id=?').run(ids.STORE_MANAGER);
  assert.equal((await post({module:'crm_assistant'},'SUPER_ADMIN',{Origin:'https://evil.example'})).status,403);
  assert.equal((await post({module:'chat',prompt:'x'.repeat(1001)})).status,422);
  assert.equal((await post({module:'toString'})).status,400);
  r=await post({module:'content_generator',productId:1});assert.equal(r.status,200,await r.clone().text());const content=(await r.json()).data;
  db.exec("CREATE TRIGGER fail_content_audit BEFORE INSERT ON audit_logs WHEN NEW.action='AI_CONTENT_APPLIED' BEGIN SELECT RAISE(ABORT,'audit'); END");assert.equal((await post({module:'apply_content',productId:1,content:{seoTitle:'Yeni'}})).status,500);assert.equal(db.prepare('SELECT seo_title FROM products WHERE id=1').get().seo_title,null);db.exec('DROP TRIGGER fail_content_audit');
  r=await post({module:'apply_content',productId:1,content:{seoTitle:content.seoTitle,metaDescription:content.metaDescription,seoDescription:content.seoDescription,longDescription:content.longDescription,suggestedTags:content.suggestedTags}});assert.equal(r.status,200,await r.clone().text());assert.equal(db.prepare('SELECT seo_title FROM products WHERE id=1').get().seo_title,content.seoTitle);
  const audits=db.prepare("SELECT user_id,user_name,action,details FROM audit_logs WHERE action IN ('AI_MODULE_VIEW','AI_CONTENT_APPLIED')").all();assert.ok(audits.some(x=>x.action==='AI_CONTENT_APPLIED'&&x.user_id===String(ids.SUPER_ADMIN)));assert.doesNotMatch(JSON.stringify(audits),/ÖZEL MÜŞTERİ|private@example.test|5551234567|VIP müşteriler/);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
