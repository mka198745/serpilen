import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import Database from 'better-sqlite3';

test('Hosting 0021–0022 geçişi tek işlemde, yedek uyumuyla ve hatada geri alınarak çalışır', {timeout:40000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-host-migrate-')),dbfile=path.join(dir,'live.db'),backup=path.join(dir,'backup.db'),app=path.resolve('.build-tmp/hosting-app');let db;
 try{
  assert.ok(fs.existsSync(path.join(app,'node_modules/better-sqlite3/prebuilds/linux-x64.node')),'hosting test uygulaması hazırlanmalı');
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env:{...process.env,DATABASE_URL:`sqlite:${dbfile}`},encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);
  db=new Database(dbfile);db.exec("DROP INDEX account_transactions_customer_idx; DROP INDEX loyalty_transactions_order_idx; DROP INDEX order_return_items_return_idx; ALTER TABLE products DROP COLUMN technical_details; DELETE FROM __migrations WHERE tag IN ('0021_product_technical_details','0022_crm_merge_reference_indexes'); INSERT INTO customers(name,phone) VALUES('Test','5551234567');");
  const run=()=>spawnSync(process.execPath,['hosting/crm-migrate-0021-0022.cjs',dbfile,app,path.resolve('drizzle-sqlite'),backup],{encoding:'utf8'});
  await db.backup(backup);db.exec("UPDATE customers SET name='değişmiş' WHERE phone='5551234567'");let r=run();assert.notEqual(r.status,0);assert.match(r.stderr,/Veri yedekten sonra değişmiş/);assert.equal(db.prepare("SELECT count(*) AS n FROM __migrations WHERE tag LIKE '002%'").get().n,1);
  db.exec("CREATE TRIGGER fail_0022 BEFORE INSERT ON __migrations WHEN NEW.tag='0022_crm_merge_reference_indexes' BEGIN SELECT RAISE(ABORT,'test'); END");await db.backup(backup);r=run();assert.notEqual(r.status,0);assert.ok(!db.pragma('table_info(products)').some(x=>x.name==='technical_details'));assert.equal(db.prepare("SELECT count(*) AS n FROM __migrations WHERE tag IN ('0021_product_technical_details','0022_crm_merge_reference_indexes')").get().n,0);
  db.exec('DROP TRIGGER fail_0022');await db.backup(backup);r=run();assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/tek transaction/);assert.ok(db.pragma('table_info(products)').some(x=>x.name==='technical_details'));assert.equal(db.prepare("SELECT count(*) AS n FROM __migrations WHERE tag IN ('0021_product_technical_details','0022_crm_merge_reference_indexes')").get().n,2);assert.equal(db.prepare('SELECT name FROM customers WHERE phone=?').get('5551234567').name,'değişmiş');assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
  await db.backup(backup);r=run();assert.notEqual(r.status,0);assert.match(r.stderr,/Migration durumu/);
 }finally{db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
