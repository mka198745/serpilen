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
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}

test('Son ödenmiş siparişin UTC oluşturulma günü filtrelenir ve özetler tüm zamanlarda kalır', {timeout:40000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-last-paid-')),file=path.join(dir,'db.sqlite'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let server,db;
 try {
  const migrate=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migrate.status,0,migrate.stderr);db=new Database(file);
  const user=db.prepare('INSERT INTO users(name,email,password_hash,role,customer_id) VALUES(?,?,?,?,?)');const ids={};
  for(const role of ['SUPER_ADMIN','CASHIER','B2C_CUSTOMER'])ids[role]=user.run(role,`${role}@example.test`,'hash',role,null).lastInsertRowid;
  const tokens={};for(const role of Object.keys(ids)){const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES (?,?,?)').run(ids[role],crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  const cust=db.prepare('INSERT INTO customers(id,name,phone,city,created_at) VALUES(?,?,?,?,?)');for(let id=1;id<=28;id++)cust.run(id,`Müşteri ${id}`,`555${String(id).padStart(7,'0')}`,id===1?'Adana':'İzmir',1735689600);
  user.run('Web','web@example.test','hash','B2C_CUSTOMER',1);
  const tag=db.prepare("INSERT INTO crm_tags(name,normalized_name) VALUES ('VIP','vip')").run().lastInsertRowid;db.prepare('INSERT INTO crm_customer_tags(customer_id,tag_id) VALUES(?,?)').run(1,tag);
  const ins=db.prepare('INSERT INTO orders(order_number,customer_id,customer_name,grand_total,status,payment_status,created_at) VALUES(?,?,?,?,?,?,?)');
  const t=1735689600; // 2025-01-01 00:00:00 UTC
  ins.run('older',1,'A',100,'PAID','PAID',t-86400);ins.run('latest',1,'A',200,'DELIVERED','PAID',t+86399);
  ins.run('later-cancel',1,'A',999,'CANCELLED','PAID',t+86400);ins.run('later-pending',1,'A',999,'PENDING','PENDING',t+86401);
  ins.run('midnight',2,'B',50,'PAID','PAID',t+86400);ins.run('older-match',2,'B',20,'PAID','PAID',t);
  ins.run('returned',3,'C',999,'RETURNED','PAID',t);ins.run('refunded',4,'D',999,'REFUNDED','PAID',t);ins.run('cancelled',5,'E',999,'CANCELLED','PAID',t);ins.run('unpaid',6,'F',999,'PAID','PENDING',t);ins.run('guest',null,'A',999,'PAID','PAID',t);
  for(let id=7;id<=27;id++)ins.run(`bulk${id}`,id,`C${id}`,1,id===7?'RETURN_REQUESTED':'PAID','PAID',t);
  db.prepare("INSERT INTO order_returns(return_number,order_id,order_number,status,refund_amount) SELECT 'PARTIAL',id,order_number,'REFUNDED',20 FROM orders WHERE order_number='latest'").run();
  const plan=db.prepare("EXPLAIN QUERY PLAN SELECT created_at FROM orders WHERE customer_id=? AND payment_status='PAID' AND status NOT IN ('CANCELLED','REFUNDED','RETURNED') ORDER BY created_at DESC,id DESC LIMIT 1").all(1).map(x=>x.detail).join(' ');assert.match(plan,/orders_customer_created_idx/);
  const p=await port();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(p),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${p}`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/crm/customers');ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const get=(q,role='SUPER_ADMIN')=>fetch(base+'/api/crm/customers?'+q,{headers:role?{Authorization:`Bearer ${tokens[role]}`}:{}});
  assert.equal((await get('lastPaidFrom=2025-01-01',null)).status,401);assert.equal((await get('lastPaidTo=2025-01-01','CASHIER')).status,403);assert.equal((await get('lastPaidTo=2025-01-01','B2C_CUSTOMER')).status,403);
  for(const q of ['lastPaidFrom=2025-02-30','lastPaidTo=2025-13-01','lastPaidFrom=2025-01-02&lastPaidTo=2025-01-01','lastPaidTo=2025-01-01%27%20OR%201%3D1--'])assert.equal((await get(q)).status,422,q);
  const query='lastPaidFrom=2025-01-01&lastPaidTo=2025-01-01';let res=await get(query);assert.match(res.headers.get('cache-control'),/no-store/);let data=await res.json();assert.equal(data.pagination.total,22);assert.equal(data.data.length,20);assert.equal(data.metrics.customerCount,22);assert.equal(data.metrics.paidOrderCount,23);assert.equal(data.metrics.paidOrderTotal,321);
  const page2=await(await get(query+'&page=2')).json();assert.deepEqual(page2.data.map(x=>x.id),[7,1]);assert.equal(page2.data[1].lastPaidOrderAt,t+86399);assert.equal(page2.data[1].lastOrderAt,t+86401);
  const next=await(await get('lastPaidFrom=2025-01-02&lastPaidTo=2025-01-02')).json();assert.deepEqual(next.data.map(x=>x.id),[2]);assert.equal(next.data[0].lastPaidOrderAt,t+86400);assert.equal(next.metrics.paidOrderTotal,70);
  assert.equal((await(await get('lastPaidTo=2024-12-31')).json()).pagination.total,0);assert.equal((await(await get('lastPaidFrom=2025-01-02')).json()).pagination.total,1);
  assert.equal((await(await get(query+'&purchase=none')).json()).pagination.total,0);
  const combine=await(await get(query+`&city=Adana&createdFrom=2025-01-01&createdTo=2025-01-01&tag=${tag}&membership=linked&purchase=repeat&q=M%C3%BC%C5%9Fteri`)).json();assert.deepEqual(combine.data.map(x=>x.id),[1]);assert.equal(combine.metrics.paidOrderCount,2);assert.equal(combine.metrics.paidOrderTotal,300);
  const noPaid=await(await get('q=3&purchase=none')).json();const customer3=noPaid.data.find(x=>x.id===3);assert.ok(customer3);assert.equal(customer3.lastPaidOrderAt,null);assert.equal(customer3.lastOrderAt,t);
  db.prepare("UPDATE orders SET status='REFUNDED' WHERE order_number='latest'").run();
  const after=await(await get(query+'&city=Adana')).json();assert.equal(after.pagination.total,0);const earlier=await(await get('lastPaidTo=2024-12-31&city=Adana')).json();assert.deepEqual(earlier.data.map(x=>x.id),[1]);assert.equal(earlier.data[0].lastPaidOrderAt,t-86400);assert.equal(earlier.metrics.paidOrderTotal,100);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
