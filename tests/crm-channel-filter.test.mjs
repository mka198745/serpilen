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
test('CRM kanal filtresi yalnız doğrudan bağlı siparişleri seçer ve özetleri değiştirmez', {timeout:45000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-channel-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try{
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);db=new Database(file);db.pragma('foreign_keys=ON');
  const add=db.prepare('INSERT INTO customers(id,name,phone,email,city,created_at) VALUES(?,?,?,?,?,?)');for(let id=1;id<=26;id++)add.run(id,`Müşteri ${id}`,`555${String(id).padStart(7,'0')}`,id===5?'guest@example.test':null,id<=2?'Adana':'İzmir',1735689600);
  const order=db.prepare('INSERT INTO orders(order_number,order_type,customer_id,customer_name,customer_email,grand_total,status,payment_status,created_at) VALUES(?,?,?,?,?,?,?,?,?)');
  order.run('1-online','ONLINE_B2C',1,'Bir',null,100,'CANCELLED','PAID',1735689600);order.run('1-pos','POS',1,'Bir',null,200,'DELIVERED','PAID',1735776000);order.run('2-online','ONLINE_B2C',2,'İki',null,50,'DELIVERED','PAID',1735689600);order.run('2-other','API_X',2,'İki',null,30,'DELIVERED','PAID',1735689600);order.run('3-pos','POS',3,'Üç',null,10,'PENDING','PENDING',1735689600);order.run('4-other','B2B',4,'Dört',null,20,'CANCELLED','PAID',1735689600);order.run('guest','ONLINE_B2C',null,'Müşteri 5','guest@example.test',1000,'PAID','PAID',1735689600);for(let id=6;id<=26;id++)order.run(`bulk${id}`,'ONLINE_B2C',id,'M',null,1,'PENDING','PENDING',1735689600);
  const tag=db.prepare("INSERT INTO crm_tags(name,normalized_name) VALUES('Test','test')").run().lastInsertRowid;db.prepare('INSERT INTO crm_customer_tags(customer_id,tag_id) VALUES(1,?)').run(tag);
  const tokens={};for(const role of ['SUPER_ADMIN','CASHIER','B2C_CUSTOMER']){const id=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(role,`${role}@example.test`,'hash',role).lastInsertRowid;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  db.prepare("INSERT INTO users(name,email,password_hash,role,customer_id) VALUES('Web','web@example.test','hash','B2C_CUSTOMER',1)").run();
  const index=db.prepare("EXPLAIN QUERY PLAN SELECT 1 FROM orders WHERE customer_id=? AND order_type='POS' LIMIT 1").all(1).map(x=>x.detail).join(' ');assert.match(index,/orders_customer_created_idx/);
  const tables=['customers','orders','users','crm_customer_tags'];const snapshot=()=>Object.fromEntries(tables.map(t=>[t,db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));const before=snapshot();
  const port=await freePort();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${port}`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/crm/customers');ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const get=(q,role='SUPER_ADMIN')=>fetch(base+'/api/crm/customers?'+q,{headers:role?{Authorization:`Bearer ${tokens[role]}`}:{}});
  assert.equal((await get('channel=online',null)).status,401);assert.equal((await get('channel=online','CASHIER')).status,403);assert.equal((await get('channel=online','B2C_CUSTOMER')).status,403);for(const q of ['channel=ONLINE','channel=foo','channel=online%27%20OR%201%3D1--'])assert.equal((await get(q)).status,422);
  const first=await get('channel=online');assert.match(first.headers.get('cache-control'),/no-store/);const a=await first.json();assert.equal(a.pagination.total,23);assert.equal(a.data.length,20);assert.equal(a.metrics.customerCount,23);assert.equal(a.metrics.paidOrderCount,3);assert.equal(a.metrics.paidOrderTotal,280);assert.equal(a.metrics.averagePaidOrder,280/3);
  assert.deepEqual((await(await get('channel=online&page=2')).json()).data.map(x=>x.id),[6,2,1]);assert.deepEqual((await(await get('channel=pos')).json()).data.map(x=>x.id),[3,1]);assert.deepEqual((await(await get('channel=both')).json()).data.map(x=>x.id),[1]);assert.deepEqual((await(await get('channel=other')).json()).data.map(x=>x.id),[4,2]);assert.deepEqual((await(await get('channel=none')).json()).data.map(x=>x.id),[5]);
  // Both filters can be satisfied by different orders: the online order is cancelled, the POS order paid.
  const combined=await(await get(`channel=online&purchase=once&membership=linked&city=Adana&tag=${tag}&lastPaidFrom=2025-01-02&lastPaidTo=2025-01-02&q=M%C3%BC%C5%9Fteri`)).json();assert.deepEqual(combined.data.map(x=>x.id),[1]);assert.equal(combined.metrics.paidOrderTotal,200);assert.equal(combined.data[0].orderCount,2);
  const noPaid=await(await get('channel=pos&purchase=none')).json();assert.deepEqual(noPaid.data.map(x=>x.id),[3]);assert.deepEqual((await(await get('channel=none&purchase=once')).json()).data,[]);
  db.prepare("INSERT INTO app_settings(key,value) VALUES('admin.role_matrix',?)").run(JSON.stringify({CASHIER:{crm:true,crmWrite:false}}));assert.equal((await get('channel=both','CASHIER')).status,200);assert.deepEqual(snapshot(),before);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
