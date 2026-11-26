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

async function freePort() {
  const s=net.createServer(); await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve);});
  const port=s.address().port; await new Promise(resolve=>s.close(resolve)); return port;
}

test('CRM notları müşteri bazında sayfalı, yetkili ve denetlenebilir', {timeout:30000}, async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-notes-')); const dbPath=path.join(dir,'test.db'); const env={...process.env,DATABASE_URL:`sqlite:${dbPath}`};let server;
  try {
    const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8',timeout:15000});assert.equal(migration.status,0,migration.stderr);
    const db=new Database(dbPath);db.pragma('foreign_keys=ON');
    db.prepare("INSERT INTO customers (id,name,phone) VALUES (1,'A','5551234567'),(2,'B','5557654321')").run();
    const note=db.prepare('INSERT INTO crm_customer_notes (customer_id,body,created_by_id,created_by_name,created_at) VALUES (?,?,?,?,?)');
    for(let i=1;i<=55;i++)note.run(1,`Özel not ${i}`,1,'Yetkili',1700000000); // timestamp ties require stable id ordering
    note.run(2,'BAŞKA MÜŞTERİ GİZLİ NOT',1,'Yetkili',1700000000);
    assert.match(db.prepare('EXPLAIN QUERY PLAN SELECT id FROM crm_customer_notes WHERE customer_id=? ORDER BY created_at DESC,id DESC LIMIT 20').all(1).map(x=>x.detail).join(' '),/crm_customer_notes_customer_idx/);
    const tokens={};for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER','B2C_CUSTOMER']){const id=db.prepare('INSERT INTO users (email,password_hash,name,role) VALUES (?,?,?,?)').run(`${role}@example.test`,'hash',role,role).lastInsertRowid;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions (user_id,jti,expires_at) VALUES (?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}db.close();
    const port=await freePort(); server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${port}`;
    let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/crm/customers');ready=true;break;}catch{if(server.exitCode!==null)throw Error('Sunucu kapandı');await delay(100);}}assert.ok(ready);
    const req=(url,role='SUPER_ADMIN',method='GET',body)=>fetch(base+url,{method,headers:{...(role?{Authorization:`Bearer ${tokens[role]}`} : {}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    const endpoint='/api/crm/customers/1/notes';
    assert.equal((await req(endpoint,null)).status,401);assert.equal((await req(endpoint,'CASHIER')).status,403);assert.equal((await req(endpoint,'B2C_CUSTOMER')).status,403);
    assert.equal((await req('/api/crm/customers/no/notes')).status,422);assert.equal((await req('/api/crm/customers/999/notes')).status,404);
    for(const q of ['?page=0','?page=-1','?page=1x','?page=9999999'])assert.equal((await req(endpoint+q)).status,422);
    const response=await req(endpoint);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
    const first=await response.json();assert.equal(first.pagination.total,55);assert.equal(first.data.length,20);assert.equal(first.data[0].body,'Özel not 55');assert.equal(first.data.at(-1).body,'Özel not 36');
    const second=await(await req(endpoint+'?page=2')).json();assert.equal(second.data.length,20);assert.equal(second.data[0].body,'Özel not 35');assert.equal(second.data.at(-1).body,'Özel not 16');
    const third=await(await req(endpoint+'?page=3')).json();assert.equal(third.data.length,15);assert.equal(third.data.at(-1).body,'Özel not 1');
    const empty=await(await req(endpoint+'?page=4')).json();assert.equal(empty.pagination.total,55);assert.deepEqual(empty.data,[]);
    assert.ok(!JSON.stringify([first,second,third,empty]).includes('BAŞKA MÜŞTERİ GİZLİ NOT'));
    let audit=new Database(dbPath);const logs=audit.prepare("SELECT details FROM audit_logs WHERE action='CRM_NOTES_VIEW' AND entity_id='1'").all();assert.equal(logs.length,4);assert.ok(!JSON.stringify(logs).includes('Özel not'));
    audit.exec("CREATE TRIGGER fail_notes_view BEFORE INSERT ON audit_logs WHEN NEW.action='CRM_NOTES_VIEW' BEGIN SELECT RAISE(ABORT,'audit failure'); END");audit.close();
    const failed=await req(endpoint);assert.equal(failed.status,500);assert.ok(!JSON.stringify(await failed.json()).includes('Özel not'));
    audit=new Database(dbPath);audit.exec('DROP TRIGGER fail_notes_view');audit.close();
    assert.equal((await req('/api/role-matrix','SUPER_ADMIN','POST',{matrix:{STORE_MANAGER:{crm:true,crmWrite:false}}})).status,200);
    assert.equal((await req(endpoint,'STORE_MANAGER')).status,200);assert.equal((await req(endpoint,'STORE_MANAGER','POST',{body:'İzinsiz'})).status,403);
    const saved=await req(endpoint,'SUPER_ADMIN','POST',{body:'En yeni not'});assert.equal(saved.status,201);
    const refreshed=await(await req(endpoint)).json();assert.equal(refreshed.pagination.total,56);assert.equal(refreshed.data[0].body,'En yeni not');
  } finally {if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));}fs.rmSync(dir,{recursive:true,force:true});}
});
