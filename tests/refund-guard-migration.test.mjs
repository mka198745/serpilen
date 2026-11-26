import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import Database from 'better-sqlite3';
import {useHistorical0029} from './helpers/sqlite-0029-fixture.mjs';

test('0030 geçişi 0029 verilerini korur ve hata halinde atomik geri alınabilir',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guard-migration-')),file=path.join(dir,'db');let db;
 try {
  const result=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env:{...process.env,DATABASE_URL:`sqlite:${file}`},encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  db=new Database(file);db.pragma('foreign_keys=ON');useHistorical0029(db);
  db.exec("INSERT INTO categories(id,name,slug) VALUES(1,'Kategori','kategori'); INSERT INTO warehouses(id,name,code) VALUES(5,'Ortak','O'); INSERT INTO app_settings(key,value) VALUES('sales.shared_warehouse_id','5'); INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(1,'A','a','a',1,10); INSERT INTO inventory(warehouse_id,product_id,physical_qty,reserved_qty) VALUES(5,1,7,2)");
  const statements=fs.readFileSync('drizzle-sqlite/0030_refund_replay_guards.sql','utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean);
  const apply=()=>db.transaction(()=>{for(const stmt of statements)db.exec(stmt);db.prepare("INSERT INTO __migrations(tag) VALUES('0030_refund_replay_guards')").run();}).immediate();
  db.exec("CREATE TRIGGER fail_0030 BEFORE INSERT ON __migrations WHEN NEW.tag='0030_refund_replay_guards' BEGIN SELECT RAISE(ABORT,'migration_test_failure'); END");
  assert.throws(apply,/migration_test_failure/);assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='deleted_refund_guards'").get().n,0);assert.deepEqual(db.prepare('SELECT physical_qty,reserved_qty FROM inventory').get(),{physical_qty:7,reserved_qty:2});
  db.exec('DROP TRIGGER fail_0030');apply();assert.equal(db.prepare("SELECT count(*) n FROM __migrations WHERE tag='0030_refund_replay_guards'").get().n,1);assert.deepEqual(db.prepare('SELECT physical_qty,reserved_qty FROM inventory').get(),{physical_qty:7,reserved_qty:2});assert.equal(db.prepare("SELECT value FROM app_settings WHERE key='sales.shared_warehouse_id'").get().value,'5');assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
 } finally {db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
