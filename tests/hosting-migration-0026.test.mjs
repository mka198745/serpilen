import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import Database from 'better-sqlite3';

async function fixture() {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'release-migration-')),app=path.join(dir,'standalone'),dbfile=path.join(dir,'live.db'),backup=path.join(dir,'backup.db');
 fs.mkdirSync(path.join(app,'node_modules'),{recursive:true});fs.cpSync('node_modules/better-sqlite3',path.join(app,'node_modules/better-sqlite3'),{recursive:true});fs.copyFileSync('hosting/better_sqlite3-linux-x64-glibc228.node',path.join(app,'node_modules/better-sqlite3/prebuilds/linux-x64.node'));fs.cpSync('drizzle-sqlite',path.join(app,'drizzle-sqlite'),{recursive:true});
 const db=new Database(dbfile);db.pragma('journal_mode = WAL');db.pragma('foreign_keys = ON');db.exec('CREATE TABLE __migrations(tag TEXT PRIMARY KEY NOT NULL)');
 const entries=JSON.parse(fs.readFileSync('drizzle-sqlite/meta/_journal.json','utf8')).entries.filter(e=>e.idx<=22);
 for(const e of entries){for(const s of fs.readFileSync(`drizzle-sqlite/${e.tag}.sql`,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))db.exec(s);db.prepare('INSERT INTO __migrations VALUES(?)').run(e.tag);}
 db.exec("INSERT INTO categories(id,name,slug) VALUES(1,'İplik','iplik'),(2,'Dikiş','dikis'); INSERT INTO brands(id,name,slug) VALUES(1,'Marka','marka'); INSERT INTO products(id,name,slug,sku,brand_id,category_id) VALUES(1,'Bir','bir','bir',1,1),(2,'İki','iki','iki',1,2)");
 const run=()=>spawnSync(process.execPath,['hosting/migrate-f664103.cjs',dbfile,backup,app],{encoding:'utf8'});
 return {dir,db,backup,run};
}

test('0023–0026 fresh snapshot üzerinden tek transaction içinde uygulanır',async()=>{
 const f=await fixture();try{await f.db.backup(f.backup);const before=f.db.prepare('SELECT * FROM products ORDER BY id').all();const result=f.run();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/bütünlüğü: ok/);assert.deepEqual(f.db.prepare('SELECT * FROM products ORDER BY id').all(),before);assert.deepEqual(f.db.prepare('SELECT * FROM brand_categories ORDER BY category_id').all(),[{brand_id:1,category_id:1},{brand_id:1,category_id:2}]);assert.equal(f.db.prepare("SELECT count(*) n FROM __migrations WHERE tag >= '0023'").get().n,4);assert.notEqual(f.run().status,0);}finally{f.db.close();fs.rmSync(f.dir,{recursive:true,force:true});}
});

test('yedekten sonra değişen veri tüm işlemi engeller',async()=>{
 const f=await fixture();try{await f.db.backup(f.backup);f.db.prepare("INSERT INTO brands(name,slug) VALUES('Sonradan','sonradan')").run();const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/yedekten sonra değişmiş/);assert.equal(f.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='brand_categories'").get().n,0);assert.equal(f.db.prepare("SELECT count(*) n FROM __migrations WHERE tag >= '0023'").get().n,0);}finally{f.db.close();fs.rmSync(f.dir,{recursive:true,force:true});}
});

test('işlem ortasındaki SQL hatası tüm migrationları geri alır',async()=>{
 const f=await fixture();try{f.db.exec("CREATE TRIGGER reject_migration BEFORE INSERT ON __migrations WHEN NEW.tag='0025_pos_sale_intents' BEGIN SELECT RAISE(ABORT,'zorunlu test hatası'); END");await f.db.backup(f.backup);const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/zorunlu test hatası/);assert.equal(f.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name IN ('order_discount_claims','order_notification_outbox','pos_sale_intents','brand_categories')").get().n,0);assert.equal(f.db.prepare("SELECT count(*) n FROM __migrations WHERE tag >= '0023'").get().n,0);}finally{f.db.close();fs.rmSync(f.dir,{recursive:true,force:true});}
});
