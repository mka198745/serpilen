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
test('Hesap API modül, gerçek kayıt türü ve yönetici yetkilerini uygular', {timeout:60000}, async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'users-auth-')), file=path.join(dir,'db.sqlite');
  const processes=[]; let db;
  try {
    const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env:{...process.env,DATABASE_URL:`sqlite:${file}`},encoding:'utf8'}); assert.equal(migration.status,0,migration.stderr);
    db=new Database(file); db.pragma('foreign_keys=ON');
    const tokens={}; const ids={};
    for (const [name,role] of [['super','SUPER_ADMIN'],['super2','SUPER_ADMIN'],['manager','STORE_MANAGER'],['cashier','CASHIER'],['customer','B2C_CUSTOMER'],['unknown','OTHER']]) {
      ids[name]=Number(db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)').run(name,`${name}@example.test`,'hash',role).lastInsertRowid);
      tokens[name]=crypto.randomBytes(32).toString('hex'); db.prepare('INSERT INTO admin_sessions (user_id,jti,expires_at) VALUES (?,?,?)').run(ids[name],crypto.createHash('sha256').update(tokens[name]).digest('hex'),Math.floor(Date.now()/1000)+3600);
    }
    const urls=[];
    for(let n=0;n<2;n++) { const p=await port(); const proc=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...process.env,DATABASE_URL:`sqlite:${file}`,PORT:String(p),NODE_ENV:'production'},stdio:'ignore'}); processes.push(proc); const base=`http://127.0.0.1:${p}`; urls.push(base); let ready=false; for(let i=0;i<100;i++){ try { if((await fetch(`${base}/api/users`)).status===401){ready=true; break;} }catch{} await delay(100); } assert.ok(ready); }
    async function req(who, method='GET', query='', body, extra={}, server=0) {
      const headers={Authorization:`Bearer ${tokens[who]}`,...extra}; if(body !== undefined) headers['Content-Type']='application/json';
      const response=await fetch(`${urls[server]}/api/users${query}`,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})}); return {status:response.status,data:await response.json(), headers:response.headers};
    }
    assert.equal((await req('customer')).status,403);
    for(const type of ['staff','customers','all']) assert.equal((await req('cashier','GET',`?type=${type}`)).status,403);
    assert.equal((await req('manager','GET','?type=staff')).status,403);
    assert.equal((await req('manager','GET','?type=all')).status,403);
    const customers=await req('manager','GET','?type=customers'); assert.equal(customers.status,200); assert.deepEqual(customers.data.data.map(x=>x.role),['B2C_CUSTOMER']); assert.match(customers.headers.get('cache-control'),/no-store/);
    const all=await req('super','GET','?type=all'); assert.equal(all.status,200); assert.equal(all.data.data.some(x=>x.role==='OTHER'),false);
    assert.equal((await req('super','GET','?type=invalid')).status,422);
    const staffBody={name:'Test',email:'test@example.test',password:'Testpass123',role:'SUPER_ADMIN'};
    assert.equal((await req('cashier','POST','',staffBody)).status,403);
    assert.equal((await req('manager','POST','',staffBody)).status,403);
    assert.equal((await req('cashier','PATCH','',{id:ids.cashier,role:'SUPER_ADMIN'})).status,403);
    assert.equal((await req('manager','PATCH','',{id:ids.cashier,isActive:false})).status,403);
    assert.equal((await req('cashier','PATCH','',{id:ids.customer,isActive:false})).status,403);
    assert.equal((await req('manager','PATCH','',{id:ids.unknown,isActive:false})).status,403);
    assert.equal((await req('manager','PATCH','',{id:ids.customer,role:'SUPER_ADMIN'})).status,422);
    assert.equal((await req('manager','PATCH','',{id:ids.customer,isActive:false})).status,200);
    assert.equal((await req('manager','PATCH','',{id:ids.customer,isActive:true})).status,200);
    assert.equal((await req('super','PATCH','',{id:ids.super,isActive:false})).status,422);
    assert.equal((await req('super','DELETE',`?id=${ids.super}`)).status,422);
    assert.equal((await req('super','PATCH','',{id:ids.cashier,role:'SUPER_ADMIN',unexpected:true})).status,422);
    assert.equal((await req('super','POST','',staffBody,{Origin:'https://attacker.example'})).status,403);
    const forged=await fetch(`${urls[0]}/api/users`,{method:'PATCH',headers:{Cookie:`ipek_session=${tokens.super}`,Authorization:'Bearer forged','Content-Type':'application/json'},body:JSON.stringify({id:ids.cashier,isActive:false})}); assert.equal(forged.status,403);
    const noOrigin=await fetch(`${urls[0]}/api/users`,{method:'PATCH',headers:{Cookie:`ipek_session=${tokens.super}`,'Content-Type':'application/json'},body:JSON.stringify({id:ids.cashier,isActive:false})}); assert.equal(noOrigin.status,403);
    assert.equal((await req('super','DELETE',`?id=${ids.cashier}`,undefined,{Origin:'https://attacker.example'})).status,403);
    assert.equal((await req('super','PATCH','',{id:ids.cashier,name:'x'.repeat(17000)})).status,413);
    db.prepare("INSERT INTO app_settings (key,value) VALUES ('admin.role_matrix',?)").run(JSON.stringify({STORE_MANAGER:{registeredCustomers:false,users:true}}));
    assert.equal((await req('manager','GET','?type=customers')).status,403);
    assert.equal((await req('manager','PATCH','',{id:ids.customer,isActive:false})).status,403);
    assert.equal((await req('manager','GET','?type=staff')).status,200);
    assert.equal((await req('manager','PATCH','',{id:ids.cashier,isActive:false})).status,403);
    db.prepare("CREATE TRIGGER deny_user_audit BEFORE INSERT ON audit_logs WHEN new.action='USER_UPDATED' BEGIN SELECT RAISE(ABORT,'test'); END").run();
    assert.equal((await req('super','PATCH','',{id:ids.cashier,isActive:false})).status,500);
    assert.equal(db.prepare('SELECT is_active FROM users WHERE id=?').get(ids.cashier).is_active,1);
    db.prepare('DROP TRIGGER deny_user_audit').run();
    const created=await req('super','POST','',staffBody); assert.equal(created.status,200); assert.ok(created.data.data.id>ids.unknown);
    assert.equal((await req('super','DELETE',`?id=${created.data.data.id}`)).status,200);
    const next=await req('super','POST','',{...staffBody,email:'test2@example.test',role:'CASHIER'}); assert.ok(next.data.data.id>created.data.data.id);
    // Two admins race to disable each other. One succeeds; the other is no longer authorized.
    const race=await Promise.all([req('super','PATCH','',{id:ids.super2,isActive:false},{},0),req('super2','PATCH','',{id:ids.super,isActive:false},{},1)]);
    assert.equal(race.filter(x=>x.status===200).length,1,JSON.stringify(race)); assert.ok(race.some(x=>[401,403,422].includes(x.status)));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='SUPER_ADMIN' AND is_active=1").get().n,1); // only the race survivor remains
    assert.equal(db.pragma('foreign_key_check').length,0);
  } finally { for(const p of processes) if(p.exitCode===null) {p.kill('SIGTERM'); await new Promise(r=>p.once('exit',r));} db?.close(); fs.rmSync(dir,{recursive:true,force:true}); }
});
