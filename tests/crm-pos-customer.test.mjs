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
test('POS hızlı müşteri yetkisi, kayıt bütünlüğü ve SSR veri sınırları', {timeout:60000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-pos-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db;const servers=[];
 try{
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);db=new Database(file);db.pragma('foreign_keys=ON');
  db.exec("INSERT INTO customers(id,name,phone,email,address,notes,tax_number) VALUES(1,'Özel Müşteri','(555) 111-2233','secret@example.test','gizli adres','gizli not','GIZLIVERGI')");
  const tokens={},ids={};for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER','WAREHOUSE_KEEPER','B2C_CUSTOMER']){const id=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(role,`${role}@example.test`,'hash',role).lastInsertRowid;ids[role]=id;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  const bases=[];for(let n=0;n<2;n++){const port=await freePort();const s=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});servers.push(s);const base=`http://127.0.0.1:${port}`;bases.push(base);let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/customers',{method:'POST'});ready=true;break}catch{await delay(100)}}assert.ok(ready);}
  const req=(role,body,extra={},base=bases[0])=>fetch(base+'/api/customers',{method:'POST',headers:{...(role?{Authorization:`Bearer ${tokens[role]}`} : {}),'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
  const matrix=(value)=>db.prepare("INSERT INTO app_settings(key,value) VALUES('admin.role_matrix',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(value));
  const initial={name:'Yeni Müşteri',phone:'5553334455',email:'new@example.test'};
  assert.equal((await req(null,initial)).status,401);assert.equal((await req('B2C_CUSTOMER',initial)).status,403);assert.equal((await req('WAREHOUSE_KEEPER',initial)).status,403);
  assert.equal((await req('CASHIER',initial,{Origin:'https://evil.example'})).status,403);const forged=await fetch(bases[0]+'/api/customers',{method:'POST',headers:{Cookie:`ipek_session=${tokens.CASHIER}`,Authorization:'Bearer forged','Content-Type':'application/json'},body:JSON.stringify(initial)});assert.equal(forged.status,403);
  assert.equal((await req('CASHIER',initial,{'Content-Type':'text/plain'})).status,415);const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(' '.repeat(17000)));c.close();}});assert.equal((await fetch(bases[0]+'/api/customers',{method:'POST',headers:{Authorization:`Bearer ${tokens.CASHIER}`,'Content-Type':'application/json'},body:stream,duplex:'half'})).status,413);
  for(const body of [{...initial,phone:'abc'}, {...initial,phone:'123'}, {...initial,email:'bad'}, {...initial,name:'x'.repeat(121)}, {...initial,city:'x'.repeat(101)}, {...initial,extra:'x'}, {...initial,phone:12345}])assert.equal((await req('CASHIER',body)).status,422);
  for(const body of [{...initial,phone:'+5551112233'},{...initial,email:' SECRET@example.test '}]){const r=await req('CASHIER',body);assert.equal(r.status,409);assert.doesNotMatch(await r.text(),/Özel Müşteri|secret@example|5551112233/);}
  matrix({CASHIER:{pos:true,crm:false,crmWrite:false},WAREHOUSE_KEEPER:{pos:false}});
  const denied=await fetch(bases[0]+'/pos',{headers:{Cookie:`ipek_session=${tokens.WAREHOUSE_KEEPER}`}});const deniedHtml=await denied.text();assert.match(deniedHtml,/POS erişim yetkiniz bulunmuyor/);assert.doesNotMatch(deniedHtml,/Özel Müşteri|555\) 111-2233|gizli adres|gizli not|GIZLIVERGI/);
  const deniedRsc=await fetch(bases[0]+'/pos?_rsc=test',{headers:{Cookie:`ipek_session=${tokens.WAREHOUSE_KEEPER}`,RSC:'1'}});const deniedFlight=await deniedRsc.text();assert.doesNotMatch(deniedFlight,/Özel Müşteri|555\) 111-2233|gizli adres|gizli not|GIZLIVERGI/);
  const allowed=await fetch(bases[0]+'/pos',{headers:{Cookie:`ipek_session=${tokens.CASHIER}`}});const html=await allowed.text();assert.equal(allowed.status,200);assert.doesNotMatch(html,/Özel Müşteri|secret@example\.test|gizli adres|gizli not|GIZLIVERGI/);
  db.exec("CREATE TRIGGER fail_pos_audit BEFORE INSERT ON audit_logs WHEN NEW.action='POS_CUSTOMER_CREATED' BEGIN SELECT RAISE(ABORT,'fail audit'); END");assert.equal((await req('CASHIER',initial)).status,500);assert.equal(db.prepare('SELECT count(*) n FROM customers').get().n,1);db.exec('DROP TRIGGER fail_pos_audit');
  const success=await req('CASHIER',initial);assert.equal(success.status,201);assert.match(success.headers.get('cache-control'),/no-store/);const customer=(await success.json()).data;assert.deepEqual(Object.keys(customer).sort(),['companyName','id','loyaltyPoints','name','phone']);assert.equal(customer.name,'Yeni Müşteri');assert.equal(db.prepare('SELECT city FROM customers WHERE id=?').get(customer.id).city,null);
  const race={name:'Yarış',phone:'5554445566',email:null};const responses=await Promise.all(bases.map(base=>req('CASHIER',race,{},base)));assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);assert.equal(db.prepare("SELECT count(*) n FROM customers WHERE phone='5554445566'").get().n,1);
  // POS and CRM share the same serialized duplicate check.
  const shared={name:'Ortak',phone:'5556667788',email:''};const concurrent=await Promise.all([req('CASHIER',shared,{},bases[0]),fetch(bases[1]+'/api/crm/customers',{method:'POST',headers:{Authorization:`Bearer ${tokens.SUPER_ADMIN}`,'Content-Type':'application/json'},body:JSON.stringify({...shared,city:'',address:'',companyName:''})})]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[201,409]);
  let controller;const slow=new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode(' '));}});const pending=fetch(bases[0]+'/api/customers',{method:'POST',headers:{Authorization:`Bearer ${tokens.CASHIER}`,'Content-Type':'application/json'},body:slow,duplex:'half'});await delay(180);matrix({CASHIER:{pos:false}});controller.enqueue(new TextEncoder().encode(JSON.stringify({name:'Yasak',phone:'5559990099'})));controller.close();assert.equal((await pending).status,403);assert.equal(db.prepare("SELECT count(*) n FROM customers WHERE phone='5559990099'").get().n,0);assert.equal((await req('CASHIER',{name:'X',phone:'5559990099'})).status,403);
  const audit=db.prepare("SELECT * FROM audit_logs WHERE action='POS_CUSTOMER_CREATED'").all();assert.ok(audit.length>=2);assert.doesNotMatch(JSON.stringify(audit),/Yeni Müşteri|5553334455|new@example|gizli adres/);assert.deepEqual(db.pragma('foreign_key_check'),[]);
 }finally{await Promise.all(servers.map(async s=>{if(s.exitCode===null){s.kill('SIGTERM');await new Promise(r=>s.once('exit',r));}}));db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
