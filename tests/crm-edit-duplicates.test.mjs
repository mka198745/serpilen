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
  const s = net.createServer();
  await new Promise((resolve, reject) => { s.once('error', reject); s.listen(0, '127.0.0.1', resolve); });
  const p = s.address().port;
  await new Promise(resolve => s.close(resolve));
  return p;
}

test('CRM düzenlemede çakışma, eşzamanlılık ve gövde sınırları', { timeout: 30000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-edit-duplicates-'));
  const dbPath = path.join(dir, 'test.db');
  const env = { ...process.env, DATABASE_URL: `sqlite:${dbPath}` };
  const servers = [];
  try {
    const migration = spawnSync(process.execPath, ['scripts/db-apply.mjs'], { env, encoding: 'utf8', timeout: 15000 });
    assert.equal(migration.status, 0, migration.stderr);
    const db = new Database(dbPath);
    const customer = db.prepare('INSERT INTO customers (id,name,phone,email) VALUES (?,?,?,?)');
    customer.run(1,'İlk','+90 (555) 123-45-67','shared@example.test');
    customer.run(2,'Eski yinelenen','90555 1234567',' SHARED@example.test ');
    customer.run(3,'Üçüncü','555 777 7777','unique@example.test');
    customer.run(4,'Dördüncü','555 888 8888',null);
    customer.run(5,'Beşinci','555 999 9999',null);
    customer.run(6,'Eski geçersiz','000','gecersiz');
    const tokens = {};
    for (const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER']) {
      const id=db.prepare('INSERT INTO users (email,password_hash,name,role) VALUES (?,?,?,?)').run(`${role}@example.test`,'hash',role,role).lastInsertRowid;
      const token=crypto.randomBytes(32).toString('hex'); tokens[role]=token;
      db.prepare('INSERT INTO admin_sessions (user_id,jti,expires_at) VALUES (?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);
    }
    db.close();
    const bases = [];
    for (let i=0; i<2; i++) {
      const port=await freePort();const server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});servers.push(server);const base=`http://127.0.0.1:${port}`;bases.push(base);
      let ready=false;for(let j=0;j<100;j++){try{await fetch(base+'/api/crm/customers');ready=true;break;}catch{if(server.exitCode!==null) throw Error('Sunucu kapandı');await delay(100);}}assert.ok(ready);
    }
    const req = (url, role='SUPER_ADMIN', method='GET', body, base=bases[0]) => fetch(base+url,{method,headers:{...(role?{Authorization:`Bearer ${tokens[role]}`} : {}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    const getEditable = async (id) => { const detail = await (await req(`/api/crm/customers/${id}`)).json(); const c=detail.data.customer; return {name:c.name,phone:c.phone,email:c.email??'',city:c.city??'',address:c.address??'',companyName:c.companyName??'',editVersion:detail.data.editVersion}; };
    const patch = (id, body, base=bases[0], role='SUPER_ADMIN') => req(`/api/crm/customers/${id}`,role,'PATCH',body,base);
    let three = await getEditable(3);
    assert.equal((await patch(3,{...three,email:' SHARED@EXAMPLE.TEST '})).status,409);
    assert.equal((await patch(3,{...three,phone:'905551234567'})).status,409);
    assert.equal((await patch(3,{...three,phone:'555+1234567'})).status,422);
    assert.equal((await patch(3,{...three,phone:'555\n1234567'})).status,422);
    assert.equal((await patch(3,{...three,phone:'5'.repeat(7)+' '.repeat(40)+'7'})).status,422);
    const snapshot = new Database(dbPath,{readonly:true});
    assert.equal(snapshot.prepare('SELECT email FROM customers WHERE id=3').get().email,'unique@example.test');
    assert.equal(snapshot.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='CRM_CUSTOMER_UPDATED' AND entity_id='3'").get().n,0);snapshot.close();
    const existing=await getEditable(1);
    assert.equal((await patch(1,{...existing,name:'Yeni ad'})).status,200); // legacy duplicate does not block unrelated edits
    const format=await getEditable(1);
    assert.equal((await patch(1,{...format,phone:'905551234567',email:'SHARED@EXAMPLE.TEST'})).status,200); // same normalized values
    const sameVersion=await getEditable(1);
    const sameRecordRace=await Promise.all([patch(1,{...sameVersion,name:'Eşzamanlı A'},bases[0]),patch(1,{...sameVersion,name:'Eşzamanlı B'},bases[1])]);
    assert.deepEqual(sameRecordRace.map(r=>r.status).sort(),[200,409]);
    const invalidLegacy=await getEditable(6);
    assert.equal((await patch(6,{...invalidLegacy,city:'Adana'})).status,200); // unchanged invalid legacy values
    three=await getEditable(3);
    assert.equal((await patch(3,{...three,email:''})).status,200); // clearing optional email
    assert.equal((await patch(3,three)).status,409); // stale version
    const four=await getEditable(4), five=await getEditable(5);
    const race=await Promise.all([patch(4,{...four,email:'race@example.test'},bases[0]),patch(5,{...five,email:'race@example.test'},bases[1])]);
    assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
    let verify=new Database(dbPath,{readonly:true});assert.equal(verify.prepare("SELECT COUNT(*) n FROM customers WHERE email='race@example.test'").get().n,1);verify.close();
    const updateBody=await getEditable(3);
    const fresh={name:'Yeni',phone:'5552222233',email:'newrace@example.test',city:'',address:'',companyName:''};
    const createRace=await Promise.all([patch(3,{...updateBody,email:'newrace@example.test'},bases[0]),req('/api/crm/customers','SUPER_ADMIN','POST',fresh,bases[1])]);
    assert.ok([[200,409],[409,201]].some(expected=>expected.every((value,index)=>createRace[index].status===value)));
    verify=new Database(dbPath,{readonly:true});assert.equal(verify.prepare("SELECT COUNT(*) n FROM customers WHERE email='newrace@example.test'").get().n,1);verify.close();
    const check=await getEditable(4);
    assert.equal((await patch(4,{...check,name:'İzinsiz'},bases[0], 'CASHIER')).status,403);
    assert.equal((await patch(4,{...check,name:'İzinsiz'},bases[0], null)).status,401);
    const trigger=new Database(dbPath);trigger.exec("CREATE TRIGGER fail_edit BEFORE INSERT ON audit_logs WHEN NEW.action='CRM_CUSTOMER_UPDATED' BEGIN SELECT RAISE(ABORT,'audit failure'); END");trigger.close();
    assert.equal((await patch(4,{...check,name:'Geri alınır'})).status,500);
    const verifyRollback=new Database(dbPath);assert.notEqual(verifyRollback.prepare('SELECT name FROM customers WHERE id=4').get().name,'Geri alınır');verifyRollback.exec('DROP TRIGGER fail_edit');verifyRollback.close();
    const bodyStream=()=>new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(' '.repeat(17000)));controller.close();}});
    for (const [url,method] of [['/api/crm/customers/1','PATCH'],['/api/crm/customers/1/notes','POST']]) {
      const oversized=await fetch(bases[0]+url,{method,headers:{Authorization:`Bearer ${tokens.SUPER_ADMIN}`,'Content-Type':'application/json'},body:bodyStream(),duplex:'half'});assert.equal(oversized.status,413);
      const malformed=await fetch(bases[0]+url,{method,headers:{Authorization:`Bearer ${tokens.SUPER_ADMIN}`,'Content-Type':'application/json'},body:'{'});assert.equal(malformed.status,400);
    }
    assert.equal((await req('/api/role-matrix','SUPER_ADMIN','POST',{matrix:{STORE_MANAGER:{crm:true,crmWrite:false}}})).status,200);
    assert.equal((await patch(4,check,bases[0],'STORE_MANAGER')).status,403);
    assert.equal((await req('/api/crm/customers/1/notes','STORE_MANAGER','POST',{body:'yetkisiz'})).status,403);
  } finally {
    await Promise.all(servers.map(async server=>{if(server.exitCode===null){server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));}}));
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
