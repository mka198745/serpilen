import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import Database from 'better-sqlite3';
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port;}

test('Birleştirme ön incelemesi yalnız doğrudan bağlantıları sayar ve kayıtları değiştirmez', {timeout:30000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-compare-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try {
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);
  db=new Database(file);db.pragma('foreign_keys=ON');
  db.exec("INSERT INTO customers (id,name,phone,email) VALUES (1,'Bir','5551234567','one@example.test'),(2,'İki','5551234567','two@example.test'),(3,'Üç','5551234567','three@example.test'),(4,'Dört','5551234567','four@example.test')");
  const tokens={};for(const role of ['SUPER_ADMIN','STORE_MANAGER','CASHIER','B2C_CUSTOMER']){const id=db.prepare('INSERT INTO users(name,email,password_hash,role,customer_id) VALUES (?,?,?,?,?)').run(role,`${role}@example.test`,'hash',role,role==='B2C_CUSTOMER'?1:null).lastInsertRowid;const token=crypto.randomBytes(32).toString('hex');tokens[role]=token;db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(id,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);}
  db.prepare("INSERT INTO users(name,email,password_hash,role,customer_id) VALUES('Web','web@example.test','hash','B2C_CUSTOMER',2)").run();
  db.exec("INSERT INTO crm_tags(id,name,normalized_name) VALUES(1,'Ortak','ortak'),(2,'Bir','bir'),(3,'İki','iki'); INSERT INTO crm_customer_tags(customer_id,tag_id) VALUES(1,1),(1,2),(2,1),(2,3),(3,1)");
  db.exec("INSERT INTO crm_customer_notes(id,customer_id,body,created_by_id,created_by_name) VALUES(1,1,'gizli not',1,'Personel'),(2,1,'not iki',1,'Personel'),(3,2,'not üç',1,'Personel'); INSERT INTO crm_note_edit_state(note_id,revision,updated_by_id,updated_by_name) VALUES(1,2,1,'Personel'),(3,3,1,'Personel')");
  const review=db.prepare("INSERT INTO crm_duplicate_reviews(customer_low_id,customer_high_id,status,low_version,high_version,revision,reviewed_by_id,reviewed_by_name) VALUES(?,?,'UNSURE','a','b',1,1,'Personel')");review.run(1,2);review.run(1,3);review.run(2,3);review.run(3,4);
  const rfm=db.prepare("INSERT INTO rfm_scores(customer_id,period_days,recency_days,frequency,monetary,r_score,f_score,m_score,segment) VALUES(?,?,1,1,'100',1,1,1,'Test')");for(const [id,period] of [[1,90],[1,90],[1,365],[2,90],[2,90],[2,180],[3,365]])rfm.run(id,period);
  db.exec("UPDATE customers SET tax_number='GİZLİ123',credit_limit=25,notes='ESKİ GİZLİ NOT' WHERE id=1; UPDATE customers SET type='B2B',is_blocked=1 WHERE id=2; INSERT INTO orders(id,order_number,customer_id,customer_name,customer_email,grand_total) VALUES(1,'ONE',1,'Bir','one@example.test',10),(2,'GUEST',NULL,'Bir','one@example.test',10),(3,'TWO',2,'İki','two@example.test',20)");
  db.exec("INSERT INTO order_items(order_id,product_id,product_name,sku,unit_price,quantity,total_price) VALUES(1,1,'Ürün','S',1,1,1),(2,1,'Misafir','S',1,1,1); INSERT INTO order_status_history(order_id,to_status) VALUES(1,'PAID'),(2,'PAID'); INSERT INTO order_returns(id,return_number,order_id,order_number) VALUES(1,'I1',1,'ONE'),(2,'IG',2,'GUEST'); INSERT INTO order_return_items(return_id,order_item_id,product_id,product_name,quantity) VALUES(1,1,1,'Ürün',1),(2,2,1,'Misafir',1)");
  db.exec("INSERT INTO loyalty_transactions(customer_id,points,type,order_id) VALUES(1,1,'EARN',3),(1,1,'EARN',2),(1,1,'EARN',999),(1,1,'BONUS',NULL),(2,1,'EARN',1),(2,1,'EARN',3)");
  const tables=['customers','users','orders','order_items','order_status_history','order_returns','order_return_items','loyalty_transactions','crm_customer_notes','crm_note_edit_state','crm_customer_tags','crm_duplicate_reviews','rfm_scores'];const snapshot=()=>Object.fromEntries(tables.map(t=>[t,db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));const before=snapshot();
  const port=await freePort();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production'},stdio:'ignore'});const base=`http://127.0.0.1:${port}`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base+'/api/crm/customers');ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const req=(id,target,role)=>fetch(`${base}/api/crm/customers/${id}/merge-preview?target=${target}`,{headers:role?{Authorization:`Bearer ${tokens[role]}`}:{}});
  assert.equal((await req(1,2)).status,401);assert.equal((await req(1,2,'CASHIER')).status,403);assert.equal((await req(1,2,'B2C_CUSTOMER')).status,403);assert.equal((await req(1,1,'SUPER_ADMIN')).status,422);assert.equal((await req(1,999,'SUPER_ADMIN')).status,404);
  const response=await req(1,2,'SUPER_ADMIN');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);const p=await response.json();assert.equal(p.canMerge,false);assert.deepEqual(p.data.comparison,{sharedTags:1,sharedRfmPeriods:1,fieldConflicts:['type','taxNumber','creditLimit','blocked']});assert.deepEqual([p.data.source.counts.orderItems,p.data.source.counts.orderStatusEvents,p.data.source.counts.returns,p.data.source.counts.returnItems],[1,1,1,1]);assert.equal(p.data.source.counts.mismatchedLoyaltyOrders,3);assert.equal(p.data.target.counts.mismatchedLoyaltyOrders,1);assert.equal(p.data.source.counts.foreignLoyaltyForOrders,1);assert.equal(p.data.target.counts.foreignLoyaltyForOrders,1);assert.equal(p.data.source.counts.legacyNotePresent,1);assert.equal(p.data.target.counts.legacyNotePresent,0);assert.doesNotMatch(JSON.stringify(p),/GİZLİ123|ESKİ GİZLİ NOT/);assert.equal(p.data.source.counts.accounts,1);assert.equal(p.data.target.counts.accounts,1);assert.equal(p.data.source.counts.orders,1);assert.equal(p.data.source.counts.notes,2);assert.equal(p.data.source.counts.editedNotes,1);assert.equal(p.data.target.counts.editedNotes,1);assert.equal(p.data.source.counts.duplicateReviews,2);assert.equal(p.data.target.counts.duplicateReviews,2);assert.equal(p.data.source.counts.rfmScores,3);
  const reverse=await(await req(2,1,'SUPER_ADMIN')).json();assert.deepEqual(reverse.data.comparison,p.data.comparison);assert.equal(reverse.data.source.counts.notes,1);
  const empty=await(await req(1,4,'SUPER_ADMIN')).json();assert.deepEqual(empty.data.comparison,{sharedTags:0,sharedRfmPeriods:0,fieldConflicts:['taxNumber','creditLimit']});assert.equal(empty.data.target.counts.editedNotes,0);assert.equal(empty.data.target.counts.duplicateReviews,1);
  assert.deepEqual(snapshot(),before);const audit=db.prepare("SELECT details FROM audit_logs WHERE action='CRM_MERGE_PREVIEW'").all();assert.equal(audit.length,3);assert.doesNotMatch(JSON.stringify(audit),/example\.test|5551234567|gizli not/);
  db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs WHEN NEW.action='CRM_MERGE_PREVIEW' BEGIN SELECT RAISE(ABORT,'failed'); END");assert.equal((await req(1,2,'SUPER_ADMIN')).status,500);db.exec('DROP TRIGGER fail_audit');assert.deepEqual(snapshot(),before);
  db.prepare("INSERT INTO app_settings(key,value) VALUES('admin.role_matrix',?)").run(JSON.stringify({STORE_MANAGER:{crm:true,crmWrite:false}}));assert.equal((await req(1,2,'STORE_MANAGER')).status,403);
  assert.deepEqual(db.pragma('foreign_key_check'),[]);
 } finally {if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
