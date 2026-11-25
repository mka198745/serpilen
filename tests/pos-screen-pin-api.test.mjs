import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import net from 'node:net';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';import Database from 'better-sqlite3';
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const passHash=p=>{const salt=crypto.randomBytes(16).toString('hex');return `scrypt$${salt}$${crypto.scryptSync(p,salt,64).toString('hex')}`;};

test('POS PIN kişiye ve oturuma bağlıdır; API kilit, süre, parola, deneme sınırı ve kasiyer adını zorlar',{timeout:40000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-screen-')),file=path.join(dir,'db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try{
  const mig=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(mig.status,0,mig.stderr);db=new Database(file);db.pragma('foreign_keys=ON');
  db.exec("INSERT INTO categories(id,name,slug) VALUES(1,'Kategori','kategori'); INSERT INTO warehouses(id,name,code) VALUES(2,'Mağaza','MAG'); INSERT INTO products(id,name,slug,sku,category_id) VALUES(1,'ÖZEL POS ÜRÜNÜ','ozel','OZEL',1)");
  function user(name,role){const id=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(name,`${name}@example.test`,passHash('Password123'),role).lastInsertRowid;return Number(id);}
  function session(id){const t=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(t).digest('hex'),Math.floor(Date.now()/1000)+3600);return t;}
  const a=user('Ayse','SUPER_ADMIN'),b=user('Berk','CASHIER'),customer=user('Mustafa','B2C_CUSTOMER'),ta=session(a),ta2=session(a),tb=session(b),tc=session(customer);
  const port=await freePort();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${port}`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/auth/me');ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const get=(url,t,grant)=>fetch(base+url,{headers:{...(t?{Authorization:`Bearer ${t}`} : {}),...(grant?{'X-Pos-Grant':grant}:{})}});
  const post=(url,body,t,grant,extra={})=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`} : {}),...(grant?{'X-Pos-Grant':grant}:{}),...extra},body:JSON.stringify(body)});
  assert.equal((await get('/api/pos/bootstrap',ta)).status,403);assert.equal((await post('/api/customers',{name:'Test',phone:'5551234567'},ta)).status,403);assert.equal((await get('/api/pos/order?orderNumber=TEST',ta)).status,403);assert.equal((await get('/api/pos/shift',ta)).status,403);assert.equal((await post('/api/pos/sale',{action:'PREPARE'},ta)).status,403);assert.equal((await post('/api/pos/return',{action:'PREPARE'},ta)).status,403);assert.equal((await post('/api/pos/quote',{},ta)).status,403);assert.equal((await post('/api/pos/customers/search',{query:'test',page:1},ta)).status,403);
  assert.equal((await post('/api/pos/pin',{currentPassword:'Password123',pin:'123456'},tc)).status,403);
  assert.equal((await post('/api/pos/pin',{currentPassword:'Password123',pin:'12345'},ta)).status,422);
  assert.equal((await post('/api/pos/pin',{currentPassword:'Password123',pin:'000001'},ta,undefined,{Origin:'https://evil.example'})).status,403);
  assert.equal((await post('/api/pos/access',{action:'UNLOCK',pin:'000001'},ta)).status,403);
  assert.equal((await post('/api/pos/pin',{currentPassword:'wrong',pin:'000001'},ta)).status,403);
  assert.equal((await post('/api/pos/pin',{currentPassword:'Password123',pin:'000001'},ta)).status,200);
  assert.notEqual(db.prepare('SELECT pin_hash FROM pos_screen_pins WHERE user_id=?').get(a).pin_hash,'000001');
  const page=await fetch(base+'/pos',{headers:{Cookie:`ipek_session=${ta}`}}),html=await page.text();assert.equal(page.status,200);assert.match(html,/POS ekran kilidi/);assert.doesNotMatch(html,/ÖZEL POS ÜRÜNÜ/);
  for(let i=0;i<4;i++)assert.equal((await post('/api/pos/access',{action:'UNLOCK',pin:'999999'},ta)).status,403);
  assert.equal((await post('/api/pos/access',{action:'UNLOCK',pin:'999999'},ta)).status,429);assert.equal((await post('/api/pos/access',{action:'UNLOCK',pin:'000001'},ta)).status,429);
  assert.equal((await post('/api/pos/pin',{currentPassword:'Password123',pin:'000001'},ta)).status,200);
  let unlock=await post('/api/pos/access',{action:'UNLOCK',pin:'000001'},ta);assert.equal(unlock.status,200);let grant=(await unlock.json()).data.grant;assert.match(grant,/^[0-9a-f]{64}$/);
  assert.equal((await get('/api/pos/bootstrap',ta2,grant)).status,403);assert.equal((await get('/api/pos/bootstrap',tb,grant)).status,403);
  const boot=await get('/api/pos/bootstrap',ta,grant);assert.equal(boot.status,200);assert.equal((await boot.json()).data.products[0].name,'ÖZEL POS ÜRÜNÜ');
  db.exec("INSERT INTO orders(order_number,order_type,customer_name,customer_phone,status,payment_status,payment_method,grand_total) VALUES('TEST','POS','Müşteri','5551234567','DELIVERED','PAID','CASH',10); INSERT INTO order_items(order_id,product_id,product_name,sku,unit_price,quantity,total_price) VALUES(1,1,'Ürün','OZEL',10,1,10)");
  const order=await get('/api/pos/order?orderNumber=TEST',ta,grant);assert.equal(order.status,200);const orderData=(await order.json()).data;assert.equal(orderData.items.length,1);assert.equal(orderData.customerPhone,undefined);
  const shift=await post('/api/pos/shift',{action:'OPEN',warehouseId:2,cashierName:'Sahte',openingAmount:'20'},ta,grant);assert.equal(shift.status,200,JSON.stringify(await shift.clone().json()));assert.equal((await shift.json()).data.cashierName,'Ayse');assert.equal(db.prepare('SELECT cashier_name FROM pos_shifts WHERE status=\'OPEN\'').get().cashier_name,'Ayse');
  assert.equal((await post('/api/pos/access',{action:'TOUCH'},ta,grant)).status,200);
  assert.equal((await post('/api/pos/access',{action:'LOCK'},ta,grant)).status,200);assert.equal((await get('/api/pos/shift',ta,grant)).status,403);
  unlock=await post('/api/pos/access',{action:'UNLOCK',pin:'000001'},ta);grant=(await unlock.json()).data.grant;
  db.prepare('UPDATE pos_screen_grants SET expires_at=unixepoch()-1 WHERE user_id=?').run(a);
  assert.equal((await post('/api/pos/access',{action:'TOUCH'},ta,grant)).status,403);assert.equal((await get('/api/pos/bootstrap',ta,grant)).status,403);
  unlock=await post('/api/pos/access',{action:'UNLOCK',pin:'000001'},ta);grant=(await unlock.json()).data.grant;
  assert.equal((await post('/api/pos/pin',{currentPassword:'Password123',pin:'223344'},ta)).status,200);assert.equal((await get('/api/pos/shift',ta,grant)).status,403);
  for(let i=0;i<4;i++)assert.equal((await post('/api/pos/pin',{currentPassword:'bad',pin:'123456'},tb)).status,403);
  assert.equal((await post('/api/pos/pin',{currentPassword:'bad',pin:'123456'},tb)).status,429);assert.equal((await post('/api/pos/pin',{currentPassword:'Password123',pin:'123456'},tb)).status,429);
 }finally{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
