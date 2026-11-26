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

test('CRM sipariş ürünleri müşteriye bağlı, sayfalı ve denetim kaydıyla korunur', {timeout:40000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-items-')),file=path.join(dir,'db.sqlite'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try{
  const m=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(m.status,0,m.stderr);db=new Database(file);
  db.exec("INSERT INTO customers(id,name,phone) VALUES(1,'A','5551234567'),(2,'B','5557654321'); INSERT INTO orders(id,order_number,customer_id,customer_name) VALUES(1,'SIP-1',1,'A'),(2,'SIP-2',1,'A'),(3,'B-SECRET',2,'B'),(4,'GUEST',NULL,'A')");
  const ins=db.prepare('INSERT INTO order_items(order_id,product_id,product_name,sku,unit_price,quantity,total_price) VALUES(?,1,?,\'SKU\',2,1,2)');
  db.transaction(()=>{for(let i=1;i<=251;i++)ins.run(1,`Ürün ${i}`);for(let i=1;i<=200;i++)ins.run(2,`İkinci ${i}`);ins.run(3,'GİZLİ DİĞER');ins.run(4,'GİZLİ MİSAFİR')})();
  const tokens={};for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER','B2C_CUSTOMER']){const id=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(role,`${role}@example.test`,'hash',role).lastInsertRowid;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  const p=await port();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(p),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${p}`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/crm/customers');ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const get=(url,role='SUPER_ADMIN')=>fetch(base+url,{headers:role?{Authorization:`Bearer ${tokens[role]}`}:{}});
  const root='/api/crm/customers/1/orders',items=root+'/1/items';
  assert.equal((await get(items,null)).status,401);assert.equal((await get(items,'CASHIER')).status,403);assert.equal((await get(items,'B2C_CUSTOMER')).status,403);
  for(const url of [root+'/3/items',root+'/4/items','/api/crm/customers/2/orders/1/items',root+'/999/items'])assert.equal((await get(url)).status,404,url);
  for(const url of [root+'/x/items',root+'/1/items?page=0',root+'/1/items?page=1000000','/api/crm/customers/0/orders/1/items'])assert.equal((await get(url)).status,422,url);
  const list=await(await get(root)).json();assert.equal(list.data.length,2);const large=list.data.find(o=>o.id===1),exact=list.data.find(o=>o.id===2);assert.equal(large.items.length,200);assert.equal(large.items.at(-1).productName,'Ürün 200');assert.equal(large.hasMoreItems,true);assert.equal(exact.items.length,200);assert.equal(exact.hasMoreItems,false);assert.doesNotMatch(JSON.stringify(list),/GİZLİ/);
  const response=await get(items+'?page=5');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);const page5=await response.json();assert.equal(page5.data.length,50);assert.equal(page5.data[0].productName,'Ürün 201');assert.equal(page5.data.at(-1).productName,'Ürün 250');assert.equal(page5.pagination.hasMore,true);
  const page6=await(await get(items+'?page=6')).json();assert.equal(page6.data.length,1);assert.equal(page6.data[0].productName,'Ürün 251');assert.equal(page6.pagination.hasMore,false);assert.equal((await(await get(items+'?page=7')).json()).data.length,0);
  assert.equal((await get(items+'?page=5','STORE_MANAGER')).status,200);
  const logs=db.prepare("SELECT action,entity_id,details FROM audit_logs WHERE action IN ('CRM_ORDERS_VIEW','CRM_TIMELINE_VIEW','CRM_ORDER_ITEMS_VIEW')").all();assert.ok(logs.length>=5);assert.doesNotMatch(JSON.stringify(logs),/Ürün|SIP-1|GİZLİ/);
  for(const [action,url] of [['CRM_ORDERS_VIEW',root],['CRM_TIMELINE_VIEW','/api/crm/customers/1/timeline?actor=secret'],['CRM_ORDER_ITEMS_VIEW',items+'?page=5']]){
   db.exec(`CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs WHEN NEW.action='${action}' BEGIN SELECT RAISE(ABORT,'test'); END`);const failed=await get(url);assert.equal(failed.status,500);assert.doesNotMatch(JSON.stringify(await failed.json()),/Ürün 201|SIP-1/);db.exec('DROP TRIGGER fail_audit');
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_items').get().n,453);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
