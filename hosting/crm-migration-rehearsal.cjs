'use strict';
// Runs ONLY on a separate rehearsal copy, never on the live SQLite file.
// Usage: node crm-migration-rehearsal.cjs <trial-db> <standalone-dir> <migration-dir>
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const livePath = '/home/serpilen/public_html/serpilen/data/tuhafiye.db';
const [trialArg, standaloneArg, migrationArg] = process.argv.slice(2);
if (!trialArg || !standaloneArg || !migrationArg || ![trialArg, standaloneArg, migrationArg].every(path.isAbsolute)) {
  throw new Error('Mutlak deneme veritabanı, standalone ve migration yolları gerekli.');
}
const trial = fs.realpathSync(trialArg);
const live = fs.realpathSync(livePath);
const trialStat = fs.statSync(trial);
const liveStat = fs.statSync(live);
if (trial === live || (trialStat.dev === liveStat.dev && trialStat.ino === liveStat.ino)) {
  throw new Error('Canlı veritabanında deneme çalıştırılamaz.');
}
const Database = require(path.join(standaloneArg, 'node_modules/better-sqlite3'));
const db = new Database(trial, { fileMustExist: true });
try {
  if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Deneme veritabanı bütünlük kontrolü başarısız.');
  const journal = JSON.parse(fs.readFileSync(path.join(migrationArg, 'meta/_journal.json'), 'utf8'));
  const entries = journal.entries.slice().sort((a, b) => a.idx - b.idx);
  if (entries.length !== 21 || entries.some((e, i) => e.idx !== i || !e.tag.startsWith(String(i).padStart(4, '0') + '_'))) {
    throw new Error('Beklenmeyen migration listesi.');
  }
  const expectedBaseline = entries.slice(0, 11).map(e => e.tag).sort();
  const actual = db.prepare('SELECT tag FROM __migrations ORDER BY tag').all().map(row => row.tag).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expectedBaseline)) throw new Error('Deneme kopyasının migration durumu beklenen 0000–0010 değil; duruldu.');
  const plans = entries.slice(11).map(entry => {
    const sql = fs.readFileSync(path.join(migrationArg, entry.tag + '.sql'), 'utf8');
    const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
    const objects = statements.map(statement => {
      const clean = statement.replace(/^\s*--.*$/gm, '').trim();
      const match = clean.match(/^CREATE\s+(TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\s+[`"]?([A-Za-z0-9_]+)[`"]?/i);
      if (!match) throw new Error('Beklenmeyen migration ifadesi: ' + entry.tag);
      return { type: match[1].toLowerCase(), name: match[2] };
    });
    return { entry, statements, objects };
  });
  const checkObject = db.prepare('SELECT type FROM sqlite_master WHERE name = ?');
  for (const plan of plans) for (const object of plan.objects) {
    if (checkObject.get(object.name)) throw new Error('Bekleyen migration nesnesi zaten var: ' + object.name + '. Duruldu.');
  }
  db.pragma('foreign_keys = ON');
  const foreignKeysBefore = db.pragma('foreign_key_check').length;
  const count = table => db.prepare('SELECT COUNT(*) AS n FROM "' + table + '"').get().n;
  const tables = ['customers', 'orders', 'products', 'users'];
  const countsBefore = Object.fromEntries(tables.map(table => [table, count(table)]));
  db.transaction(() => {
    const add = db.prepare('INSERT INTO __migrations (tag) VALUES (?)');
    for (const plan of plans) {
      for (const statement of plan.statements) db.exec(statement);
      add.run(plan.entry.tag);
    }
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Migration sonrası bütünlük kontrolü başarısız.');
    if (db.pragma('foreign_key_check').length > foreignKeysBefore) throw new Error('Yeni foreign key ihlali tespit edildi.');
    for (const table of tables) if (count(table) !== countsBefore[table]) throw new Error('Beklenmeyen kayıt sayısı değişimi: ' + table);
  }).immediate();
  console.log('Deneme migrationları BAŞARILI (0011–0020); tümü tek transaction içinde uygulandı.');
  console.log('Deneme veritabanı bütünlüğü: ok');
  console.log('Müşteri, sipariş, ürün ve kullanıcı sayıları değişmedi:', JSON.stringify(countsBefore));
  console.log('Deneme öncesi foreign key ihlali sayısı:', foreignKeysBefore);
  console.log('SQLite sürümü:', db.prepare('SELECT sqlite_version() AS v').get().v);
  console.log('Native binding SHA256:', crypto.createHash('sha256').update(fs.readFileSync(path.join(standaloneArg, 'node_modules/better-sqlite3/prebuilds/linux-x64.node'))).digest('hex'));
  console.log('Canlı veritabanına migration uygulanmadı.');
} finally {
  db.close();
}
