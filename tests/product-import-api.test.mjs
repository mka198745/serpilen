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
  const groupHtml='<script type="application/ld+json">'+JSON.stringify({'@type':'ProductGroup',url:'https://fixture.example/group',name:'Test',hasVariant:[{'@type':'Product',color:'A',image:'https://cdn.fixture.example/a.jpg'},{'@type':'Product',color:'B',image:'https://private.fixture.example/b.jpg'}]})+'</script>';
  fs.writeFileSync(hook, `const dns=require('node:dns'),https=require('node:https'),{PassThrough,Readable}=require('node:stream');
    const lookup=dns.promises.lookup.bind(dns.promises); dns.promises.lookup=(host,opts)=>host==='private.fixture.example'?Promise.resolve([{address:'127.0.0.1',family:4}]):['fixture.example','cdn.fixture.example','alize.gen.tr','www.himalaya.com.tr'].includes(host)?Promise.resolve([{address:'8.8.8.8',family:4}]):lookup(host,opts);
    const request=https.request; https.request=function(url,opts,cb){if(!['fixture.example','alize.gen.tr','www.himalaya.com.tr'].includes(url.hostname))return request.apply(this,arguments);
      const out=new PassThrough(); out.on('finish',()=>{opts.lookup(url.hostname,{},(err,ip,family)=>{if(err||ip!=='8.8.8.8'||family!==4){out.emit('error',new Error('DNS not pinned'));return;}
        const html='<script type=\"application/ld+json\">{\"@type\":\"Product\",\"name\":\"Demo İplik\",\"description\":\"Ürün açıklaması\",\"sku\":\"SKU-TEST\",\"brand\":{\"name\":\"Örnek\"},\"image\":[\"https://cdn.fixture.example/iplik.jpg\"],\"additionalProperty\":[{\"name\":\"Malzeme\",\"value\":\"Pamuk\"}]}</script>';
        const body=url.hostname==='www.himalaya.com.tr'?(opts.method==='POST'?'':require('node:fs').readFileSync(opts.headers.Cookie?${JSON.stringify(path.resolve('tests/fixtures/himalaya-arisya-tr.html'))}:${JSON.stringify(path.resolve('tests/fixtures/himalaya-arisya.html'))},'utf8')):url.hostname==='alize.gen.tr'?require('node:fs').readFileSync(${JSON.stringify(path.resolve('tests/fixtures/alize-baby-best.html'))},'utf8'):url.pathname==='/group'?${JSON.stringify(groupHtml)}:html;
        const respond=()=>{const res=Readable.from([Buffer.from(body)]);res.statusCode=200;res.headers={'content-type':'text/html; charset=utf-8',...(url.hostname==='www.himalaya.com.tr'?{'set-cookie':['PHPSESSID=test123; path=/']}: {})};cb(res);};
        if(url.pathname==='/slow'){require('node:fs').writeFileSync(${JSON.stringify(path.join(dir,'network-started'))},'1');setTimeout(respond,400);}else respond();});});return out;};`);
  const port=await freePort();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production',NODE_OPTIONS:`--require=${hook}`},stdio:'ignore'});const base=`http://127.0.0.1:${port}/api/products/import`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base);ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const req=(role,body,extra={})=>fetch(base,{method:'POST',headers:{...(role?{Authorization:`Bearer ${tokens[role]}`} : {}),'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
  assert.equal((await req(null,{url:'https://example.com/p'})).status,401);assert.equal((await req('CASHIER',{url:'https://example.com/p'})).status,403);assert.equal((await req('B2C_CUSTOMER',{url:'https://example.com/p'})).status,403);
  const check=role=>fetch(base,{headers:role?{Authorization:`Bearer ${tokens[role]}`}:{}});
  assert.equal((await check(null)).status,401);assert.equal((await check('B2C_CUSTOMER')).status,403);
  const defaultManager=await check('STORE_MANAGER');assert.equal(defaultManager.status,200);assert.match(defaultManager.headers.get('cache-control'),/no-store/);assert.equal((await defaultManager.json()).allowed,false);
  assert.equal((await check('SUPER_ADMIN').then(r=>r.json())).allowed,true);
  assert.equal((await req('STORE_MANAGER',{url:'https://fixture.example/item'})).status,403);
  for(const url of ['http://example.com','https://localhost','https://127.0.0.1','https://169.254.169.254/latest/meta-data','https://192.168.0.1','https://[::1]','https://user:pass@example.com','https://example.com:8443','file:///etc/passwd'])assert.equal((await req('SUPER_ADMIN',{url})).status,422,url);
  assert.equal((await req('SUPER_ADMIN',{url:'https://example.com/p'},{Origin:'https://attacker.example'})).status,403);
  const forged=await fetch(base,{method:'POST',headers:{Cookie:`ipek_session=${tokens.SUPER_ADMIN}`,Authorization:'Bearer forged','Content-Type':'application/json'},body:JSON.stringify({url:'https://example.com/p'})});assert.equal(forged.status,403);
  assert.equal((await req('SUPER_ADMIN',{url:'https://example.com',unknown:'x'})).status,422);assert.equal((await req('SUPER_ADMIN',{url:'x'.repeat(17000)})).status,413);assert.equal((await req('SUPER_ADMIN',{url:'https://example.com'},{'Content-Type':'text/plain'})).status,415);
  const imported=await req('SUPER_ADMIN',{url:'https://fixture.example/item'});assert.equal(imported.status,200);assert.match(imported.headers.get('cache-control'),/no-store/);const result=(await imported.json()).data;
  assert.equal(result.name,'Demo İplik');assert.equal(result.sku,'SKU-TEST');assert.match(result.description,/Malzeme: Pamuk/);assert.deepEqual(result.images,['https://cdn.fixture.example/iplik.jpg']);
  const group=await req('SUPER_ADMIN',{url:'https://fixture.example/group'});assert.equal(group.status,200);const gd=(await group.json()).data;
  assert.equal(gd.variants[0].imageUrl,'https://cdn.fixture.example/a.jpg');assert.equal(gd.variants[1].imageUrl,'');assert.match(gd.warnings.join(' '),/güvenlik veya erişim/);
  const updateMatrix=async matrix=>fetch(`http://127.0.0.1:${port}/api/role-matrix`,{method:'POST',headers:{Authorization:`Bearer ${tokens.SUPER_ADMIN}`,'Content-Type':'application/json'},body:JSON.stringify({matrix})});
  assert.equal((await updateMatrix({STORE_MANAGER:{catalog:true,productLinkImport:true}})).status,200);
  assert.equal((await check('STORE_MANAGER').then(r=>r.json())).allowed,true);
  const alize=await req('STORE_MANAGER',{url:'https://alize.gen.tr/yumak/baby-best'});assert.equal(alize.status,200);const alizeProduct=(await alize.json()).data;
  assert.equal(alizeProduct.name,'BABY BEST');assert.equal(alizeProduct.technicalDetails.articleNo,'260');assert.equal(alizeProduct.technicalDetails.knittingNeedle,'4-5');assert.ok(alizeProduct.images.includes('https://alize.gen.tr/uploads/26000506.jpg'));assert.equal(alizeProduct.sku,'');assert.deepEqual(alizeProduct.variants.map(v=>v.colorName),['55','506']);assert.equal(alizeProduct.variants[0].imageUrl,'https://alize.gen.tr/uploads/151746890726000055.jpg');
  const himalaya=await req('STORE_MANAGER',{url:'https://www.himalaya.com.tr/arisya.html'});assert.equal(himalaya.status,200);const hp=(await himalaya.json()).data;
  assert.equal(hp.technicalDetails.composition,'%96 Cotton %4 Glitter');assert.equal(hp.technicalDetails.knittingNeedle,'5,5 mm');assert.equal(hp.technicalDetails.season,'ilkbahar-yaz');assert.match(hp.description,/İlmek Bilgisi/);assert.equal(hp.variants[0].colorName,'27-01');assert.match(hp.variants[0].imageUrl,/thumb_product_01_/);
  const inFlight=req('STORE_MANAGER',{url:'https://fixture.example/slow'});
  for(let i=0;i<100&&!fs.existsSync(path.join(dir,'network-started'));i++)await delay(10);
  assert.ok(fs.existsSync(path.join(dir,'network-started')),'upstream request started');
  assert.equal((await updateMatrix({STORE_MANAGER:{catalog:true,productLinkImport:false}})).status,200);
  assert.equal((await inFlight).status,403,'permission revoked while downloading must prevent import');
  for(let i=0;i<6;i++)assert.equal((await req('SUPER_ADMIN',{url:'https://fixture.example/item'})).status,200);assert.equal((await req('SUPER_ADMIN',{url:'https://fixture.example/item'})).status,429);
  assert.equal((await updateMatrix({STORE_MANAGER:{catalog:false,productLinkImport:true},CASHIER:{catalog:true,productLinkImport:false}})).status,200);
  assert.equal((await check('STORE_MANAGER').then(r=>r.json())).allowed,false);assert.equal((await req('STORE_MANAGER',{url:'https://example.com'})).status,403);
  assert.equal((await check('CASHIER').then(r=>r.json())).allowed,false);assert.equal((await req('CASHIER',{url:'https://127.0.0.1'})).status,403);
  assert.equal((await updateMatrix({CASHIER:{catalog:true,productLinkImport:true}})).status,200);
  assert.equal((await check('CASHIER').then(r=>r.json())).allowed,true);assert.equal((await req('CASHIER',{url:'https://127.0.0.1'})).status,422);
  db.prepare("UPDATE users SET is_active=0 WHERE role='CASHIER'").run();assert.equal((await check('CASHIER')).status,401);assert.equal((await req('CASHIER',{url:'https://fixture.example/item'})).status,401);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM products').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM inventory').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM product_images').get().n,0);
  // Only the disposable test database is damaged here, to exercise an unexpected server failure.
  db.exec('DROP TABLE app_settings');
  const failure=await req('SUPER_ADMIN',{url:'https://fixture.example/item'});assert.equal(failure.status,500);assert.match(failure.headers.get('content-type'),/application\/json/);assert.match((await failure.json()).error,/servisi şu anda kullanılamıyor/);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
