import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';

async function port() { const s=net.createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r)); const p=s.address().port; await new Promise(r=>s.close(r)); return p; }
test('Sipariş listesi ve yönetim SSR erişimi matrise bağlı, POS ve müşteri takibi korunur', {timeout:60000}, async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'order-privacy-')), file=path.join(dir,'db.sqlite'); let server, db;
  try {
    const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env:{...process.env,DATABASE_URL:`sqlite:${file}`},encoding:'utf8'}); assert.equal(migration.status,0,migration.stderr);
    db=new Database(file); db.pragma('foreign_keys=ON');
    const tokens={};
    for (const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER','WAREHOUSE_KEEPER','B2C_CUSTOMER']) {
      const id=db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)').run(role,`${role}@example.test`,'hash',role).lastInsertRowid;
      tokens[role]=crypto.randomBytes(32).toString('hex'); db.prepare('INSERT INTO admin_sessions (user_id,jti,expires_at) VALUES (?,?,?)').run(id,crypto.createHash('sha256').update(tokens[role]).digest('hex'),Math.floor(Date.now()/1000)+3600);
    }
    const order=db.prepare("INSERT INTO orders (order_number,order_type,customer_name,customer_email,customer_phone,shipping_address,notes,grand_total) VALUES ('PRIVACY-ORDER-1','ONLINE_B2C','PrivateCustomerName','private@example.test','05551234567','PrivateStreetAddress','PrivateOrderNote',100)").run();
    db.prepare("INSERT INTO order_items (order_id,product_id,product_name,sku,unit_price,quantity,total_price) VALUES (?,1,'PrivateItemName','PRIVATE-ITEM',100,1,100)").run(order.lastInsertRowid);
    db.prepare("INSERT INTO order_status_history (order_id,to_status,note) VALUES (?,'PAID','PrivateHistoryNote')").run(order.lastInsertRowid);
    db.prepare("INSERT INTO app_settings (key,value) VALUES ('admin.role_matrix',?)").run(JSON.stringify({CASHIER:{orders:false,pos:true},WAREHOUSE_KEEPER:{orders:false,pos:false},STORE_MANAGER:{orders:true}}));
    const p=await port(); server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...process.env,DATABASE_URL:`sqlite:${file}`,PORT:String(p),NODE_ENV:'production'},stdio:'ignore'}); const base=`http://127.0.0.1:${p}`;
    let ready=false; for(let i=0;i<120;i++){try{await fetch(`${base}/api/orders`);ready=true;break}catch{} await delay(100);} assert.ok(ready);
    const api=(role,query='',options={})=>fetch(`${base}/api/orders${query}`,{...options,headers:{...(role?{Authorization:`Bearer ${tokens[role]}`} : {}),...(options.headers||{})}});
    assert.equal((await api(null)).status,401); assert.equal((await api('B2C_CUSTOMER')).status,403);
    for(const role of ['CASHIER','WAREHOUSE_KEEPER']) {assert.equal((await api(role)).status,403); assert.equal((await api(role,'?type=POS&customerId=1')).status,403);}
    for(const role of ['SUPER_ADMIN','STORE_MANAGER']) {const r=await api(role); assert.equal(r.status,200); assert.match(r.headers.get('cache-control'),/no-store/); assert.equal((await r.json()).data[0].customerEmail,'private@example.test');}
    const singular='?orderNumber=PRIVACY-ORDER-1';
    const pos=await api('CASHIER',singular); assert.equal(pos.status,200); const posData=(await pos.json()).data;
    assert.equal(posData.customerName,'PrivateCustomerName'); assert.equal(posData.items[0].productName,'PrivateItemName');
    for(const key of ['customerPhone','customerEmail','shippingAddress','notes','history','trackingNumber']) assert.equal(posData[key],undefined,key);
    assert.equal((await (await api('WAREHOUSE_KEEPER',singular)).json()).data.detailsRestricted,true);
    assert.equal((await (await api(null,singular)).json()).data.detailsRestricted,true);
    assert.equal((await api(null,singular+'&phone=123')).status,404);
    assert.equal((await api(null,singular+'&phone=05550000000')).status,404);
    assert.equal((await (await api(null,singular+'&phone=05551234567')).json()).data.customerEmail,'private@example.test');
    assert.equal((await (await api('STORE_MANAGER',singular)).json()).data.history[0].note,'PrivateHistoryNote');
    const patch=(role,headers={})=>api(role,'',{method:'PATCH',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({id:Number(order.lastInsertRowid),notes:'test note'})});
    assert.equal((await patch('CASHIER')).status,403); assert.equal((await patch('WAREHOUSE_KEEPER')).status,403);
    assert.equal((await patch('STORE_MANAGER',{Origin:'https://attacker.example'})).status,403);
    const forged=await fetch(`${base}/api/orders`,{method:'PATCH',headers:{Cookie:`ipek_session=${tokens.STORE_MANAGER}`,Authorization:'Bearer forged','Content-Type':'application/json'},body:JSON.stringify({id:Number(order.lastInsertRowid),notes:'no'})}); assert.equal(forged.status,403);
    assert.equal((await patch('STORE_MANAGER')).status,200);
    for(const role of ['CASHIER','WAREHOUSE_KEEPER','STORE_MANAGER','SUPER_ADMIN']) {
      const response=await fetch(`${base}/admin`,{headers:{Cookie:`ipek_session=${tokens[role]}`}}); assert.equal(response.status,200,role); const html=await response.text();
      for(const marker of ['PrivateCustomerName','private@example.test','PrivateStreetAddress','PrivateItemName']) {
        if(['CASHIER','WAREHOUSE_KEEPER'].includes(role)) assert.ok(!html.includes(marker),`${role} SSR sızması: ${marker}`);
        else assert.ok(html.includes(marker),`${role} SSR eksik: ${marker}`);
      }
    }
    for(const role of ['CASHIER','STORE_MANAGER']) {
      const response=await fetch(`${base}/admin?_rsc=test`,{headers:{Cookie:`ipek_session=${tokens[role]}`,RSC:'1'}}); assert.equal(response.status,200); const payload=await response.text();
      assert.equal(payload.includes('PrivateCustomerName'),role==='STORE_MANAGER',`${role} RSC`);
    }
    db.prepare("UPDATE app_settings SET value=? WHERE key='admin.role_matrix'").run(JSON.stringify({CASHIER:{orders:true,pos:true},STORE_MANAGER:{orders:false,pos:false}}));
    assert.equal((await api('CASHIER')).status,200); assert.equal((await api('STORE_MANAGER')).status,403); assert.equal((await patch('STORE_MANAGER')).status,403);
    let html=await (await fetch(`${base}/admin`,{headers:{Cookie:`ipek_session=${tokens.STORE_MANAGER}`}})).text(); assert.ok(!html.includes('PrivateCustomerName'));
    html=await (await fetch(`${base}/admin`,{headers:{Cookie:`ipek_session=${tokens.CASHIER}`}})).text(); assert.ok(html.includes('PrivateCustomerName'));
    assert.equal(db.pragma('foreign_key_check').length,0);
  } finally { if(server && server.exitCode===null){server.kill('SIGTERM'); await new Promise(r=>server.once('exit',r));} db?.close(); fs.rmSync(dir,{recursive:true,force:true}); }
});
