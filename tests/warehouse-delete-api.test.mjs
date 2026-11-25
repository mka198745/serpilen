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

async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('Empty warehouses delete atomically; references, system warehouses and future writes are protected', {timeout:60000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'warehouse-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try {
  const m=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(m.status,0,m.stderr);
  db=new Database(file);db.pragma('foreign_keys=ON');
  db.exec("INSERT INTO warehouses(id,name,code,type) VALUES(1,'Merkez','MRK','CENTRAL'),(2,'Mağaza','STR','STORE'),(3,'Online','ONL','ONLINE'),(4,'Başka','OTH','STORE'); INSERT INTO warehouse_locations(warehouse_id,location_code) VALUES(1,'A'),(1,'B'),(1,'C');");
  function session(role){const id=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(role,`${role}@test.example`,'hash',role).lastInsertRowid;const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);return token;}
  const admin=session('SUPER_ADMIN'),cashier=session('CASHIER');const port=await freePort();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${port}`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/health');ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const call=(path,method='DELETE',token=admin,body,extra={})=>fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await call('/api/warehouses?id=1','DELETE',cashier)).status,403);
  assert.equal((await call('/api/warehouses?id=1','DELETE',admin,undefined,{Origin:'https://evil.example'})).status,403);
  for(const id of [2,3]){let r=await call(`/api/warehouses?id=${id}`);assert.equal(r.status,409);assert.equal((await r.json()).error.code,'SYSTEM_WAREHOUSE');r=await call('/api/warehouses','PATCH',admin,{id,isActive:false});assert.equal(r.status,409);}
  for(const sql of ["INSERT INTO inventory(warehouse_id,product_id,physical_qty) VALUES(1,99,0)","INSERT INTO inventory_ledger(warehouse_id,product_id,transaction_type,quantity) VALUES(1,99,'ADJUSTMENT',0)","INSERT INTO inventory_reservations(warehouse_id,product_id,qty,expires_at) VALUES(1,99,1,unixepoch())","INSERT INTO stock_count_sessions(count_number,warehouse_id) VALUES('C1',1)","INSERT INTO stock_transfers(transfer_number,from_warehouse_id,to_warehouse_id) VALUES('T1',2,1)","INSERT INTO stock_transfers(transfer_number,from_warehouse_id,to_warehouse_id) VALUES('T2',1,2)"]){
   const table=/INSERT INTO (\w+)/.exec(sql)[1];db.exec(sql);const r=await call('/api/warehouses?id=1');assert.equal(r.status,409,table);assert.equal((await r.json()).error.code,'HAS_REFERENCES');assert.equal(db.prepare('SELECT count(*) n FROM warehouse_locations WHERE warehouse_id=1').get().n,3);db.exec(`DELETE FROM ${table}`);
  }
  db.exec("CREATE TRIGGER force_audit_failure BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'test'); END");assert.equal((await call('/api/warehouses?id=1')).status,500);assert.equal(db.prepare('SELECT count(*) n FROM warehouse_locations WHERE warehouse_id=1').get().n,3);assert.ok(db.prepare('SELECT 1 FROM warehouses WHERE id=1').get());db.exec('DROP TRIGGER force_audit_failure');
  const r=await call('/api/warehouses?id=1');assert.equal(r.status,200);assert.equal((await r.json()).data.deletedLocations,3);assert.equal(db.prepare('SELECT count(*) n FROM warehouse_locations WHERE warehouse_id=1').get().n,0);assert.ok(db.prepare("SELECT 1 FROM audit_logs WHERE action='WAREHOUSE_DELETED'").get());
  assert.throws(()=>db.exec("INSERT INTO inventory(warehouse_id,product_id) VALUES(1,99)"),/warehouse_not_found/);assert.throws(()=>db.exec("INSERT INTO warehouse_locations(warehouse_id,location_code) VALUES(1,'X')"),/warehouse_not_found/);assert.throws(()=>db.exec("INSERT INTO stock_transfers(transfer_number,from_warehouse_id,to_warehouse_id) VALUES('T3',2,1)"),/warehouse_not_found/);
  let product=await call('/api/products','POST',admin,{name:'Ürün',sku:'U1',categoryId:1,retailPrice:'10.00',buyPrice:'5.00',initialStock:2});assert.equal(product.status,200,await product.text());assert.deepEqual(db.prepare("SELECT warehouse_id,location_code FROM inventory WHERE product_id=(SELECT id FROM products WHERE sku='U1')").get(),{warehouse_id:2,location_code:null});
  product=await call('/api/products','POST',admin,{name:'Hatalı',sku:'U2',categoryId:1,retailPrice:'10.00',initialStock:2,warehouseId:1});assert.equal(product.status,422);assert.equal(db.prepare("SELECT count(*) n FROM products WHERE sku='U2'").get().n,0);
  assert.equal((await call('/api/warehouses?id=999')).status,404);
 } finally {if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
