import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import Database from 'better-sqlite3';
import {useHistorical0029} from './helpers/sqlite-0029-fixture.mjs';

test('0030 offline migration validates backup, refuses changes, rolls back and preserves previous records', {timeout:30000},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'migrate-0030-')),app=path.join(dir,'app'),live=path.join(dir,'live.db');let backup=path.join(dir,'backup.db'),db;
 try{
  fs.mkdirSync(path.join(app,'node_modules'),{recursive:true});fs.cpSync('node_modules/better-sqlite3',path.join(app,'node_modules/better-sqlite3'),{recursive:true});for(const pkg of ['bindings','file-uri-to-path'])fs.symlinkSync(path.resolve('node_modules',pkg),path.join(app,'node_modules',pkg),'dir');for(const binary of ['build/Release/better_sqlite3.node','prebuilds/linux-x64.node'])fs.copyFileSync('hosting/better_sqlite3-linux-x64-glibc228.node',path.join(app,'node_modules/better-sqlite3',binary));fs.cpSync('drizzle-sqlite',path.join(app,'drizzle-sqlite'),{recursive:true});
  const m=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env:{...process.env,DATABASE_URL:`sqlite:${live}`},encoding:'utf8'});assert.equal(m.status,0,m.stderr);
  db=new Database(live);useHistorical0029(db);db.exec("INSERT INTO warehouses(id,name,code) VALUES(5,'Ortak','O'); INSERT INTO app_settings(key,value) VALUES('sales.shared_warehouse_id','5')");
  const run=mode=>spawnSync(process.execPath,['hosting/migrate-0030.cjs',mode,live,backup,app],{encoding:'utf8'});
  db.exec("CREATE TRIGGER fail_0030 BEFORE INSERT ON __migrations WHEN NEW.tag='0030_refund_replay_guards' BEGIN SELECT RAISE(ABORT,'forced_rollback'); END");
  let r=run('inspect');assert.equal(r.status,0,r.stderr);r=run('backup');assert.equal(r.status,0,r.stderr);assert.notEqual(run('backup').status,0);
  r=run('apply');assert.notEqual(r.status,0);assert.match(r.stderr,/forced_rollback/);assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='deleted_refund_guards'").get().n,0);assert.equal(db.prepare("SELECT count(*) n FROM __migrations WHERE tag='0030_refund_replay_guards'").get().n,0);
  db.exec('DROP TRIGGER fail_0030');backup=path.join(dir,'backup2.db');r=run('backup');assert.equal(r.status,0,r.stderr);
  db.exec("UPDATE warehouses SET name='Değişti' WHERE id=5");r=run('apply');assert.notEqual(r.status,0);assert.match(r.stderr,/Yedekten sonra veri değişmiş/);assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='deleted_refund_guards'").get().n,0);
  db.exec("UPDATE warehouses SET name='Ortak' WHERE id=5");r=run('apply');assert.equal(r.status,0,r.stderr);assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);assert.equal(db.prepare("SELECT value FROM app_settings WHERE key='sales.shared_warehouse_id'").get().value,'5');assert.equal(db.prepare("SELECT count(*) n FROM __migrations WHERE tag='0030_refund_replay_guards'").get().n,1);assert.notEqual(run('apply').status,0);
  const saved=new Database(backup,{readonly:true});assert.equal(saved.prepare("SELECT count(*) n FROM __migrations WHERE tag='0030_refund_replay_guards'").get().n,0);saved.close();
 }finally{db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
