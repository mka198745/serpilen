'use strict';
// inspect is read-only; backup/check must run with every live DB writer stopped.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const [mode,dbArg,backupArg,appArg]=process.argv.slice(2);
if(!['inspect','backup','check'].includes(mode)||![dbArg,appArg].every(p=>p&&path.isAbsolute(p))||(mode!=='inspect'&&(!backupArg||!path.isAbsolute(backupArg))))throw Error('Kullanım: inspect|backup|check MUTLAK_DB MUTLAK_YEDEK MUTLAK_STANDALONE');
const live=fs.realpathSync(dbArg),app=fs.realpathSync(appArg);
if(!fs.statSync(live).isFile())throw Error('Canlı DB dosyası bulunamadı.');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const name of ['prebuilds/linux-x64.node','build/Release/better_sqlite3.node'])if(sha(path.join(app,'node_modules/better-sqlite3',name))!=='2d5e0ddafab5f642a82ede046bd3b77786c61001ae289bbabf962530ca5831d5')throw Error('SQLite binding doğrulanamadı.');
const Database=require(path.join(app,'node_modules/better-sqlite3'));
const q=s=>'"'+s.replace(/"/g,'""')+'"';
function inspect(db){
 if(db.pragma('integrity_check',{simple:true})!=='ok'||db.pragma('foreign_key_check').length)throw Error('Veritabanı bütünlük kontrolü başarısız.');
 if(!db.prepare("SELECT 1 FROM __migrations WHERE tag='0028_warehouse_reference_guards'").get())throw Error('0028 depo güvenlik güncellemesi bulunamadı.');
 const scalar=sql=>db.prepare(sql).get().n;
 const blockers={
  acik_pos_vardiyasi:scalar("SELECT count(*) n FROM pos_shifts WHERE status IS NULL OR status<>'CLOSED'"),
  acik_pos_satisi:scalar("SELECT count(*) n FROM pos_sale_intents WHERE status IS NULL OR status NOT IN ('COMPLETED','CANCELLED')"),
  acik_iade:scalar("SELECT count(*) n FROM order_returns WHERE status IS NULL OR status NOT IN ('REFUNDED','REJECTED')"),
  acik_online_siparis:scalar("SELECT count(*) n FROM orders WHERE order_type='ONLINE_B2C' AND (status IS NULL OR status NOT IN ('DELIVERED','CANCELLED','RETURNED','REFUNDED') OR (status<>'CANCELLED' AND (payment_status IS NULL OR payment_status NOT IN ('PAID','REFUNDED'))))"),
  aktif_rezervasyon:scalar("SELECT count(*) n FROM inventory_reservations WHERE status IS NULL OR status='ACTIVE'"),
  ayrilmis_veya_gecersiz_stok:scalar('SELECT count(*) n FROM inventory WHERE reserved_qty IS NULL OR reserved_qty<>0 OR physical_qty IS NULL OR physical_qty<0'),
  sifir_olmayan_stok:scalar('SELECT count(*) n FROM inventory WHERE physical_qty<>0'),
 };
 const warehouses=db.prepare("SELECT id,name,code,type,is_active FROM warehouses ORDER BY id").all();
 const current=db.prepare("SELECT value FROM app_settings WHERE key='sales.shared_warehouse_id'").get();
 return {integrity:'ok',migration_0028:true,blockers,warehouses,ortak_depo:current?.value||null};
}
function checkEmpty(result){if(Object.values(result.blockers).some(n=>n!==0))throw Error('Stok veya açık işlem bulundu; hiçbir işlem yapılmadı. Önce sonucu inceleyin.');}
(async()=>{
 if(mode==='inspect'){
  const db=new Database(live,{readonly:true,fileMustExist:true});try{const result=db.transaction(()=>inspect(db)).deferred();console.log(JSON.stringify(result,null,2));}finally{db.close();}return;
 }
 if(mode==='backup'){
  const dest=path.resolve(backupArg);if(fs.existsSync(dest))throw Error('Yedek zaten var; üzerine yazılmadı.');
  const db=new Database(live,{readonly:true,fileMustExist:true});try{checkEmpty(inspect(db));await db.backup(dest);fs.chmodSync(dest,0o600);}finally{db.close();}
  const copy=new Database(dest,{readonly:true,fileMustExist:true});try{checkEmpty(inspect(copy));}finally{copy.close();}
  console.log('Yedek oluşturuldu ve doğrulandı:',dest);return;
 }
 const saved=fs.realpathSync(backupArg),a=fs.statSync(live),b=fs.statSync(saved);
 if(!b.isFile()||live===saved||(a.dev===b.dev&&a.ino===b.ino))throw Error('Yedek ayrı bir dosya olmalı.');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'serpilen-shared-check-'));fs.chmodSync(dir,0o700);const copy=path.join(dir,'backup.db');fs.copyFileSync(saved,copy,fs.constants.COPYFILE_EXCL);fs.chmodSync(copy,0o600);let db;
 try{
  db=new Database(live,{readonly:true,fileMustExist:true});db.prepare('ATTACH DATABASE ? AS saved_backup').run(copy);
  db.transaction(()=>{
   checkEmpty(inspect(db));
   const schema=alias=>db.prepare(`SELECT type,name,tbl_name,sql FROM ${alias}.sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name`).all();
   if(JSON.stringify(schema('main'))!==JSON.stringify(schema('saved_backup')))throw Error('Yedekten sonra şema değişmiş.');
   const names=db.prepare("SELECT name FROM main.sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name").all().map(x=>x.name);
   for(const name of names){const t=q(name),a=`main.${t}`,b=`saved_backup.${t}`;if(db.prepare(`SELECT count(*) n FROM ${a}`).get().n!==db.prepare(`SELECT count(*) n FROM ${b}`).get().n||db.prepare(`SELECT 1 FROM (SELECT * FROM ${a} EXCEPT SELECT * FROM ${b}) LIMIT 1`).get()||db.prepare(`SELECT 1 FROM (SELECT * FROM ${b} EXCEPT SELECT * FROM ${a}) LIMIT 1`).get())throw Error('Yedekten sonra canlı veri değişmiş: '+name);}
  }).deferred();
  console.log('Canlı DB yedekle eşleşiyor; stok/açık işlem kontrolü temiz.');
 }finally{db?.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error('HATA:',e.message);process.exitCode=1;});
