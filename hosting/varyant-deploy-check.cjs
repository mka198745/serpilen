'use strict';
// inspect is read-only; backup/check require all application, cron and other DB writers stopped.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const [mode, dbArg, backupArg, appArg] = process.argv.slice(2);
if (!['inspect','backup','check'].includes(mode) || ![dbArg,appArg].every(p=>p && path.isAbsolute(p)) || (mode !== 'inspect' && (!backupArg || !path.isAbsolute(backupArg)))) throw Error('Kullanım: inspect|backup|check MUTLAK_DB MUTLAK_YEDEK MUTLAK_STANDALONE');
const live = fs.realpathSync(dbArg), app = fs.realpathSync(appArg);
if (!fs.statSync(live).isFile()) throw Error('Canlı veritabanı bulunamadı.');
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const checkHash = (relative, expected) => { if (sha(path.join(app,relative)) !== expected) throw Error('Paket doğrulanamadı: '+relative); };
for (const p of ['node_modules/better-sqlite3/prebuilds/linux-x64.node','node_modules/better-sqlite3/build/Release/better_sqlite3.node']) checkHash(p,'2d5e0ddafab5f642a82ede046bd3b77786c61001ae289bbabf962530ca5831d5');
checkHash('drizzle-sqlite/0028_warehouse_reference_guards.sql','85aed983d0b59e119235af6eb78319c01e0a3e6fe3905a8555c79aa17a0a45eb');
checkHash('drizzle-sqlite/0029_supplier_returns.sql','da7303c863c05972e0d60493c1aa524b02b6e9bbbcf7b509f14bc3f69433e51f');
checkHash('drizzle-sqlite/0030_refund_replay_guards.sql','31ee86e7f52411a812ae4f50d6bc52ed21354a9fe6fab51fd392ad66ba2bf654');
checkHash('drizzle-sqlite/meta/_journal.json','e918a4c45585013ec49fa033f03a9e2bc5cbac69efb8180ea8a616ab95871780');
const entries=JSON.parse(fs.readFileSync(path.join(app,'drizzle-sqlite/meta/_journal.json'),'utf8')).entries;
if (entries.length!==31 || entries.some((e,i)=>e.idx!==i) || entries[29].tag!=='0029_supplier_returns' || entries[30].tag!=='0030_refund_replay_guards') throw Error('Migration listesi beklenmiyor.');
const Database=require(path.join(app,'node_modules/better-sqlite3'));
const quote=s=>'"'+s.replace(/"/g,'""')+'"';
const norm=sql=>sql.replace(/^.*?(?=CREATE TRIGGER)/s,'').replace(/CREATE TRIGGER IF NOT EXISTS/i,'CREATE TRIGGER').trim().replace(/;\s*$/,'');
const expectedTriggers=fs.readFileSync(path.join(app,'drizzle-sqlite/0028_warehouse_reference_guards.sql'),'utf8').split('--> statement-breakpoint').map(norm).filter(Boolean).sort();
// Check the exact schema, not just names: 0030 anti-replay triggers must remain intact.
const normalizeSchema=sql=>sql.replace(/^.*?(?=CREATE\s+(?:TABLE|INDEX|TRIGGER))/is,'').replace(/\s+IF NOT EXISTS\s+/i,' ').trim().replace(/;\s*$/,'');
function expectedSchema(file){return fs.readFileSync(path.join(app,'drizzle-sqlite',file),'utf8').split('--> statement-breakpoint').map(normalizeSchema).filter(Boolean).map(sql=>{const match=sql.match(/^CREATE\s+(TABLE|INDEX|TRIGGER)\s+`([^`]+)`/i);if(!match)throw Error('Migration şeması okunamadı.');return {type:match[1].toLowerCase(),name:match[2],sql};});}
const schema0029=expectedSchema('0029_supplier_returns.sql'),schema0030=expectedSchema('0030_refund_replay_guards.sql');
if(schema0029.length!==6||schema0030.length!==24)throw Error('Migration şeması beklenmiyor.');
function inspect(db) {
 if(db.pragma('integrity_check',{simple:true})!=='ok' || db.pragma('foreign_key_check').length) throw Error('DB bütünlüğü veya foreign key kontrolü başarısız.');
 const tags=db.prepare('SELECT tag FROM __migrations ORDER BY tag').all().map(x=>x.tag);
 if(JSON.stringify(tags)!==JSON.stringify(entries.map(x=>x.tag).sort())) throw Error('DB beklenen 0030 sürümünde değil.');
 for(const expected of [...schema0029,...schema0030]){const actual=db.prepare('SELECT sql FROM sqlite_master WHERE type=? AND name=?').get(expected.type,expected.name);if(!actual||normalizeSchema(actual.sql)!==expected.sql)throw Error('Migration şeması eksik veya değiştirilmiş: '+expected.name);}
 const triggers=db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name LIKE 'warehouse_guard_%'").all().map(x=>norm(x.sql)).sort();
 if(triggers.length!==24 || JSON.stringify(triggers)!==JSON.stringify(expectedTriggers)) throw Error('Depo korumaları eksik veya değiştirilmiş.');
 const selected=db.prepare("SELECT value FROM app_settings WHERE key='sales.shared_warehouse_id'").get();
 const warehouse=selected && /^[1-9]\d*$/.test(selected.value) ? db.prepare('SELECT id,name FROM warehouses WHERE id=? AND is_active=1').get(Number(selected.value)) : null;
 if(!warehouse) throw Error('Aktif ortak satış deposu seçimi bulunamadı.');
 return {integrity:'ok',foreign_key_errors:0,migration:'0030_refund_replay_guards',ortak_depo:warehouse};
}
function compare(db) {
 const schema=a=>db.prepare(`SELECT type,name,tbl_name,sql FROM ${a}.sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name`).all();
 if(JSON.stringify(schema('main'))!==JSON.stringify(schema('saved_backup'))) throw Error('Yedekten sonra şema değişmiş.');
 const tables=db.prepare("SELECT name FROM saved_backup.sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name").all();
 for(const {name} of tables) {
  const table=quote(name), columns=db.prepare(`PRAGMA main.table_xinfo(${table})`).all().filter(c=>c.hidden!==1).map(c=>c.name);
  if(!columns.length) throw Error('Tablo sütunları okunamadı: '+name);
  const group=columns.flatMap(c=>[`typeof(${quote(c)}) COLLATE BINARY`,`${quote(c)} COLLATE BINARY`]).join(',');
  const side=a=>`SELECT ${group},count(*) FROM ${a}.${table} GROUP BY ${group}`;
  if(db.prepare(`SELECT 1 FROM (${side('main')} EXCEPT ${side('saved_backup')}) LIMIT 1`).get() || db.prepare(`SELECT 1 FROM (${side('saved_backup')} EXCEPT ${side('main')}) LIMIT 1`).get()) throw Error('Yedekten sonra veri değişmiş: '+name);
 }
}
(async()=>{
 if(mode==='inspect') { const db=new Database(live,{readonly:true,fileMustExist:true});try{console.log(JSON.stringify(db.transaction(()=>inspect(db)).deferred(),null,2));}finally{db.close();}return; }
 if(mode==='backup') {
  const dest=path.resolve(backupArg);let owned=false;
  for(const suffix of ['-wal','-shm','-journal']) if(fs.existsSync(dest+suffix)) throw Error('Yedek yolunda SQLite yan dosyası var.');
  try {
   const fd=fs.openSync(dest,'wx',0o600);owned=true;fs.closeSync(fd);
   const db=new Database(live,{readonly:true,fileMustExist:true});try{db.transaction(()=>inspect(db)).deferred();await db.backup(dest);}finally{db.close();}
   const copy=new Database(dest,{readonly:true,fileMustExist:true});try{copy.transaction(()=>inspect(copy)).deferred();}finally{copy.close();}
   if(fs.existsSync(dest+'-wal') && fs.statSync(dest+'-wal').size>0) throw Error('Yedek WAL dosyası bağımsız kapanmadı.');
   fs.chmodSync(dest,0o600);owned=false;console.log('DB yedeği oluşturuldu ve bütünlüğü doğrulandı:',dest);return;
  } finally {if(owned)fs.rmSync(dest,{force:true});}
 }
 const saved=fs.realpathSync(backupArg),a=fs.statSync(live),b=fs.statSync(saved);
 if(!b.isFile() || live===saved || (a.dev===b.dev && a.ino===b.ino)) throw Error('Yedek ayrı bir dosya olmalı.');
 if(fs.existsSync(saved+'-wal') && fs.statSync(saved+'-wal').size>0) throw Error('Yedek WAL yan dosyası boş değil.');
 const prior=new Database(saved,{readonly:true,fileMustExist:true});try{prior.transaction(()=>inspect(prior)).deferred();}finally{prior.close();}
 if(fs.existsSync(saved+'-wal') && fs.statSync(saved+'-wal').size>0) throw Error('Yedek WAL yan dosyası boş değil.');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'serpilen-revizyon-'));fs.chmodSync(dir,0o700);const copy=path.join(dir,'backup.db');fs.copyFileSync(saved,copy,fs.constants.COPYFILE_EXCL);fs.chmodSync(copy,0o600);
 let db;try{db=new Database(live,{readonly:true,fileMustExist:true});db.prepare('ATTACH DATABASE ? AS saved_backup').run(copy);db.transaction(()=>{inspect(db);compare(db);}).deferred();console.log('Canlı DB ve yedek şema/veri olarak eşleşiyor; bütünlük doğrulandı.');}finally{db?.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error('HATA:',e.message);process.exitCode=1;});
