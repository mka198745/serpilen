import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import Database from 'better-sqlite3';

async function freePort(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}
test('CRM müşteri sorguları gerçek veriler, yetki, sayfalama ve audit ile korunur', {timeout:30000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'serpilen-crm-')), dbPath=path.join(dir,'test.db'); let server;
 try {
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env:{...process.env,DATABASE_URL:`sqlite:${dbPath}`},encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);
  const db=new Database(dbPath);
  assert.ok(db.prepare("PRAGMA index_list('orders')").all().some(index => index.name === 'orders_customer_created_idx'));
  assert.match(db.prepare('EXPLAIN QUERY PLAN SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT 100').all(1).map(row => row.detail).join(' '), /orders_customer_created_idx/);
  const addCustomer=db.prepare('INSERT INTO customers (name,phone,email,city) VALUES (?,?,?,?)');
  for(let i=1;i<=23;i++) addCustomer.run(i===1?'Özel Müşteri':`Müşteri ${i}`,`555000${i}`,`crm${i}@example.test`,'Adana');
  const order=db.prepare(`INSERT INTO orders (order_number, customer_id, customer_name, status, payment_status, grand_total) VALUES (?,?,?,?,?,?)`);
  order.run('ORD-1',1,'Özel Müşteri','PAID','PAID','100');order.run('ORD-2',1,'Özel Müşteri','CANCELLED','PAID','50');order.run('ORD-3',1,'Özel Müşteri','PENDING','PENDING','40');order.run('GUEST',null,'Özel Müşteri','PAID','PAID','999');
  const tokens={};const addUser=db.prepare('INSERT INTO users (email,password_hash,name,role) VALUES (?,?,?,?)');const addSession=db.prepare('INSERT INTO admin_sessions (user_id,jti,expires_at) VALUES (?,?,?)');
  for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER','B2C_CUSTOMER']) {const id=addUser.run(`${role}@example.test`,'hash',role,role).lastInsertRowid;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;addSession.run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}db.close();
  const port=await freePort();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...process.env,DATABASE_URL:`sqlite:${dbPath}`,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${port}`;
  let ready=false;for(let i=0;i<100;i++){if(server.exitCode!==null) throw new Error('Sunucu kapandı');try{await fetch(base+'/api/crm/customers');ready=true;break;}catch{await delay(100);}}assert.ok(ready);
  const req=(p,role,method='GET',body)=>fetch(base+p,{method,headers:{...(role?{Authorization:`Bearer ${tokens[role]}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  for(const p of ['/api/crm/customers','/api/crm/customers/1']){assert.equal((await req(p)).status,401);assert.equal((await req(p,'CASHIER')).status,403);assert.equal((await req(p,'B2C_CUSTOMER')).status,403);assert.equal((await req(p,'STORE_MANAGER')).status,200);}
  let res=await req('/api/crm/customers','SUPER_ADMIN');assert.match(res.headers.get('cache-control'),/no-store/);let json=await res.json();assert.equal(json.pagination.total,23);assert.equal(json.data.length,20);
  json=await (await req('/api/crm/customers?page=2','SUPER_ADMIN')).json();assert.equal(json.data.length,3);assert.equal(json.data.find(x=>x.id===1).orderCount,3);assert.equal(json.data.find(x=>x.id===1).paidOrderTotal,100);
  json=await (await req('/api/crm/customers?q=crm1%40example.test','SUPER_ADMIN')).json();assert.equal(json.pagination.total,1);assert.equal(json.data[0].id,1);
  json=await (await req('/api/crm/customers?q=%25','SUPER_ADMIN')).json();assert.equal(json.pagination.total,0);
  assert.equal((await req('/api/crm/customers?page=0','SUPER_ADMIN')).status,422);assert.equal((await req('/api/crm/customers/abc','SUPER_ADMIN')).status,422);assert.equal((await req('/api/crm/customers/999','SUPER_ADMIN')).status,404);
  json=await (await req('/api/crm/customers/1','SUPER_ADMIN')).json();assert.equal(json.data.orders.length,3);assert.equal(json.data.summary.orderCount,3);assert.equal(json.data.summary.paidOrderTotal,100);assert.ok(!json.data.orders.some(o=>o.orderNumber==='GUEST'));
  assert.equal((await req('/api/role-matrix','SUPER_ADMIN','POST',{matrix:{STORE_MANAGER:{crm:false}}})).status,200);assert.equal((await req('/api/crm/customers','STORE_MANAGER')).status,403);assert.equal((await req('/api/crm/customers/1','STORE_MANAGER')).status,403);
  const verify=new Database(dbPath,{readonly:true});assert.ok(verify.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='CRM_CUSTOMER_VIEW' AND entity_id='1'").get().n>=1);verify.close();
 } finally {if(server && server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}fs.rmSync(dir,{recursive:true,force:true});}
});
