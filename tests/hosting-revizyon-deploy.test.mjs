import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import Database from 'better-sqlite3';
import {useHistorical0029} from './helpers/sqlite-0029-fixture.mjs';

test('Revizyon dağıtım kontrolü 0029, yedek, eşitlik ve veri değişikliğini doğrular', {timeout:60000},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'revizyon-deploy-'));const file=path.join(dir,'test.db'),backup=path.join(dir,'backup.db'),app=path.join(dir,'standalone');
 let db;
 const run=(mode,dest=backup)=>spawnSync(process.execPath,['hosting/revizyon-deploy-check.cjs',mode,file,dest,app],{encoding:'utf8'});
 try{
  fs.mkdirSync(path.join(app,'node_modules'),{recursive:true});
  fs.cpSync(path.resolve('.next/standalone/node_modules/better-sqlite3'),path.join(app,'node_modules/better-sqlite3'),{recursive:true});
  fs.cpSync(path.resolve('drizzle-sqlite'),path.join(app,'drizzle-sqlite'),{recursive:true});fs.copyFileSync('tests/fixtures/journal-0029.json',path.join(app,'drizzle-sqlite/meta/_journal.json'));
  const binding=path.resolve('hosting/better_sqlite3-linux-x64-glibc228.node');
  for(const p of ['prebuilds/linux-x64.node','build/Release/better_sqlite3.node']) fs.copyFileSync(binding,path.join(app,'node_modules/better-sqlite3',p));
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env:{...process.env,DATABASE_URL:`sqlite:${file}`},encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);
  db=new Database(file);useHistorical0029(db);db.exec("INSERT INTO categories(id,name,slug) VALUES(1,'Test','test'); INSERT INTO warehouses(id,name,code) VALUES(5,'Ortak','ORTAK'); INSERT INTO app_settings(key,value) VALUES('sales.shared_warehouse_id','5'); INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(1,'Ürün','urun','U1',1,10); INSERT INTO inventory(warehouse_id,product_id,physical_qty,reserved_qty) VALUES(5,1,7,2)");
  let result=run('inspect','-');assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).ortak_depo.id,5);
  result=run('backup');assert.equal(result.status,0,result.stderr);assert.equal(fs.statSync(backup).mode&0o777,0o600);
  result=run('backup');assert.notEqual(result.status,0,'existing backup cannot be overwritten');
  result=run('check');assert.equal(result.status,0,result.stderr);
  db.prepare('UPDATE inventory SET physical_qty=8 WHERE product_id=1').run();result=run('check');assert.notEqual(result.status,0);assert.match(result.stderr,/veri değişmiş/);
  db.prepare('UPDATE inventory SET physical_qty=7 WHERE product_id=1').run();result=run('check');assert.equal(result.status,0,result.stderr);
  db.prepare("DELETE FROM __migrations WHERE tag='0029_supplier_returns'").run();result=run('inspect','-');assert.notEqual(result.status,0);assert.match(result.stderr,/0029/);
 }finally{db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
