import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';

async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}

test('Teknik alanlar isteğe bağlı, doğrulanmış, kaydedilir ve düzenlenir', {timeout:50000}, async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'product-specs-'));
  const file=path.join(dir,'test.db'); const env={...process.env,DATABASE_URL:`sqlite:${file}`}; let db,server;
  try {
    const m=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(m.status,0,m.stderr);
    db=new Database(file);const token=crypto.randomBytes(32).toString('hex');
    const id=db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)").run('Admin','admin@example.test','hash','SUPER_ADMIN').lastInsertRowid;
    db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);
    const port=await freePort();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${port}`;let ready=false;
    for(let i=0;i<120;i++){try{await fetch(base+'/api/products');ready=true;break}catch{await delay(100)}}assert.ok(ready);
    const send=(method,body)=>fetch(base+'/api/products',{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const product={name:'Test İplik',sku:'TEST-01',categoryId:1,retailPrice:'10',initialStock:0};
    assert.equal((await send('POST',{...product,technicalDetails:{unsafe:'x'}})).status,422);
    assert.equal(db.prepare('SELECT count(*) n FROM products').get().n,0);
    const create=await send('POST',{...product,technicalDetails:{articleNo:'260',composition:'%10 Bambu - %90 Akrilik',knittingNeedle:'4-5'}});assert.equal(create.status,200);const created=(await create.json()).data;
    assert.deepEqual(JSON.parse(created.technicalDetails),{articleNo:'260',composition:'%10 Bambu - %90 Akrilik',knittingNeedle:'4-5'});
    const list=await (await fetch(base+'/api/products')).json();assert.equal(list.data[0].technicalDetails,created.technicalDetails);
    assert.equal((await send('PATCH',{id:created.id,technicalDetails:{articleNo:'x'.repeat(301)}})).status,422);
    assert.equal(db.prepare('SELECT technical_details FROM products WHERE id=?').get(created.id).technical_details,created.technicalDetails);
    assert.equal((await send('PATCH',{id:created.id,technicalDetails:{articleNo:'265',crochetNeedle:'2-4'}})).status,200);
    assert.deepEqual(JSON.parse(db.prepare('SELECT technical_details FROM products WHERE id=?').get(created.id).technical_details),{articleNo:'265',crochetNeedle:'2-4'});
    assert.equal((await send('PATCH',{id:created.id,technicalDetails:{}})).status,200);
    assert.equal(db.prepare('SELECT technical_details FROM products WHERE id=?').get(created.id).technical_details,null);
    const legacy=await send('POST',{...product,name:'Eski format',sku:'TEST-02'});assert.equal(legacy.status,200);assert.equal((await legacy.json()).data.technicalDetails,null);
  } finally {if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
