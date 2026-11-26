import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import Database from 'better-sqlite3';
async function freePort(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const p=server.address().port;await new Promise(r=>server.close(r));return p;}

test('Müşteri raporu ve CSV için rapor ve CRM izinleri birlikte gerekir', {timeout:30000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-report-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try{
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);db=new Database(file);
  db.exec("INSERT INTO customers(id,name,phone,email,loyalty_points,segment) VALUES(1,'Gizli Müşteri','5551234567','secret@example.test',123,'VIP'); INSERT INTO orders(order_number,customer_id,customer_name,customer_email,customer_phone,grand_total,subtotal) VALUES('TEST-ORD',1,'Gizli Müşteri','secret@example.test','5551234567',1500,1500)");
  const customerBefore=db.prepare('SELECT * FROM customers').all(),ordersBefore=db.prepare('SELECT * FROM orders').all();const tokens={};
  for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER','B2C_CUSTOMER']){const id=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(role,`${role}@example.test`,'hash',role).lastInsertRowid;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  const port=await freePort();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${port}`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/reports');ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const request=(role,url='/api/reports')=>fetch(base+url,{headers:role?{Authorization:`Bearer ${tokens[role]}`}:{}});
  const matrix=async(value)=>{const r=await fetch(base+'/api/role-matrix',{method:'POST',headers:{Authorization:`Bearer ${tokens.SUPER_ADMIN}`,'Content-Type':'application/json'},body:JSON.stringify({matrix:value})});assert.equal(r.status,200);};
  assert.equal((await request(null)).status,401);assert.equal((await request('B2C_CUSTOMER')).status,403);
  for(const role of ['SUPER_ADMIN','STORE_MANAGER']){const r=await request(role);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);const json=await r.json();assert.equal(json.customers.total,1);assert.equal(json.customers.top[0].name,'Gizli Müşteri');assert.equal(json.customers.top[0].phone,'5551234567');assert.equal(json.sales.revenue,1500);const csv=await request(role,'/api/reports?format=csv&export=customers');assert.equal(csv.status,200);assert.match(csv.headers.get('cache-control'),/no-store/);assert.match(await csv.text(),/Gizli Müşteri;B2C;VIP;5551234567/);}
  await matrix({CASHIER:{reports:true,crm:false},STORE_MANAGER:{reports:false,crm:true}});
  const r=await request('CASHIER');assert.equal(r.status,200);const limited=await r.json();assert.equal(limited.customers,null);assert.equal(limited.sales.revenue,1500);assert.doesNotMatch(JSON.stringify(limited),/Gizli Müşteri|5551234567|secret@example\.test|TEST-ORD/);
  for(const type of ['sales','products','stock','finance']){const csv=await request('CASHIER',`/api/reports?format=csv&export=${type}`);assert.equal(csv.status,200);assert.doesNotMatch(await csv.text(),/Gizli Müşteri|5551234567|secret@example\.test/);}
  const forbidden=await request('CASHIER','/api/reports?format=csv&export=customers');assert.equal(forbidden.status,403);assert.match((await forbidden.json()).error.message,/CRM/);assert.equal((await request('STORE_MANAGER')).status,403);assert.equal((await request('STORE_MANAGER','/api/reports?format=csv&export=customers')).status,403);
  await matrix({CASHIER:{reports:true,crm:true,crmWrite:false}});assert.equal((await(await request('CASHIER')).json()).customers.top[0].name,'Gizli Müşteri');assert.equal((await request('CASHIER','/api/reports?format=csv&export=customers')).status,200);
  await matrix({CASHIER:{reports:true,crm:false}});assert.equal((await(await request('CASHIER')).json()).customers,null);assert.equal((await request('CASHIER','/api/reports?format=csv&export=customers')).status,403);
  assert.deepEqual(db.prepare('SELECT * FROM customers').all(),customerBefore);assert.deepEqual(db.prepare('SELECT * FROM orders').all(),ordersBefore);
  // No customer table read should occur when CRM permission is absent (disposable DB only).
  db.exec('DROP TABLE customers');assert.equal((await request('CASHIER')).status,200);assert.equal((await request('CASHIER','/api/reports?format=csv&export=customers')).status,403);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
