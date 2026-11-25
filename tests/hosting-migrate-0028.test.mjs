import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import Database from 'better-sqlite3';

test('0028 hosting migration validates backup, aborts on changed data, and commits atomically', {timeout:30000}, () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'migrate-warehouse-')),app=path.join(dir,'app'),live=path.join(dir,'live.db'),backup=path.join(dir,'backup.db');
 try {
  fs.mkdirSync(path.join(app,'node_modules'),{recursive:true});fs.cpSync('node_modules/better-sqlite3',path.join(app,'node_modules/better-sqlite3'),{recursive:true});
  for(const pkg of ['bindings','file-uri-to-path'])fs.symlinkSync(path.resolve('node_modules',pkg),path.join(app,'node_modules',pkg),'dir');
  for(const binary of ['build/Release/better_sqlite3.node','prebuilds/linux-x64.node'])fs.copyFileSync('hosting/better_sqlite3-linux-x64-glibc228.node',path.join(app,'node_modules/better-sqlite3',binary));
  fs.cpSync('drizzle-sqlite',path.join(app,'drizzle-sqlite'),{recursive:true});
  // 0028's historical offline script intentionally pins its original journal.
  fs.copyFileSync('tests/fixtures/journal-0028.json',path.join(app,'drizzle-sqlite/meta/_journal.json'));
  const env={...process.env,DATABASE_URL:`sqlite:${live}`};let r=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  const db=new Database(live);for(const x of db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'warehouse_guard_%'").all())db.exec(`DROP TRIGGER "${x.name}"`);db.exec("DROP TABLE supplier_command_fences; DROP TABLE supplier_return_items; DROP TABLE supplier_returns; DROP TABLE supplier_receipt_requests; DROP TABLE supplier_order_coverage; DELETE FROM __migrations WHERE tag IN ('0028_warehouse_reference_guards','0029_supplier_returns'); INSERT INTO warehouses(id,name,code) VALUES(1,'Merkez','M')");db.close();
  const run=mode=>spawnSync(process.execPath,['hosting/migrate-0028.cjs',mode,live,backup,app],{encoding:'utf8'});
  r=run('backup');assert.equal(r.status,0,r.stderr);assert.notEqual(run('backup').status,0);
  const changed=new Database(live);changed.prepare("UPDATE warehouses SET name='Değişti' WHERE id=1").run();changed.close();
  r=run('apply');assert.notEqual(r.status,0);assert.match(r.stderr,/Yedekten sonra veri değişmiş/);
  const verify=new Database(live);assert.equal(verify.prepare("SELECT count(*) n FROM __migrations WHERE tag='0028_warehouse_reference_guards'").get().n,0);assert.equal(verify.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE 'warehouse_guard_%'").get().n,0);verify.prepare("UPDATE warehouses SET name='Merkez' WHERE id=1").run();verify.close();
  r=run('apply');assert.equal(r.status,0,r.stderr);const after=new Database(live);assert.equal(after.pragma('integrity_check',{simple:true}),'ok');assert.equal(after.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE 'warehouse_guard_%'").get().n,24);after.close();assert.notEqual(run('apply').status,0);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
