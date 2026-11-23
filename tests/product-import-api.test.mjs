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

test('Ürün bağlantısı API katalog yetkisi, kaynak ve güvenli URL sınırlarını uygular', {timeout:40000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'product-import-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try {
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);db=new Database(file);const tokens={};
  for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER','B2C_CUSTOMER']){const id=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)').run(role,`${role}@example.test`,'hash',role).lastInsertRowid;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  // Test-only network fixture: actual production URL validation, route and extraction remain intact.
  const hook=path.join(dir,'network-hook.cjs');
  fs.writeFileSync(hook, `const dns=require('node:dns'),https=require('node:https'),{PassThrough,Readable}=require('node:stream');
    const lookup=dns.promises.lookup.bind(dns.promises); dns.promises.lookup=(host,opts)=>host==='fixture.example'||host==='cdn.fixture.example'?Promise.resolve([{address:'8.8.8.8',family:4}]):lookup(host,opts);
    const request=https.request; https.request=function(url,opts,cb){if(url.hostname!=='fixture.example')return request.apply(this,arguments);
      const out=new PassThrough(); out.on('finish',()=>{opts.lookup(url.hostname,{},(err,ip,family)=>{if(err||ip!=='8.8.8.8'||family!==4){out.emit('error',new Error('DNS not pinned'));return;}
        const html='<script type=\"application/ld+json\">{\"@type\":\"Product\",\"name\":\"Demo İplik\",\"description\":\"Ürün açıklaması\",\"sku\":\"SKU-TEST\",\"brand\":{\"name\":\"Örnek\"},\"image\":[\"https://cdn.fixture.example/iplik.jpg\"],\"additionalProperty\":[{\"name\":\"Malzeme\",\"value\":\"Pamuk\"}]}</script>';
        const res=Readable.from([Buffer.from(html)]);res.statusCode=200;res.headers={'content-type':'text/html; charset=utf-8'};cb(res);});});return out;};`);
  const port=await freePort();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production',NODE_OPTIONS:`--require=${hook}`},stdio:'ignore'});const base=`http://127.0.0.1:${port}/api/products/import`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base);ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const req=(role,body,extra={})=>fetch(base,{method:'POST',headers:{...(role?{Authorization:`Bearer ${tokens[role]}`} : {}),'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
  assert.equal((await req(null,{url:'https://example.com/p'})).status,401);assert.equal((await req('CASHIER',{url:'https://example.com/p'})).status,403);assert.equal((await req('B2C_CUSTOMER',{url:'https://example.com/p'})).status,403);
  for(const url of ['http://example.com','https://localhost','https://127.0.0.1','https://169.254.169.254/latest/meta-data','https://192.168.0.1','https://[::1]','https://user:pass@example.com','https://example.com:8443','file:///etc/passwd'])assert.equal((await req('SUPER_ADMIN',{url})).status,422,url);
  assert.equal((await req('SUPER_ADMIN',{url:'https://example.com/p'},{Origin:'https://attacker.example'})).status,403);
  const forged=await fetch(base,{method:'POST',headers:{Cookie:`ipek_session=${tokens.SUPER_ADMIN}`,Authorization:'Bearer forged','Content-Type':'application/json'},body:JSON.stringify({url:'https://example.com/p'})});assert.equal(forged.status,403);
  assert.equal((await req('SUPER_ADMIN',{url:'https://example.com',unknown:'x'})).status,422);assert.equal((await req('SUPER_ADMIN',{url:'x'.repeat(17000)})).status,413);assert.equal((await req('SUPER_ADMIN',{url:'https://example.com'},{'Content-Type':'text/plain'})).status,415);
  const imported=await req('SUPER_ADMIN',{url:'https://fixture.example/item'});assert.equal(imported.status,200);assert.match(imported.headers.get('cache-control'),/no-store/);const result=(await imported.json()).data;
  assert.equal(result.name,'Demo İplik');assert.equal(result.sku,'SKU-TEST');assert.match(result.description,/Malzeme: Pamuk/);assert.deepEqual(result.images,['https://cdn.fixture.example/iplik.jpg']);
  for(let i=0;i<7;i++)assert.equal((await req('SUPER_ADMIN',{url:'https://fixture.example/item'})).status,200);assert.equal((await req('SUPER_ADMIN',{url:'https://fixture.example/item'})).status,429);
  db.prepare("INSERT INTO app_settings(key,value) VALUES('admin.role_matrix',?)").run(JSON.stringify({STORE_MANAGER:{catalog:false}}));assert.equal((await req('STORE_MANAGER',{url:'https://example.com'})).status,403);
  db.prepare("UPDATE app_settings SET value=? WHERE key='admin.role_matrix'").run(JSON.stringify({CASHIER:{catalog:true}}));assert.equal((await req('CASHIER',{url:'https://127.0.0.1'})).status,422);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM products').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM inventory').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM product_images').get().n,0);
  // Only the disposable test database is damaged here, to exercise an unexpected server failure.
  db.exec('DROP TABLE app_settings');
  const failure=await req('SUPER_ADMIN',{url:'https://fixture.example/item'});assert.equal(failure.status,500);assert.match(failure.headers.get('content-type'),/application\/json/);assert.match((await failure.json()).error,/servisi şu anda kullanılamıyor/);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
