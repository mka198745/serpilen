import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import Database from 'better-sqlite3';
import {useHistorical0029} from './helpers/sqlite-0029-fixture.mjs';

test('0029 çevrimdışı dağıtımı: yedek, değişiklik tespiti, atomik hata ve geri dönüş', {timeout:60000}, () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'migrate-supplier-')),app=path.join(dir,'app'),live=path.join(dir,'live.db'),backup=path.join(dir,'backup.db'),faultBackup=path.join(dir,'fault.db'),mutatingBackup=path.join(dir,'mutating.db');
 try {
  fs.mkdirSync(path.join(app,'node_modules'),{recursive:true});fs.cpSync('node_modules/better-sqlite3',path.join(app,'node_modules/better-sqlite3'),{recursive:true});
  for(const pkg of ['bindings','file-uri-to-path'])fs.symlinkSync(path.resolve('node_modules',pkg),path.join(app,'node_modules',pkg),'dir');
  for(const binary of ['build/Release/better_sqlite3.node','prebuilds/linux-x64.node'])fs.copyFileSync('hosting/better_sqlite3-linux-x64-glibc228.node',path.join(app,'node_modules/better-sqlite3',binary));
  fs.cpSync('drizzle-sqlite',path.join(app,'drizzle-sqlite'),{recursive:true});fs.copyFileSync('tests/fixtures/journal-0029.json',path.join(app,'drizzle-sqlite/meta/_journal.json'));
  const env={...process.env,DATABASE_URL:`sqlite:${live}`};let r=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  let db=new Database(live);db.pragma('foreign_keys=ON');useHistorical0029(db);db.exec(`DROP TABLE supplier_command_fences;DROP TABLE supplier_return_items;DROP TABLE supplier_returns;DROP TABLE supplier_receipt_requests;DROP TABLE supplier_order_coverage;DELETE FROM __migrations WHERE tag='0029_supplier_returns';
   INSERT INTO categories(id,name,slug) VALUES(1,'Kategori','kategori');INSERT INTO warehouses(id,name,code) VALUES(5,'Serpilen Collection','SC');
   INSERT INTO app_settings(key,value) VALUES('sales.shared_warehouse_id','5');INSERT INTO suppliers(id,name,payment_terms) VALUES(1,'Firma','30 Gün Vade');
   INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(1,'Ürün','urun','urun',1,10);
   INSERT INTO inventory(warehouse_id,product_id,physical_qty,reserved_qty) VALUES(5,1,8,2);
   INSERT INTO purchase_orders(id,po_number,supplier_id,warehouse_id,status) VALUES(1,'PO-1',1,5,'ORDERED');
   INSERT INTO purchase_order_items(purchase_order_id,product_id,quantity,received_qty,unit_cost,total_cost) VALUES(1,1,5,0,10,50);
   CREATE TABLE comparison_fixture(label TEXT COLLATE NOCASE);INSERT INTO comparison_fixture VALUES('a'),('a'),('b');`);db.close();
  const run=(mode,dest=backup)=>spawnSync(process.execPath,['hosting/migrate-0029.cjs',mode,live,dest,app],{encoding:'utf8'});
  r=run('inspect','-');assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).ortak_depo.id,5);
  r=run('backup');assert.equal(r.status,0,r.stderr);assert.notEqual(run('backup').status,0);assert.equal(fs.statSync(backup).mode & 0o777,0o600);
  db=new Database(live);db.prepare("UPDATE comparison_fixture SET label='A' WHERE rowid=1").run();db.close();r=run('apply');assert.notEqual(r.status,0);assert.match(r.stderr,/veri değişmiş/);
  db=new Database(live);db.prepare("UPDATE comparison_fixture SET label='a' WHERE rowid=1").run();db.prepare("UPDATE comparison_fixture SET label='b' WHERE rowid=2").run();db.close();r=run('apply');assert.notEqual(r.status,0);assert.match(r.stderr,/veri değişmiş/);
  db=new Database(live);db.prepare("UPDATE comparison_fixture SET label='a' WHERE rowid=2").run();db.exec('CREATE TABLE unexpected_schema(id INTEGER)');db.close();r=run('apply');assert.notEqual(r.status,0);assert.match(r.stderr,/şema değişmiş/);
  db=new Database(live);db.exec('DROP TABLE unexpected_schema');const seq=db.prepare("SELECT seq FROM sqlite_sequence WHERE name='audit_logs'").get();db.exec("INSERT INTO audit_logs(action,entity) VALUES('TEST','TEST');DELETE FROM audit_logs WHERE action='TEST'");db.close();r=run('apply');assert.notEqual(r.status,0);assert.match(r.stderr,/sqlite_sequence/);
  db=new Database(live);if(seq)db.prepare("UPDATE sqlite_sequence SET seq=? WHERE name='audit_logs'").run(seq.seq);else db.prepare("DELETE FROM sqlite_sequence WHERE name='audit_logs'").run();
  db.exec("CREATE TRIGGER test_migration_failure BEFORE INSERT ON __migrations WHEN NEW.tag='0029_supplier_returns' BEGIN SELECT RAISE(ABORT,'test failure'); END");db.close();
  r=run('backup',faultBackup);assert.equal(r.status,0,r.stderr);r=run('apply',faultBackup);assert.notEqual(r.status,0);assert.match(r.stderr,/test failure/);
  db=new Database(live);assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='supplier_returns'").get().n,0);assert.equal(db.prepare("SELECT count(*) n FROM __migrations WHERE tag='0029_supplier_returns'").get().n,0);db.exec('DROP TRIGGER test_migration_failure');
  db.exec("CREATE TRIGGER test_migration_mutation AFTER INSERT ON __migrations WHEN NEW.tag='0029_supplier_returns' BEGIN UPDATE inventory SET physical_qty=99; END");db.close();
  r=run('backup',mutatingBackup);assert.equal(r.status,0,r.stderr);r=run('apply',mutatingBackup);assert.notEqual(r.status,0);assert.match(r.stderr,/veri değişmiş: inventory/);
  db=new Database(live);assert.equal(db.prepare('SELECT physical_qty FROM inventory').get().physical_qty,8);assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='supplier_returns'").get().n,0);db.exec('DROP TRIGGER test_migration_mutation');db.close();
  r=run('apply');assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/atomik uygulandı/);assert.notEqual(run('apply').status,0);
  db=new Database(live,{readonly:true});assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);assert.deepEqual(db.prepare('SELECT physical_qty,reserved_qty FROM inventory').get(),{physical_qty:8,reserved_qty:2});assert.equal(db.prepare('SELECT status FROM purchase_orders').get().status,'ORDERED');assert.equal(db.prepare('SELECT value FROM app_settings WHERE key=\'sales.shared_warehouse_id\'').get().value,'5');db.close();
  const restored=path.join(dir,'restored.db');fs.copyFileSync(backup,restored);db=new Database(restored,{readonly:true});assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.equal(db.prepare("SELECT count(*) n FROM __migrations WHERE tag='0029_supplier_returns'").get().n,0);assert.deepEqual(db.prepare('SELECT physical_qty,reserved_qty FROM inventory').get(),{physical_qty:8,reserved_qty:2});db.close();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
