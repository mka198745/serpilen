'use strict';
// inspect is read-only. Before backup/apply, stop every application process and DB writer.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const [mode,dbArg,backupArg,appArg]=process.argv.slice(2);
if(!['inspect','backup','apply'].includes(mode)||![dbArg,appArg].every(p=>p&&path.isAbsolute(p))||(mode!=='inspect'&&(!backupArg||!path.isAbsolute(backupArg))))throw Error('Kullanım: inspect|backup|apply MUTLAK_DB MUTLAK_YEDEK MUTLAK_STANDALONE');
const live=fs.realpathSync(dbArg),app=fs.realpathSync(appArg);
if(!fs.statSync(live).isFile())throw Error('Veritabanı dosyası bulunamadı.');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const migration=path.join(app,'drizzle-sqlite/0030_refund_replay_guards.sql'),journal=path.join(app,'drizzle-sqlite/meta/_journal.json'),previousMigration=path.join(app,'drizzle-sqlite/0028_warehouse_reference_guards.sql'),supplierMigration=path.join(app,'drizzle-sqlite/0029_supplier_returns.sql');
if(sha(migration)!=='31ee86e7f52411a812ae4f50d6bc52ed21354a9fe6fab51fd392ad66ba2bf654'||sha(journal)!=='e918a4c45585013ec49fa033f03a9e2bc5cbac69efb8180ea8a616ab95871780'||sha(previousMigration)!=='85aed983d0b59e119235af6eb78319c01e0a3e6fe3905a8555c79aa17a0a45eb'||sha(supplierMigration)!=='da7303c863c05972e0d60493c1aa524b02b6e9bbbcf7b509f14bc3f69433e51f')throw Error('Migration veya journal doğrulanamadı.');
for(const name of ['prebuilds/linux-x64.node','build/Release/better_sqlite3.node'])if(sha(path.join(app,'node_modules/better-sqlite3',name))!=='2d5e0ddafab5f642a82ede046bd3b77786c61001ae289bbabf962530ca5831d5')throw Error('SQLite binding doğrulanamadı.');
const entries=JSON.parse(fs.readFileSync(journal,'utf8')).entries;
if(entries.length!==31||entries.some((e,i)=>e.idx!==i)||entries[28].tag!=='0028_warehouse_reference_guards'||entries[29].tag!=='0029_supplier_returns'||entries[30].tag!=='0030_refund_replay_guards')throw Error('Migration listesi beklenmiyor.');
const statements=fs.readFileSync(migration,'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean);
if(statements.length!==24)throw Error('Migration içeriği beklenmiyor.');
const Database=require(path.join(app,'node_modules/better-sqlite3'));
const names=['deleted_refund_guards','deleted_refund_guard_items'];
const newObjects=statements.map(s=>{const m=s.match(/CREATE\s+(?:TABLE|INDEX|TRIGGER)\s+`([^`]+)`/i);if(!m)throw Error('Migration nesnesi okunamadı.');return m[1];});
if(new Set(newObjects).size!==24)throw Error('Migration nesneleri tutarsız.');
const q=s=>'"'+s.replace(/"/g,'""')+'"';
const normalizeTrigger=sql=>sql.replace(/^.*?(?=CREATE TRIGGER)/s,'').replace(/CREATE TRIGGER IF NOT EXISTS/i,'CREATE TRIGGER').trim().replace(/;\s*$/,'');
const expectedTriggers=fs.readFileSync(previousMigration,'utf8').split('--> statement-breakpoint').map(x=>normalizeTrigger(x)).filter(Boolean).sort();
const normalizeSchema=sql=>sql.replace(/^.*?(?=CREATE\s+(?:TABLE|INDEX))/is,'').replace(/\s+IF NOT EXISTS\s+/i,' ').trim().replace(/;\s*$/,'');
const supplierSchema=fs.readFileSync(supplierMigration,'utf8').split('--> statement-breakpoint').map(x=>normalizeSchema(x)).filter(Boolean).map(sql=>{
 const match=sql.match(/^CREATE\s+(TABLE|INDEX)\s+`([^`]+)`/i);if(!match)throw Error('0029 şeması okunamadı.');return {type:match[1].toLowerCase(),name:match[2],sql};
});
if(supplierSchema.length!==6)throw Error('0029 şeması beklenmiyor.');
function checkSupplierSchema(db){
 for(const expected of supplierSchema){const row=db.prepare('SELECT sql FROM sqlite_master WHERE type=? AND name=?').get(expected.type,expected.name);if(!row||normalizeSchema(row.sql)!==expected.sql)throw Error('0029 şeması eksik veya değiştirilmiş: '+expected.name);}
}
function checkTriggers(db){
 const actual=db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name LIKE 'warehouse_guard_%'").all().map(x=>normalizeTrigger(x.sql)).sort();
 if(actual.length!==24||JSON.stringify(actual)!==JSON.stringify(expectedTriggers))throw Error('0028 depo korumaları eksik veya değiştirilmiş.');
}
function validateBefore(db){
 if(db.pragma('integrity_check',{simple:true})!=='ok'||db.pragma('foreign_key_check').length)throw Error('Veritabanı bütünlüğü veya foreign key kontrolü başarısız.');
 const tags=db.prepare('SELECT tag FROM __migrations ORDER BY tag').all().map(x=>x.tag);
 if(JSON.stringify(tags)!==JSON.stringify(entries.slice(0,30).map(x=>x.tag).sort()))throw Error('Veritabanı beklenen 0029 durumunda değil.');
 checkTriggers(db);checkSupplierSchema(db);
 for(const name of newObjects)if(db.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(name))throw Error('Beklenmeyen 0030 nesnesi zaten var: '+name);
 const selected=db.prepare("SELECT value FROM app_settings WHERE key='sales.shared_warehouse_id'").get();
 const warehouse=selected&&/^[1-9]\d*$/.test(selected.value)?db.prepare('SELECT id,name FROM warehouses WHERE id=? AND is_active=1').get(Number(selected.value)):null;
 return {integrity:'ok',migration_0029:true,ortak_depo:warehouse||null};
}
function validateAfter(db){
 if(db.pragma('integrity_check',{simple:true})!=='ok'||db.pragma('foreign_key_check').length)throw Error('Migration sonrası bütünlük kontrolü başarısız.');
 const tags=db.prepare('SELECT tag FROM __migrations ORDER BY tag').all().map(x=>x.tag);
 if(JSON.stringify(tags)!==JSON.stringify(entries.map(x=>x.tag).sort()))throw Error('Migration kaydı eksik.');
 for(const name of names){if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))throw Error('Migration tablosu eksik: '+name);if(db.prepare(`SELECT 1 FROM ${q(name)} LIMIT 1`).get())throw Error('Yeni tablo beklenmedik şekilde dolu: '+name);}
 for(const name of newObjects)if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name=?").get(name))throw Error('Migration nesnesi eksik: '+name);
 checkTriggers(db);checkSupplierSchema(db);
}
// Include SQLite storage types and duplicate counts. Compare text with BINARY collation,
// so NOCASE columns, repeated rows, and sqlite_sequence changes are not overlooked.
function compare(db,after=false){
 const newObjectSet=new Set(newObjects);
 const schema=alias=>db.prepare(`SELECT type,name,tbl_name,sql FROM ${alias}.sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name`).all().filter(x=>!(after&&alias==='main'&&newObjectSet.has(x.name)));
 if(JSON.stringify(schema('main'))!==JSON.stringify(schema('saved_backup')))throw Error('Yedekten sonra şema değişmiş.');
 const tables=db.prepare("SELECT name FROM saved_backup.sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name").all().map(x=>x.name);
 for(const name of tables){
  const table=q(name),columns=db.prepare(`PRAGMA main.table_xinfo(${table})`).all().filter(c=>c.hidden!==1).map(c=>c.name);
  if(!columns.length)throw Error('Tablo sütunları okunamadı: '+name);
  const group=columns.flatMap(c=>[`typeof(${q(c)}) COLLATE BINARY`,`${q(c)} COLLATE BINARY`]).join(',');
  const side=alias=>`SELECT ${group}, count(*) FROM ${alias}.${table}${after&&alias==='main'&&name==='__migrations'?" WHERE tag<>'0030_refund_replay_guards'":''} GROUP BY ${group}`;
  if(db.prepare(`SELECT 1 FROM (${side('main')} EXCEPT ${side('saved_backup')}) LIMIT 1`).get()||db.prepare(`SELECT 1 FROM (${side('saved_backup')} EXCEPT ${side('main')}) LIMIT 1`).get())throw Error('Yedekten sonra veri değişmiş: '+name);
 }
}
(async()=>{
 if(mode==='inspect'){
  const db=new Database(live,{readonly:true,fileMustExist:true});try{console.log(JSON.stringify(db.transaction(()=>validateBefore(db)).deferred(),null,2));}finally{db.close();}return;
 }
 if(mode==='backup'){
  const dest=path.resolve(backupArg);let owned=false;
  for (const suffix of ['-wal','-shm','-journal']) if(fs.existsSync(dest+suffix)) throw Error('Yedek yolunda beklenmeyen SQLite yan dosyası var.');
  try{
   const fd=fs.openSync(dest,'wx',0o600);owned=true;fs.closeSync(fd);
   const db=new Database(live,{readonly:true,fileMustExist:true});try{db.transaction(()=>validateBefore(db)).deferred();await db.backup(dest);}finally{db.close();}
   const copy=new Database(dest,{readonly:true,fileMustExist:true});try{copy.transaction(()=>validateBefore(copy)).deferred();}finally{copy.close();}
   if(fs.existsSync(dest+'-wal')&&fs.statSync(dest+'-wal').size>0)throw Error('Yedek WAL dosyası bağımsız kapanmadı; yedek oluşturulamadı.');
   fs.chmodSync(dest,0o600);owned=false;console.log('Yedek oluşturuldu ve doğrulandı:',dest);return;
  }finally{if(owned)fs.rmSync(dest,{force:true});}
 }
 const backup=fs.realpathSync(backupArg),a=fs.statSync(live),b=fs.statSync(backup);
 if(!b.isFile()||live===backup||(a.dev===b.dev&&a.ino===b.ino))throw Error('Yedek ayrı bir dosya olmalı.');
 if(fs.existsSync(backup+'-wal')&&fs.statSync(backup+'-wal').size>0)throw Error('Yedek WAL yan dosyası var; önce yedeği güvenle kapatın.');
 const saved=new Database(backup,{readonly:true,fileMustExist:true});try{saved.transaction(()=>validateBefore(saved)).deferred();}finally{saved.close();}
 if(fs.existsSync(backup+'-wal')&&fs.statSync(backup+'-wal').size>0)throw Error('Yedek WAL yan dosyası var; kopyalanmadı.');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'serpilen-0030-'));fs.chmodSync(dir,0o700);const copy=path.join(dir,'backup.db');fs.copyFileSync(backup,copy,fs.constants.COPYFILE_EXCL);fs.chmodSync(copy,0o600);let db;
 try{
  db=new Database(live,{fileMustExist:true,timeout:5000});db.pragma('foreign_keys=ON');db.prepare('ATTACH DATABASE ? AS saved_backup').run(copy);
  db.transaction(()=>{validateBefore(db);compare(db);for(const statement of statements)db.exec(statement);db.prepare("INSERT INTO __migrations(tag) VALUES('0030_refund_replay_guards')").run();validateAfter(db);compare(db,true);}).immediate();
  console.log('0030 atomik uygulandı; bütünlük ok, foreign key hatası 0, eski kayıtlar korundu.');
 }finally{db?.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error('HATA:',e.message);process.exitCode=1;});
