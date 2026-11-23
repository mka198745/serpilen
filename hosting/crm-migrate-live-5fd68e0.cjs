'use strict';
// Run only after all production writers have stopped and a fresh SQLite online
// backup has been integrity checked. This modifies the live database.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const livePath = '/home/serpilen/public_html/serpilen/data/tuhafiye.db';
const [app, migrationDir, backup] = process.argv.slice(2);
if (!app || !migrationDir || !backup || ![app, migrationDir, backup].every(path.isAbsolute)) throw new Error('Mutlak standalone, migration ve yedek yolları gerekli.');
const live = fs.realpathSync(livePath);
const snapshot = fs.realpathSync(backup);
const liveStat = fs.statSync(live), snapStat = fs.statSync(snapshot);
if (live === snapshot || (liveStat.dev === snapStat.dev && liveStat.ino === snapStat.ino)) throw new Error('Yedek ve canlı veritabanı aynı dosya.');
const binding = path.join(app, 'node_modules/better-sqlite3/prebuilds/linux-x64.node');
const hash = crypto.createHash('sha256').update(fs.readFileSync(binding)).digest('hex');
if (hash !== '2d5e0ddafab5f642a82ede046bd3b77786c61001ae289bbabf962530ca5831d5') throw new Error('SQLite binding doğrulaması başarısız.');
const Database = require(path.join(app, 'node_modules/better-sqlite3'));
const copy = new Database(snapshot, { readonly: true, fileMustExist: true });
try { if (copy.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Yedek bütünlüğü bozuk.'); } finally { copy.close(); }
const journal = JSON.parse(fs.readFileSync(path.join(migrationDir, 'meta/_journal.json'), 'utf8'));
const entries = journal.entries.slice().sort((a, b) => a.idx - b.idx);
if (entries.length !== 21 || entries.some((e, i) => e.idx !== i || !e.tag.startsWith(String(i).padStart(4, '0') + '_'))) throw new Error('Beklenmeyen migration listesi.');
const expected = entries.slice(0, 11).map(e => e.tag).sort();
const plans = entries.slice(11).map(entry => {
  const sql = fs.readFileSync(path.join(migrationDir, entry.tag + '.sql'), 'utf8');
  const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
  const names = statements.map(stmt => {
    const clean = stmt.replace(/^\s*--.*$/gm, '').trim();
    const match = clean.match(/^CREATE\s+(TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\s+[`"]?([A-Za-z0-9_]+)[`"]?/i);
    if (!match) throw new Error('Beklenmeyen migration ifadesi: ' + entry.tag);
    return match[2];
  });
  return { entry, statements, names };
});
// ATTACH uses a private disposable copy, never the original backup. The bundled
// SQLite build does not enable URI filenames, so ?mode=ro cannot be used here.
const compareDir = fs.mkdtempSync(path.join(path.dirname(snapshot), '.karsilastirma-'));
const compareFile = path.join(compareDir, 'yedek-kopyasi.db');
fs.copyFileSync(snapshot, compareFile, fs.constants.COPYFILE_EXCL);
fs.chmodSync(compareFile, 0o600);
const db = new Database(live, { fileMustExist: true, timeout: 5000 });
try {
  db.pragma('foreign_keys = ON');
  db.prepare('ATTACH DATABASE ? AS saved_backup').run(compareFile);
  db.transaction(() => {
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Canlı veritabanı bütünlüğü bozuk.');
    const actual = db.prepare('SELECT tag FROM main.__migrations ORDER BY tag').all().map(r => r.tag).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Canlı migration durumu beklenen 0000–0010 değil.');
    const schemas = db.prepare("SELECT type, name, tbl_name, sql FROM main.sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
    const backupSchemas = db.prepare("SELECT type, name, tbl_name, sql FROM saved_backup.sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
    if (JSON.stringify(schemas) !== JSON.stringify(backupSchemas)) throw new Error('Canlı şema son yedekten sonra değişmiş.');
    const tableNames = db.prepare("SELECT name FROM main.sqlite_master WHERE type = 'table' AND (name NOT LIKE 'sqlite_%' OR name = 'sqlite_sequence') ORDER BY name").all().map(r => r.name);
    for (const name of tableNames) {
      const q = '"' + name.replace(/"/g, '""') + '"';
      const mainCount = db.prepare(`SELECT count(*) AS n FROM main.${q}`).get().n;
      const backupCount = db.prepare(`SELECT count(*) AS n FROM saved_backup.${q}`).get().n;
      if (mainCount !== backupCount ||
          db.prepare(`SELECT 1 FROM (SELECT * FROM main.${q} EXCEPT SELECT * FROM saved_backup.${q}) LIMIT 1`).get() ||
          db.prepare(`SELECT 1 FROM (SELECT * FROM saved_backup.${q} EXCEPT SELECT * FROM main.${q}) LIMIT 1`).get()) {
        throw new Error('Canlı veri son yedekten sonra değişmiş: ' + name);
      }
    }
    const exists = db.prepare('SELECT type FROM main.sqlite_master WHERE name = ?');
    for (const plan of plans) for (const name of plan.names) if (exists.get(name)) throw new Error('Bekleyen migration nesnesi zaten var: ' + name);
    const violations = db.pragma('foreign_key_check').length;
    const count = table => db.prepare(`SELECT count(*) AS n FROM main."${table}"`).get().n;
    const tables = ['customers', 'orders', 'products', 'users'];
    const counts = Object.fromEntries(tables.map(table => [table, count(table)]));
    const add = db.prepare('INSERT INTO main.__migrations (tag) VALUES (?)');
    for (const plan of plans) {
      for (const statement of plan.statements) db.exec(statement);
      add.run(plan.entry.tag);
    }
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Migration sonrası bütünlük kontrolü başarısız.');
    if (db.pragma('foreign_key_check').length > violations) throw new Error('Yeni foreign key ihlali var.');
    for (const table of tables) if (count(table) !== counts[table]) throw new Error('Kayıt sayısı değişti: ' + table);
    console.log('Son yedekle canlı şema ve veriler karşılaştırıldı.');
    console.log('Kayıt sayıları:', JSON.stringify(counts));
  }).immediate();
  console.log('Canlı migration BAŞARILI: 0011–0020 tek transaction olarak uygulandı.');
  console.log('Canlı veritabanı bütünlüğü: ok');
} finally {
  db.close();
}
