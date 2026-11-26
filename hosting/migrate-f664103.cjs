'use strict';
// 0023–0026: run only with all live writers stopped and a freshly verified online SQLite backup.
// A mismatch aborts the transaction without guessing or overwriting existing data.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const [dbArg, backupArg, appArg] = process.argv.slice(2);
if (![dbArg, backupArg, appArg].every(p => p && path.isAbsolute(p))) throw new Error('Mutlak canlı veritabanı, yedek ve paket standalone yolları gereklidir.');
const dbPath = fs.realpathSync(dbArg), backup = fs.realpathSync(backupArg), app = fs.realpathSync(appArg);
const a = fs.statSync(dbPath), b = fs.statSync(backup);
if (!a.isFile() || !b.isFile() || dbPath === backup || (a.dev === b.dev && a.ino === b.ino)) throw new Error('Hedef ve yedek farklı dosyalar olmalıdır.');
const digest = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const binding = path.join(app,'node_modules/better-sqlite3/prebuilds/linux-x64.node');
if (digest(binding)!=='2d5e0ddafab5f642a82ede046bd3b77786c61001ae289bbabf962530ca5831d5') throw new Error('CloudLinux SQLite binding doğrulaması başarısız.');
const Database = require(path.join(app,'node_modules/better-sqlite3'));
const migrations = path.join(app,'drizzle-sqlite');
const journalPath = path.join(migrations,'meta/_journal.json');
if (digest(journalPath)!=='a040ad332d5def4c6ce2d01d67c2ff3e696f3ef3db4c6a321b417d61349b6032') throw new Error('Migration listesi beklenen sürüme ait değil.');
const entries = JSON.parse(fs.readFileSync(journalPath,'utf8')).entries.slice().sort((x,y)=>x.idx-y.idx);
if (entries.length!==27 || entries.some((e,i)=>e.idx!==i || !e.tag.startsWith(String(i).padStart(4,'0')+'_'))) throw new Error('Migration listesi beklenmiyor.');
const expectedHashes = {
  '0023_order_discount_claims':'11af84dc8b2554a279b1070c77f3ef8435390db8ff712ed3b8ddf4416d5541c1',
  '0024_pos_notifications':'98ae67540be8a7cde434010f11229626a8c417ee2880fa80d983ab0e83697025',
  '0025_pos_sale_intents':'7d811f7b7d4bf02f2e377327495baf9eccd31378ca778da77cacd04aa1bd23fc',
  '0026_brand_categories':'c162823e54d5df2d02440eb02e70831684db408b33b08c4ebaad1522fcef7cd1',
};
const expectedTags=entries.slice(0,23).map(e=>e.tag).sort();
const plans=entries.slice(23).map(entry=>{
  const file=path.join(migrations,entry.tag+'.sql');
  if (!expectedHashes[entry.tag] || digest(file)!==expectedHashes[entry.tag]) throw new Error('Migration dosyası doğrulanamadı: '+entry.tag);
  return {entry, statements:fs.readFileSync(file,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean)};
});
const check = new Database(backup,{readonly:true,fileMustExist:true});
try { if(check.pragma('integrity_check',{simple:true})!=='ok') throw new Error('Yedek bütünlük kontrolü başarısız.'); } finally { check.close(); }
// ATTACH works on a private copy; the backup itself is never modified.
const dir=fs.mkdtempSync(path.join(path.dirname(backup),'.migration-kontrol-'));
const copy=path.join(dir,'yedek-kopyasi.db');let db;
try {
  fs.copyFileSync(backup,copy,fs.constants.COPYFILE_EXCL);fs.chmodSync(copy,0o600);
  db=new Database(dbPath,{fileMustExist:true,timeout:5000});
  db.pragma('foreign_keys = ON');db.prepare('ATTACH DATABASE ? AS saved_backup').run(copy);
  db.transaction(()=>{
    if(db.pragma('integrity_check',{simple:true})!=='ok') throw new Error('Canlı veritabanı bütünlüğü başarısız.');
    const current=db.prepare('SELECT tag FROM main.__migrations ORDER BY tag').all().map(x=>x.tag).sort();
    if(JSON.stringify(current)!==JSON.stringify(expectedTags)) throw new Error('Canlı migration durumu 0000–0022 değil; işlem durduruldu.');
    const schemas=which=>db.prepare(`SELECT type,name,tbl_name,sql FROM ${which}.sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name`).all();
    if(JSON.stringify(schemas('main'))!==JSON.stringify(schemas('saved_backup'))) throw new Error('Canlı şema yedekten sonra değişmiş.');
    const names=db.prepare("SELECT name FROM main.sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name").all().map(x=>x.name);
    for(const name of names){
      const q='"'+name.replace(/"/g,'""')+'"';
      if(db.prepare(`SELECT count(*) n FROM main.${q}`).get().n!==db.prepare(`SELECT count(*) n FROM saved_backup.${q}`).get().n || db.prepare(`SELECT 1 FROM (SELECT * FROM main.${q} EXCEPT SELECT * FROM saved_backup.${q}) LIMIT 1`).get() || db.prepare(`SELECT 1 FROM (SELECT * FROM saved_backup.${q} EXCEPT SELECT * FROM main.${q}) LIMIT 1`).get()) throw new Error('Canlı veriler yedekten sonra değişmiş: '+name);
    }
    const newNames=['order_discount_claims','order_discount_claims_unique_idx','order_discount_claims_order_idx','orders_stock_queue_idx','inventory_reservations_payment_hold_idx','pos_return_context','order_notification_outbox','order_notification_due_idx','pos_sale_requests','pos_sale_payments','pos_sale_intents','pos_sale_intents_shift_status_idx','brand_categories','brand_categories_category_idx'];
    const objectExists=db.prepare('SELECT 1 FROM main.sqlite_master WHERE name=?');
    for(const name of newNames) if(objectExists.get(name)) throw new Error('Beklenmeyen mevcut nesne: '+name);
    const violations=JSON.stringify(db.pragma('foreign_key_check').map(x=>JSON.stringify(x)).sort());
    const add=db.prepare('INSERT INTO main.__migrations(tag) VALUES(?)');
    for(const plan of plans){for(const sql of plan.statements) db.exec(sql);add.run(plan.entry.tag);}
    if(db.pragma('integrity_check',{simple:true})!=='ok' || JSON.stringify(db.pragma('foreign_key_check').map(x=>JSON.stringify(x)).sort())!==violations) throw new Error('Migration sonrası bütünlük kontrolü başarısız.');
  }).immediate();
  console.log('0023–0026 tek işlemde uygulandı; veritabanı bütünlüğü: ok.');
} finally {if(db) db.close();fs.rmSync(dir,{recursive:true,force:true});}
