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

test('Silinmiş iade koruması eşzamanlı yeni iade isteğine karşı atomiktir', {timeout:60000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'refund-race-')),file=path.join(dir,'db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try {
  const m=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(m.status,0,m.stderr);
  db=new Database(file);db.pragma('foreign_keys=ON');db.exec("INSERT INTO categories(id,name,slug) VALUES(1,'Kategori','kat'); INSERT INTO warehouses(id,name,code) VALUES(2,'Mağaza','M'); INSERT INTO app_settings(key,value) VALUES('sales.shared_warehouse_id','2'); INSERT INTO users(id,name,email,password_hash,role) VALUES(1,'Admin','a@example.test','hash','SUPER_ADMIN'); INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(1,'A','a','a',1,10); INSERT INTO orders(id,order_number,order_type,customer_name,status,payment_status,payment_method,grand_total) VALUES(1,'ORDER-1','ONLINE_B2C','Test','DELIVERED','PAID','EFT_HAVALE',20); INSERT INTO order_items(id,order_id,product_id,product_name,sku,unit_price,quantity,total_price) VALUES(1,1,1,'A','a',10,3,30); INSERT INTO order_returns(id,return_number,order_id,order_number,status,refund_amount,restock,warehouse_id) VALUES(1,'RETURN-1',1,'ORDER-1','RECEIVED',6.67,0,2); INSERT INTO order_return_items(return_id,order_item_id,product_id,product_name,quantity,refund_amount) VALUES(1,1,1,'A',1,6.67); UPDATE order_returns SET status='REFUNDED' WHERE id=1");
  const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(1,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);
  const p=await port();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(p),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${p}`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/health');ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const create=qty=>fetch(base+'/api/returns',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'CREATE',orderId:1,warehouseId:2,restock:false,items:[{orderItemId:1,quantity:qty}]})});
  // Model the eventual deletion operation holding a real write lock. The API
  // must see the committed fence and cannot reallocate the already-refunded unit.
  db.exec("BEGIN IMMEDIATE; INSERT INTO deleted_refund_guards(return_id,order_id,refund_cents) VALUES(1,1,667); INSERT INTO deleted_refund_guard_items(return_id,order_item_id,quantity,refund_cents) VALUES(1,1,1,667); DELETE FROM order_returns WHERE id=1; DELETE FROM order_return_items WHERE return_id=1");
  const pending=create(3);assert.equal(await Promise.race([pending.then(()=>false),delay(200).then(()=>true)]),true);db.exec('COMMIT');
  const denied=await pending;assert.equal(denied.status,409,await denied.clone().text());assert.match((await denied.json()).error.message,/aşıyor/);
  const valid=await create(2);assert.equal(valid.status,200,await valid.clone().text());assert.equal((await valid.json()).data.refundAmount,'13.33');
  assert.equal(db.prepare('SELECT count(*) n FROM deleted_refund_guards').get().n,1);assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
