import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import Database from 'better-sqlite3';
test('Ortak depo hosting denetimi salt okunur, açık stokta durur ve yedeği karşılaştırır',{timeout:30000},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shared-deploy-')),app=path.join(dir,'app'),live=path.join(dir,'live.db'),backup=path.join(dir,'backup.db');
 try{
  fs.mkdirSync(path.join(app,'node_modules'),{recursive:true});fs.cpSync('node_modules/better-sqlite3',path.join(app,'node_modules/better-sqlite3'),{recursive:true});
  for(const pkg of ['bindings','file-uri-to-path'])fs.symlinkSync(path.resolve('node_modules',pkg),path.join(app,'node_modules',pkg),'dir');
  for(const binary of ['build/Release/better_sqlite3.node','prebuilds/linux-x64.node'])fs.copyFileSync('hosting/better_sqlite3-linux-x64-glibc228.node',path.join(app,'node_modules/better-sqlite3',binary));
  let r=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env:{...process.env,DATABASE_URL:`sqlite:${live}`},encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  const db=new Database(live);db.exec("INSERT INTO warehouses(id,name,code) VALUES(2,'Mağaza','M'); INSERT INTO inventory(warehouse_id,product_id,physical_qty,reserved_qty) VALUES(2,1,1,0)");
  const run=mode=>spawnSync(process.execPath,['hosting/shared-deploy-check.cjs',mode,live,backup,app],{encoding:'utf8'});
  r=run('inspect');assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).blockers.sifir_olmayan_stok,1);assert.equal(db.prepare('SELECT physical_qty FROM inventory').get().physical_qty,1);
  r=run('backup');assert.notEqual(r.status,0);assert.equal(fs.existsSync(backup),false);
  db.exec('UPDATE inventory SET physical_qty=0');r=run('backup');assert.equal(r.status,0,r.stderr);assert.notEqual(run('backup').status,0);
  assert.equal(run('check').status,0);db.exec("INSERT INTO audit_logs(action,entity) VALUES('TEST','Test')");r=run('check');assert.notEqual(r.status,0);assert.match(r.stderr,/Yedekten sonra canlı veri değişmiş/);db.exec("DELETE FROM audit_logs WHERE action='TEST'");assert.notEqual(run('check').status,0); // sqlite_sequence changed too
  db.close();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
