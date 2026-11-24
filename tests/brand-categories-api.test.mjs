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

test('Marka kategori geçişi ve yetkili API çoklu ilişkiyi korur', {timeout:40000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brand-category-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 const migrate=()=>{const r=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
 try {
  migrate();db=new Database(file);db.pragma('foreign_keys = ON');
  db.exec("DROP TABLE brand_categories; DELETE FROM __migrations WHERE tag='0026_brand_categories'; INSERT INTO categories(id,name,slug) VALUES(1,'İplik','iplik'),(2,'Dikiş','dikiş'),(3,'Boncuk','boncuk'); INSERT INTO brands(id,name,slug) VALUES(1,'Eski','eski'),(2,'Atanmamış','atanmamis'); INSERT INTO products(id,name,slug,sku,brand_id,category_id) VALUES(1,'Bir','bir','bir',1,1),(2,'İki','iki','iki',1,2),(3,'Üç','uc','uc',1,1)");
  migrate();migrate();assert.deepEqual(db.prepare('SELECT * FROM brand_categories ORDER BY brand_id,category_id').all(),[{brand_id:1,category_id:1},{brand_id:1,category_id:2}]);assert.equal(db.prepare('SELECT COUNT(*) n FROM products').get().n,3);
  function session(role){const id=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(role,`${role}@test.example`,'hash',role).lastInsertRowid;const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);return token;}
  const admin=session('SUPER_ADMIN'),cashier=session('CASHIER');const port=await freePort();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${port}/api/brands`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base);ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const call=(method,body,token=admin,more={})=>fetch(base,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...more},body:JSON.stringify(body)});
  const initial=(await (await fetch(base)).json()).data;assert.deepEqual(initial.find(x=>x.id===1).categoryIds,[1,2]);assert.deepEqual(initial.find(x=>x.id===2).categoryIds,[]);
  assert.equal((await call('POST',{name:'Red',categoryIds:[1]},cashier)).status,403);
  assert.equal((await call('POST',{name:'Red',categoryIds:[1]},admin,{Origin:'https://evil.example'})).status,403);
  for(const ids of [[],[999],[1,1],['x']])assert.equal((await call('POST',{name:'Red',categoryIds:ids})).status,422);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM brands WHERE name='Red'").get().n,0);
  let r=await call('POST',{name:'Yeni',categoryIds:[1,2]});assert.equal(r.status,200);let b=(await r.json()).data;assert.deepEqual(b.categoryIds,[1,2]);
  r=await call('POST',{name:'YENİ',categoryIds:[3]});assert.equal(r.status,200);const existing=await r.json();assert.equal(existing.existed,true);assert.equal(existing.data.id,b.id);assert.deepEqual(existing.data.categoryIds,[1,2,3]);
  r=await call('PATCH',{id:b.id,categoryIds:[2,999]});assert.equal(r.status,422);assert.deepEqual((await (await fetch(base)).json()).data.find(x=>x.id===b.id).categoryIds,[1,2,3]);
  db.exec("CREATE TRIGGER reject_brand_link BEFORE INSERT ON brand_categories WHEN NEW.category_id=3 BEGIN SELECT RAISE(ABORT,'forced'); END");
  r=await call('PATCH',{id:b.id,name:'Rollback',categoryIds:[2,3]});assert.equal(r.status,500);let unchanged=(await (await fetch(base)).json()).data.find(x=>x.id===b.id);assert.equal(unchanged.name,'Yeni');assert.deepEqual(unchanged.categoryIds,[1,2,3]);db.exec('DROP TRIGGER reject_brand_link');
  r=await call('PATCH',{id:b.id,name:'Yeni ad',categoryIds:[2]});assert.equal(r.status,200);assert.deepEqual((await r.json()).data.categoryIds,[2]);
  r=await call('PATCH',{id:1,categoryIds:[]});assert.equal(r.status,200);assert.equal(db.prepare('SELECT COUNT(*) n FROM products WHERE brand_id=1').get().n,3);
  assert.equal((await call('DELETE',{id:1})).status,409);assert.equal((await call('DELETE',{id:b.id})).status,200);assert.equal(db.prepare('SELECT COUNT(*) n FROM brand_categories WHERE brand_id=?').get(b.id).n,0);
 } finally {if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
