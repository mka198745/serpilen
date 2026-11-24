'use strict';
// Run on a disposable copy for rehearsal, or only after all live writers stop.
// Arguments: absolute database path, standalone path, migration directory, fresh online backup path.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const [dbArg, appArg, migrationArg, backupArg] = process.argv.slice(2);
if (![dbArg, appArg, migrationArg, backupArg].every(x => x && path.isAbsolute(x))) throw new Error('Mutlak veritabanı, standalone, migration ve yedek yolları gerekli.');
const dbPath = fs.realpathSync(dbArg), backup = fs.realpathSync(backupArg), app = fs.realpathSync(appArg), migration = fs.realpathSync(migrationArg);
const a = fs.statSync(dbPath), b = fs.statSync(backup);
if (dbPath === backup || (a.dev === b.dev && a.ino === b.ino)) throw new Error('Yedek ve hedef farklı dosyalar olmalı.');
const binding = path.join(app, 'node_modules/better-sqlite3/prebuilds/linux-x64.node');
if (crypto.createHash('sha256').update(fs.readFileSync(binding)).digest('hex') !== '2d5e0ddafab5f642a82ede046bd3b77786c61001ae289bbabf962530ca5831d5') throw new Error('SQLite binding doğrulaması başarısız.');
const Database = require(path.join(app, 'node_modules/better-sqlite3'));
const checkBackup = new Database(backup, { readonly: true, fileMustExist: true });
try { if (checkBackup.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Yedek bütünlük kontrolü başarısız.'); } finally { checkBackup.close(); }
const journal = JSON.parse(fs.readFileSync(path.join(migration, 'meta/_journal.json'), 'utf8'));
const entries = journal.entries.slice().sort((x,y) => x.idx-y.idx);
if (entries.length !== 23 || entries.some((e,i) => e.idx !== i || !e.tag.startsWith(String(i).padStart(4,'0')+'_')) || entries[21].tag !== '0021_product_technical_details' || entries[22].tag !== '0022_crm_merge_reference_indexes') throw new Error('Beklenmeyen migration listesi.');
const expected = entries.slice(0,21).map(e=>e.tag).sort();
const plans = entries.slice(21).map(entry => ({ entry, sql: fs.readFileSync(path.join(migration,entry.tag+'.sql'),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean) }));
const expectedSql = [
  ['ALTER TABLE `products` ADD COLUMN `technical_details` text;'],
  ['CREATE INDEX IF NOT EXISTS `account_transactions_customer_idx` ON `account_transactions` (`customer_id`, `id`);', 'CREATE INDEX IF NOT EXISTS `loyalty_transactions_order_idx` ON `loyalty_transactions` (`order_id`, `customer_id`);', 'CREATE INDEX IF NOT EXISTS `order_return_items_return_idx` ON `order_return_items` (`return_id`, `id`);'],
];
if (JSON.stringify(plans.map(p=>p.sql)) !== JSON.stringify(expectedSql)) throw new Error('Beklenmeyen migration içeriği.');
const dir = fs.mkdtempSync(path.join(path.dirname(backup), '.migrate-karsilastirma-'));
const copy = path.join(dir,'snapshot.db');
let db;
try {
  fs.copyFileSync(backup,copy,fs.constants.COPYFILE_EXCL); fs.chmodSync(copy,0o600);
  db = new Database(dbPath, { fileMustExist: true, timeout: 5000 });
  db.pragma('foreign_keys = ON'); db.prepare('ATTACH DATABASE ? AS saved_backup').run(copy);
  db.transaction(() => {
    if (db.pragma('integrity_check', {simple:true}) !== 'ok') throw new Error('Hedef bütünlük kontrolü başarısız.');
    const actual = db.prepare('SELECT tag FROM main.__migrations ORDER BY tag').all().map(x=>x.tag).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Migration durumu 0000–0020 değil; işlem yapılmadı.');
    const schema = db.prepare("SELECT type,name,tbl_name,sql FROM main.sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    const savedSchema = db.prepare("SELECT type,name,tbl_name,sql FROM saved_backup.sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    if (JSON.stringify(schema) !== JSON.stringify(savedSchema)) throw new Error('Şema yedekten sonra değişmiş.');
    const names = db.prepare("SELECT name FROM main.sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name").all().map(x=>x.name);
    for (const name of names) {
      const q='"'+name.replace(/"/g,'""')+'"';
      if (db.prepare(`SELECT count(*) AS n FROM main.${q}`).get().n !== db.prepare(`SELECT count(*) AS n FROM saved_backup.${q}`).get().n || db.prepare(`SELECT 1 FROM (SELECT * FROM main.${q} EXCEPT SELECT * FROM saved_backup.${q}) LIMIT 1`).get() || db.prepare(`SELECT 1 FROM (SELECT * FROM saved_backup.${q} EXCEPT SELECT * FROM main.${q}) LIMIT 1`).get()) throw new Error('Veri yedekten sonra değişmiş: '+name);
    }
    if (db.pragma('table_info(products)').some(c=>c.name==='technical_details')) throw new Error('Beklenmeyen mevcut technical_details alanı.');
    for (const name of ['account_transactions_customer_idx','loyalty_transactions_order_idx','order_return_items_return_idx']) if (db.prepare('SELECT 1 FROM main.sqlite_master WHERE name=?').get(name)) throw new Error('Beklenmeyen mevcut indeks: '+name);
    const violations = db.pragma('foreign_key_check').length;
    const add = db.prepare('INSERT INTO main.__migrations(tag) VALUES(?)');
    for (const plan of plans) { for (const sql of plan.sql) db.exec(sql); add.run(plan.entry.tag); }
    if (db.pragma('integrity_check',{simple:true}) !== 'ok' || db.pragma('foreign_key_check').length > violations) throw new Error('Migration sonrası bütünlük kontrolü başarısız.');
  }).immediate();
  console.log('0021 ve 0022 tek transaction içinde uygulandı; veritabanı bütünlüğü: ok.');
} finally { if (db) db.close(); fs.rmSync(dir,{recursive:true,force:true}); }
