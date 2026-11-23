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

test('Kimlik ve kanal bağlantıları yalnız gerçek müşteri kimliğiyle sayılır', {timeout:30000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-identity-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try {
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);db=new Database(file);
  db.exec("INSERT INTO customers(id,name,phone,email) VALUES(1,'Ana Kart','5551234567','customer@example.test'),(2,'Diğer','5551234567','other@example.test'),(3,'Boş','5559876543','empty@example.test')");
  const user=db.prepare('INSERT INTO users(email,password_hash,name,role,customer_id,is_active) VALUES(?,?,?,?,?,?)');for(const [email,role,id,active] of [['one@example.test','B2C_CUSTOMER',1,1],['two@example.test','B2C_CUSTOMER',1,0],['unknown@example.test','B2C_CUSTOMER',1,2],['staff-link@example.test','CASHIER',1,1],['other@example.test','B2C_CUSTOMER',2,1],['customer@example.test','B2C_CUSTOMER',null,1]])user.run(email,'secret-hash',email,role,id,active);
  db.exec("INSERT INTO orders(order_number,customer_id,customer_name,order_type,status,payment_status) VALUES('ONLINE-OK',1,'Ana Kart','ONLINE_B2C','PAID','PAID'),('ONLINE-CANCEL',1,'Ana Kart','ONLINE_B2C','CANCELLED','PAID'),('POS-1',1,'Ana Kart','POS','PAID','PAID'),('OTHER',1,'Ana Kart','OTHER','PENDING','PENDING'),('GUEST',NULL,'Ana Kart','POS','PAID','PAID'),('OTHER-CARD',2,'Diğer','POS','PAID','PAID')");
  const tokens={};for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER','B2C_CUSTOMER']){const id=user.run(`${role}@example.test`,'hash',role,role,null,1).lastInsertRowid;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  const snap=()=>({customers:db.prepare('SELECT * FROM customers').all(),users:db.prepare('SELECT * FROM users').all(),orders:db.prepare('SELECT * FROM orders').all()});const before=snap();
  const p=await port();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(p),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${p}`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/crm/customers');ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const req=(role,id=1)=>fetch(`${base}/api/crm/customers/${id}`,{headers:role?{Authorization:`Bearer ${tokens[role]}`}:{}});
  assert.equal((await req(null)).status,401);assert.equal((await req('CASHIER')).status,403);assert.equal((await req('B2C_CUSTOMER')).status,403);assert.equal((await req('SUPER_ADMIN','invalid')).status,422);assert.equal((await req('SUPER_ADMIN',999)).status,404);
  const r=await req('SUPER_ADMIN');assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);const json=await r.json();assert.deepEqual(json.data.identityLinks,{activeWebAccounts:1,inactiveWebAccounts:1,unknownWebAccounts:1,otherRoleAccounts:1,onlineOrders:2,posOrders:1,otherOrders:1});assert.doesNotMatch(JSON.stringify(json.data.identityLinks),/example\.test|5551234567|secret-hash|GUEST/);assert.equal(json.data.summary.orderCount,4);
  const empty=(await(await req('SUPER_ADMIN',3)).json()).data.identityLinks;assert.ok(Object.values(empty).every(value=>value===0));const other=(await(await req('SUPER_ADMIN',2)).json()).data.identityLinks;assert.equal(other.activeWebAccounts,1);assert.equal(other.posOrders,1);assert.equal(other.onlineOrders,0);
  const update=await fetch(base+'/api/role-matrix',{method:'POST',headers:{Authorization:`Bearer ${tokens.SUPER_ADMIN}`,'Content-Type':'application/json'},body:JSON.stringify({matrix:{STORE_MANAGER:{crm:true,crmWrite:false,registeredCustomers:false,orders:false}}})});assert.equal(update.status,200);const readonly=await req('STORE_MANAGER');assert.equal(readonly.status,200);assert.deepEqual((await readonly.json()).data.identityLinks,json.data.identityLinks);
  const audits=db.prepare("SELECT user_id,entity_id,details FROM audit_logs WHERE action='CRM_CUSTOMER_VIEW'").all();assert.ok(audits.length>=4);assert.doesNotMatch(JSON.stringify(audits),/5551234567|customer@example\.test|one@example\.test/);
  db.exec("CREATE TRIGGER fail_view_audit BEFORE INSERT ON audit_logs WHEN NEW.action='CRM_CUSTOMER_VIEW' BEGIN SELECT RAISE(ABORT,'audit failure'); END");assert.equal((await req('SUPER_ADMIN')).status,500);db.exec('DROP TRIGGER fail_view_audit');
  assert.deepEqual(snap(),before);assert.match(db.prepare("EXPLAIN QUERY PLAN SELECT COUNT(*) FROM users WHERE customer_id=? AND role='B2C_CUSTOMER'").all(1).map(x=>x.detail).join(' '),/users_customer_role_idx/);assert.match(db.prepare('EXPLAIN QUERY PLAN SELECT COUNT(*) FROM orders WHERE customer_id=?').all(1).map(x=>x.detail).join(' '),/orders_customer_created_idx/);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
