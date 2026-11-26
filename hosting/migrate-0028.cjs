'use strict';
// Offline only. Stop ALL application processes and database writers first.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const [mode,dbArg,backupArg,appArg]=process.argv.slice(2);
if(!['backup','apply'].includes(mode)||![dbArg,backupArg,appArg].every(p=>p&&path.isAbsolute(p)))throw Error('Kullanım: backup|apply MUTLAK_DB MUTLAK_YEDEK MUTLAK_STANDALONE');
const dbPath=fs.realpathSync(dbArg),app=fs.realpathSync(appArg);
if(!fs.statSync(dbPath).isFile())throw Error('Veritabanı dosyası bulunamadı.');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const migration=path.join(app,'drizzle-sqlite/0028_warehouse_reference_guards.sql'),journal=path.join(app,'drizzle-sqlite/meta/_journal.json'),binding=path.join(app,'node_modules/better-sqlite3/prebuilds/linux-x64.node');
if(sha(migration)!=='85aed983d0b59e119235af6eb78319c01e0a3e6fe3905a8555c79aa17a0a45eb'||sha(journal)!=='bf64c388b8064f2e539b7aa662b0180a172ccf4ef536286863df4ad99e46815c'||sha(binding)!=='2d5e0ddafab5f642a82ede046bd3b77786c61001ae289bbabf962530ca5831d5'||sha(path.join(app,'node_modules/better-sqlite3/build/Release/better_sqlite3.node'))!=='2d5e0ddafab5f642a82ede046bd3b77786c61001ae289bbabf962530ca5831d5')throw Error('Paket veya SQLite binding doğrulaması başarısız.');
const entries=JSON.parse(fs.readFileSync(journal,'utf8')).entries;
if(entries.length!==29||entries.some((e,i)=>e.idx!==i)||entries[28].tag!=='0028_warehouse_reference_guards')throw Error('Migration listesi beklenmiyor.');
const statements=fs.readFileSync(migration,'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean);
if(statements.length!==24)throw Error('Migration içeriği beklenmiyor.');
const Database=require(path.join(app,'node_modules/better-sqlite3'));
function validate(db){
 if(db.pragma('integrity_check',{simple:true})!=='ok'||db.pragma('foreign_key_check').length)throw Error('Veritabanı bütünlük kontrolü başarısız.');
 const tags=db.prepare('SELECT tag FROM __migrations ORDER BY tag').all().map(x=>x.tag);
 if(JSON.stringify(tags)!==JSON.stringify(entries.slice(0,28).map(x=>x.tag).sort()))throw Error('Veritabanı 0027 durumunda değil; işlem durduruldu.');
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE name LIKE 'warehouse_guard_%' LIMIT 1").get())throw Error('Beklenmeyen depo koruması mevcut.');
}
const q=s=>'"'+s.replace(/"/g,'""')+'"';
(async()=>{
 if(mode==='backup'){
  const dest=path.resolve(backupArg);if(fs.existsSync(dest))throw Error('Yedek zaten var; üzerine yazılmadı.');
  const db=new Database(dbPath,{readonly:true,fileMustExist:true});try{validate(db);await db.backup(dest);fs.chmodSync(dest,0o600);}finally{db.close();}
  const copy=new Database(dest,{readonly:true,fileMustExist:true});try{validate(copy);}finally{copy.close();}
  console.log('Yedek oluşturuldu ve doğrulandı:',dest);return;
 }
 const backup=fs.realpathSync(backupArg),a=fs.statSync(dbPath),b=fs.statSync(backup);
 if(!b.isFile()||dbPath===backup||(a.dev===b.dev&&a.ino===b.ino))throw Error('Yedek farklı bir dosya olmalı.');
 const check=new Database(backup,{readonly:true,fileMustExist:true});try{validate(check);}finally{check.close();}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'serpilen-0028-'));fs.chmodSync(dir,0o700);const copy=path.join(dir,'backup.db');fs.copyFileSync(backup,copy,fs.constants.COPYFILE_EXCL);fs.chmodSync(copy,0o600);let db;
 try{
  db=new Database(dbPath,{fileMustExist:true,timeout:5000});db.pragma('foreign_keys = ON');db.prepare('ATTACH DATABASE ? AS saved_backup').run(copy);
  db.transaction(()=>{
   validate(db);
   const schema=alias=>db.prepare(`SELECT type,name,tbl_name,sql FROM ${alias}.sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name`).all();
   if(JSON.stringify(schema('main'))!==JSON.stringify(schema('saved_backup')))throw Error('Yedekten sonra şema değişmiş.');
   const names=db.prepare("SELECT name FROM main.sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name").all().map(x=>x.name);
   for(const name of names){const table=q(name),live=`main.${table}`,saved=`saved_backup.${table}`;if(db.prepare(`SELECT count(*) n FROM ${live}`).get().n!==db.prepare(`SELECT count(*) n FROM ${saved}`).get().n||db.prepare(`SELECT 1 FROM (SELECT * FROM ${live} EXCEPT SELECT * FROM ${saved}) LIMIT 1`).get()||db.prepare(`SELECT 1 FROM (SELECT * FROM ${saved} EXCEPT SELECT * FROM ${live}) LIMIT 1`).get())throw Error('Yedekten sonra veri değişmiş: '+name);}
   for(const sql of statements)db.exec(sql);
   db.prepare("INSERT INTO __migrations(tag) VALUES('0028_warehouse_reference_guards')").run();
   if(db.pragma('integrity_check',{simple:true})!=='ok'||db.pragma('foreign_key_check').length||db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE 'warehouse_guard_%'").get().n!==24)throw Error('Migration sonrası kontrol başarısız.');
  }).immediate();
  console.log('0028 atomik olarak uygulandı; bütünlük: ok, depo koruması: 24 tetikleyici.');
 }finally{db?.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error('HATA:',e.message);process.exitCode=1;});
