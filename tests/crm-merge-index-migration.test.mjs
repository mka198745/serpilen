import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import Database from 'better-sqlite3';

test('0022 bağlantı indeksleri eski veri kopyasında güvenle eklenir ve tekrar atlanır', {timeout:30000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-indexes-')),file=path.join(dir,'db.sqlite'),backup=path.join(dir,'pre-0022.sqlite'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db;
 try{
  const migrate=()=>spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});let run=migrate();assert.equal(run.status,0,run.stderr);db=new Database(file);db.pragma('foreign_keys=ON');
  db.exec("INSERT INTO customers(id,name,phone) VALUES(1,'Mevcut','5551234567'); INSERT INTO orders(id,order_number,customer_id,customer_name) VALUES(1,'ORD',1,'Mevcut'); INSERT INTO account_transactions(customer_id,type,amount,balance_after) VALUES(1,'DEBIT',10,10); INSERT INTO loyalty_transactions(customer_id,points,type,order_id) VALUES(1,5,'EARN',1); INSERT INTO order_returns(id,return_number,order_id,order_number) VALUES(1,'RET',1,'ORD'); INSERT INTO order_return_items(return_id,order_item_id,product_id,product_name,quantity) VALUES(1,1,1,'Ürün',1)");
  db.exec("DROP INDEX account_transactions_customer_idx; DROP INDEX loyalty_transactions_order_idx; DROP INDEX order_return_items_return_idx; DELETE FROM __migrations WHERE tag='0022_crm_merge_reference_indexes'");
  const tables=['customers','orders','account_transactions','loyalty_transactions','order_returns','order_return_items'];const snapshot=()=>Object.fromEntries(tables.map(t=>[t,db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));const before=snapshot();await db.backup(backup);
  run=migrate();assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/uygulanıyor: 0022_crm_merge_reference_indexes/);assert.deepEqual(snapshot(),before);assert.equal(db.pragma('quick_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
  for(const [query,index] of [['SELECT * FROM account_transactions WHERE customer_id=1','account_transactions_customer_idx'],['SELECT * FROM loyalty_transactions WHERE order_id=1','loyalty_transactions_order_idx'],['SELECT * FROM order_return_items WHERE return_id=1','order_return_items_return_idx']])assert.match(db.prepare('EXPLAIN QUERY PLAN '+query).all().map(x=>x.detail).join(' '),new RegExp(index));
  run=migrate();assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/atlandı \(uygulanmış\): 0022_crm_merge_reference_indexes/);assert.deepEqual(snapshot(),before);
  const old=new Database(backup,{readonly:true});assert.equal(old.pragma('quick_check',{simple:true}),'ok');assert.equal(old.prepare('SELECT COUNT(*) AS n FROM loyalty_transactions').get().n,1);assert.equal(old.prepare("SELECT count(*) n FROM __migrations WHERE tag='0022_crm_merge_reference_indexes'").get().n,0);old.close();
 }finally{db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
