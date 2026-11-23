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
async function port(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const p=server.address().port;await new Promise(r=>server.close(r));return p;}

test('Müşteri analizleri ve kârlılık satırları yetkiye ve önbelleğe rağmen ayrılır', {timeout:35000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-intel-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try{
  const m=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(m.status,0,m.stderr);db=new Database(file);
  db.exec("INSERT INTO customers(id,name,phone,email) VALUES(1,'Gizli Müşteri','5551234567','secret@example.test'); INSERT INTO orders(id,order_number,customer_id,customer_name,customer_email,customer_phone,grand_total,subtotal) VALUES(1,'GIZLI-SIPARIS-1',1,'Gizli Müşteri','secret@example.test','5551234567',120,120),(2,'GIZLI-MISAFIR-2',NULL,'Gizli Misafir','guest@example.test','5559999988',80,80); INSERT INTO order_items(order_id,product_id,product_name,sku,unit_price,quantity,total_price) VALUES(1,1,'İplik','IT-1',120,1,120),(2,1,'İplik','IT-1',80,1,80)");
  const before={customers:db.prepare('SELECT * FROM customers').all(),orders:db.prepare('SELECT * FROM orders').all(),items:db.prepare('SELECT * FROM order_items').all()};const tokens={};
  for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER','B2C_CUSTOMER']){const id=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(role,`${role}@example.test`,'hash',role).lastInsertRowid;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  const p=await port();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(p),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${p}`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/intelligence/customers/rfm');ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const routes=['/api/intelligence/customers/rfm','/api/intelligence/customers/cohorts','/api/intelligence/profitability'];const req=(role,url)=>fetch(base+url,{headers:role?{Authorization:`Bearer ${tokens[role]}`}:{}});
  const matrix=async(value)=>{const r=await fetch(base+'/api/role-matrix',{method:'POST',headers:{Authorization:`Bearer ${tokens.SUPER_ADMIN}`,'Content-Type':'application/json'},body:JSON.stringify({matrix:value})});assert.equal(r.status,200);};
  for(const route of routes){assert.equal((await req(null,route)).status,401);assert.equal((await req('B2C_CUSTOMER',route)).status,403);assert.equal((await req('CASHIER',route)).status,403);}
  // Warm shared caches with privileged results first.
  const rfm=await req('SUPER_ADMIN',routes[0]);assert.equal(rfm.status,200);assert.match(rfm.headers.get('cache-control'),/no-store/);assert.equal((await rfm.json()).data.rows[0].customerName,'Gizli Müşteri');
  const cohort=await req('SUPER_ADMIN',routes[1]);assert.equal(cohort.status,200);assert.match(cohort.headers.get('cache-control'),/no-store/);
  const privileged=await(await req('SUPER_ADMIN',routes[2])).json();assert.ok(privileged.data.levels.customer.some(r=>r.label==='Gizli Müşteri'));assert.ok(privileged.data.levels.order.some(r=>r.label.includes('GIZLI-SIPARIS-1')));
  await matrix({CASHIER:{intelligence:true,crm:false,orders:false}});
  for(const route of routes.slice(0,2)){const r=await req('CASHIER',route);assert.equal(r.status,403);assert.match(r.headers.get('cache-control'),/no-store/);assert.match((await r.json()).error.message,/CRM/);}
  const safeRes=await req('CASHIER',routes[2]);assert.equal(safeRes.status,200);assert.match(safeRes.headers.get('cache-control'),/no-store/);const safe=await safeRes.json();assert.equal(safe.data.levels.customer,null);assert.equal(safe.data.levels.order,null);assert.ok(safe.data.levels.product.length>0);assert.doesNotMatch(JSON.stringify(safe),/Gizli Müşteri|Gizli Misafir|GIZLI-SIPARIS-1|GIZLI-MISAFIR-2|secret@example\.test|5551234567/);
  // Redaction must not mutate the cached version for the authorized user.
  const again=await(await req('SUPER_ADMIN',routes[2])).json();assert.ok(again.data.levels.customer.some(r=>r.label==='Gizli Müşteri'));assert.ok(again.data.levels.order.some(r=>r.label.includes('GIZLI-SIPARIS-1')));
  await matrix({CASHIER:{intelligence:true,crm:true,crmWrite:false,orders:false}});assert.equal((await req('CASHIER',routes[0])).status,200);assert.equal((await req('CASHIER',routes[1])).status,200);const crmOnly=(await(await req('CASHIER',routes[2])).json()).data;assert.ok(crmOnly.levels.customer.some(r=>r.label==='Gizli Müşteri'));assert.equal(crmOnly.levels.order,null);assert.doesNotMatch(JSON.stringify(crmOnly),/Gizli Misafir|walkin-2|GIZLI-MISAFIR-2/);
  await matrix({CASHIER:{intelligence:true,crm:false,orders:true}});const ordersOnly=(await(await req('CASHIER',routes[2])).json()).data;assert.equal(ordersOnly.levels.customer,null);assert.ok(ordersOnly.levels.order.some(r=>r.label.includes('GIZLI-SIPARIS-1')));assert.equal((await req('CASHIER',routes[0])).status,403);
  await matrix({CASHIER:{intelligence:false,crm:true,orders:true}});for(const route of routes)assert.equal((await req('CASHIER',route)).status,403);
  assert.deepEqual(db.prepare('SELECT * FROM customers').all(),before.customers);assert.deepEqual(db.prepare('SELECT * FROM orders').all(),before.orders);assert.deepEqual(db.prepare('SELECT * FROM order_items').all(),before.items);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
