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

test('Ürün silme API yetki, kaynak, ilişkili kayıt ve atomik denetim koruması', {timeout:40000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'product-delete-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try {
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);db=new Database(file);
  db.exec("INSERT INTO categories(id,name,slug) VALUES(1,'Kategori','kategori'); INSERT INTO warehouses(id,name,code) VALUES(1,'Mağaza','MAG');");
  const tokens={};for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER']){const id=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(role,`${role}@example.test`,'hash',role).lastInsertRowid;tokens[role]=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(tokens[role]).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  for(const id of [1,2,3,4,5,6,7])db.prepare('INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(?,?,?,?,1,10)').run(id,`Ürün ${id}`,`urun-${id}`,`SKU-${id}`);
  db.exec("INSERT INTO product_variants(id,product_id,sku,retail_price) VALUES(11,1,'V-11',10),(22,2,'V-22',10); INSERT INTO product_images(product_id,variant_id,url) VALUES(1,11,'https://example.test/one.jpg'); INSERT INTO inventory(warehouse_id,product_id,variant_id,physical_qty,reserved_qty) VALUES(1,1,11,0,0),(1,2,22,3,0)");
  const port=await freePort();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${port}/api/products`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base);ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const del=(role,body,headers={})=>fetch(base,{method:'DELETE',headers:{...(role?{Authorization:`Bearer ${tokens[role]}`} : {}),'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await del(null,{id:1})).status,401);assert.equal((await del('STORE_MANAGER',{id:1})).status,403);assert.equal((await del('CASHIER',{id:1})).status,403);
  assert.equal((await del('SUPER_ADMIN',{id:1},{Origin:'https://evil.example'})).status,403);assert.equal((await del('SUPER_ADMIN',{id:1},{'Content-Type':'text/plain'})).status,415);
  for(const bad of [{id:0},{id:'1'},{id:1,extra:true},{},null])assert.equal((await del('SUPER_ADMIN',bad)).status,422);
  assert.equal((await del('SUPER_ADMIN',{id:999})).status,404);
  db.exec("INSERT INTO product_questions(product_id,asker_name,question) VALUES(3,'A','Soru')");
  const matrix=(value)=>db.prepare("INSERT OR REPLACE INTO app_settings(key,value) VALUES('admin.role_matrix',?)").run(JSON.stringify(value));
  matrix({STORE_MANAGER:{catalog:false,productDelete:true}});assert.equal((await del('STORE_MANAGER',{id:4})).status,403);
  const updateMatrix=(role,value)=>fetch(base.replace('/products','/role-matrix'),{method:'POST',headers:{Authorization:`Bearer ${tokens[role]}`,'Content-Type':'application/json'},body:JSON.stringify({matrix:value})});
  assert.equal((await updateMatrix('STORE_MANAGER',{STORE_MANAGER:{catalog:true,productDelete:true}})).status,403);
  assert.equal((await updateMatrix('SUPER_ADMIN',{STORE_MANAGER:{catalog:true,productDelete:true}})).status,200);
  assert.equal((await del('STORE_MANAGER',{id:2})).status,409);assert.equal((await del('STORE_MANAGER',{id:3})).status,409);
  assert.equal((await del('STORE_MANAGER',{id:4})).status,200);
  assert.ok(db.prepare("SELECT id FROM audit_logs WHERE action='PRODUCT_DELETED' AND entity_id='4' AND user_name='STORE_MANAGER'").get());
  matrix({STORE_MANAGER:{catalog:true,productDelete:false}});assert.equal((await del('STORE_MANAGER',{id:5})).status,403);
  assert.equal((await del('CASHIER',{id:5})).status,403);assert.ok(db.prepare('SELECT id FROM products WHERE id=5').get());
  assert.equal((await updateMatrix('SUPER_ADMIN',{STORE_MANAGER:{catalog:true,productDelete:true},CASHIER:{catalog:true,productDelete:true}})).status,200);
  assert.equal((await del('CASHIER',{id:6})).status,200);
  db.exec("BEGIN IMMEDIATE; UPDATE app_settings SET value='{}' WHERE key='admin.role_matrix'");
  const pending=del('STORE_MANAGER',{id:7});assert.equal(await Promise.race([pending.then(()=>false),delay(200).then(()=>true)]),true);db.exec('COMMIT');
  assert.equal((await pending).status,403);assert.ok(db.prepare('SELECT id FROM products WHERE id=7').get());
  const blocked=await del('SUPER_ADMIN',{id:2});assert.equal(blocked.status,409);assert.match((await blocked.json()).error,/stok veya rezervasyonu/);
  assert.equal((await del('SUPER_ADMIN',{id:3})).status,409);
  db.exec("CREATE TRIGGER block_product_audit BEFORE INSERT ON audit_logs WHEN NEW.action='PRODUCT_DELETED' BEGIN SELECT RAISE(ABORT,'fail'); END");
  assert.equal((await del('SUPER_ADMIN',{id:1})).status,500);assert.ok(db.prepare('SELECT id FROM products WHERE id=1').get());assert.ok(db.prepare('SELECT id FROM product_variants WHERE id=11').get());assert.equal(db.prepare('SELECT COUNT(*) n FROM product_images').get().n,1);
  db.exec('DROP TRIGGER block_product_audit');const success=await del('SUPER_ADMIN',{id:1});assert.equal(success.status,200);assert.equal((await success.json()).data.id,1);
  assert.equal(db.prepare('SELECT id FROM products WHERE id=1').get(),undefined);assert.equal(db.prepare('SELECT id FROM product_variants WHERE id=11').get(),undefined);assert.equal(db.prepare('SELECT COUNT(*) n FROM product_images').get().n,0);assert.ok(db.prepare("SELECT id FROM audit_logs WHERE action='PRODUCT_DELETED' AND entity_id='1'").get());
  assert.equal((await del('SUPER_ADMIN',{id:1})).status,404);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
