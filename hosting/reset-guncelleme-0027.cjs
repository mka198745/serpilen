'use strict';
// Offline only: all app processes and external writers MUST be stopped.
// Explicit user approval required. Never used by application startup.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const [mode,dbArg,backupArg,appArg,confirm,reservedApproval]=process.argv.slice(2);
if(!['inspect','backup','apply'].includes(mode)||![dbArg,appArg].every(p=>p&&path.isAbsolute(p))||(mode!=='inspect'&&(!backupArg||!path.isAbsolute(backupArg)))||(mode==='apply'&&confirm!=='URUN-SATIS-MUSTERI-VE-ANALIZLERI-SIL')||(reservedApproval&&reservedApproval!=='11-AYRILMIS-STOK-YUKUMLULUK-YOK')||(mode!=='apply'&&reservedApproval))throw Error('Kullanım: inspect|backup|apply MUTLAK_DB MUTLAK_YEDEK MUTLAK_STANDALONE [ONAY]');
const dbPath=fs.realpathSync(dbArg), app=fs.realpathSync(appArg);
if(!fs.statSync(dbPath).isFile())throw Error('Canlı DB dosyası bulunamadı.');
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sqlPath=path.join(app,'drizzle-sqlite/0027_pos_screen_pin.sql'),journalPath=path.join(app,'drizzle-sqlite/meta/_journal.json');
if(digest(sqlPath)!=='b0c1cc8cca1330f9ba846bccae804220edb1686e5c850c3cc48e6c709957de1b'||digest(journalPath)!=='71c72688a60c0c1ae2e54bf1f4121e8f14002fa19bc20fb391cf1149a4366f88')throw Error('Migration veya journal SHA eşleşmiyor.');
const journal=JSON.parse(fs.readFileSync(journalPath,'utf8')).entries;
if(journal.length!==28||journal.some((e,i)=>e.idx!==i))throw Error('Migration listesi beklenmiyor.');
const Database=require(path.join(app,'node_modules/better-sqlite3'));
const tables=['__migrations','abc_xyz_classifications','account_transactions','admin_sessions','advertising_performance','anomaly_events','app_settings','audit_logs','auth_nonces','blog_posts','brand_categories','brands','categories','commercial_opportunities','contact_messages','coupons','crm_customer_notes','crm_customer_tags','crm_duplicate_reviews','crm_note_edit_state','crm_tags','customers','decision_alternatives','decision_conflicts','decision_outcomes','decision_records','early_warning_events','early_warning_history','forecast_accuracy','forecast_results','goods_receipt_items','goods_receipts','intelligence_settings','inventory','inventory_ledger','inventory_reservations','loyalty_transactions','management_goals','monte_carlo_runs','opportunity_history','opportunity_impact_results','order_discount_claims','order_items','order_notification_outbox','order_number_reservations','order_return_items','order_returns','order_status_history','orders','pos_cash_transactions','pos_return_context','pos_sale_intents','pos_sale_payments','pos_sale_requests','pos_shifts','product_images','product_questions','product_reviews','product_variants','products','promotions','purchase_order_items','purchase_orders','purchase_request_items','purchase_requests','rfm_scores','scenario_definitions','scenario_results','stock_count_items','stock_count_sessions','stock_transfer_items','stock_transfers','suppliers','users','warehouse_locations','warehouses'];
// Dependency-first deletion. Settings, staff, suppliers, categories, brands,
// coupons, audit logs, advertisement data and sequence/number reservations stay.
const clear=['crm_note_edit_state','crm_customer_notes','crm_customer_tags','crm_duplicate_reviews','rfm_scores','loyalty_transactions','account_transactions','pos_sale_requests','pos_sale_payments','pos_sale_intents','pos_return_context','order_return_items','order_returns','order_notification_outbox','order_discount_claims','order_status_history','order_items','orders','pos_cash_transactions','pos_shifts','goods_receipt_items','goods_receipts','purchase_order_items','purchase_orders','purchase_request_items','purchase_requests','stock_transfer_items','stock_transfers','stock_count_items','stock_count_sessions','inventory_reservations','inventory_ledger','inventory','product_questions','product_reviews','product_images','product_variants','products','opportunity_impact_results','opportunity_history','commercial_opportunities','decision_alternatives','decision_conflicts','decision_outcomes','decision_records','early_warning_history','early_warning_events','forecast_results','forecast_accuracy','anomaly_events','abc_xyz_classifications','scenario_results','monte_carlo_runs'];
const q=s=>'"'+s.replace(/"/g,'""')+'"';
function count(db,t,where=''){return db.prepare(`SELECT count(*) n FROM ${q(t)} ${where}`).get().n;}
function validate(db){
 if(db.pragma('integrity_check',{simple:true})!=='ok'||db.pragma('foreign_key_check').length)throw Error('DB bütünlük/yabancı anahtar kontrolü başarısız.');
 const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>x.name);
 if(JSON.stringify(names)!==JSON.stringify(tables))throw Error('Beklenmeyen veya eksik tablo; işlem durduruldu.');
 const tags=db.prepare('SELECT tag FROM __migrations ORDER BY tag').all().map(x=>x.tag).sort();
 if(JSON.stringify(tags)!==JSON.stringify(journal.slice(0,27).map(e=>e.tag).sort()))throw Error('Canlı veritabanı 0026 ile eşleşmiyor.');
 const blockers={
  acik_vardiya:count(db,'pos_shifts',"WHERE status IS NULL OR status<>'CLOSED'"),
  acik_siparis:count(db,'orders',"WHERE status IS NULL OR status NOT IN ('DELIVERED','CANCELLED','RETURNED','REFUNDED') OR (status<>'CANCELLED' AND (payment_status IS NULL OR payment_status NOT IN ('PAID','REFUNDED')))"),
  acik_iade:count(db,'order_returns',"WHERE status IS NULL OR status NOT IN ('REFUNDED','REJECTED')"),
  aktif_rezervasyon:count(db,'inventory_reservations',"WHERE status='ACTIVE' OR status IS NULL"),
  ayrilmis_stok:count(db,'inventory','WHERE reserved_qty<>0 OR reserved_qty IS NULL'),
  gecersiz_stok_sayaci:count(db,'inventory','WHERE reserved_qty IS NULL OR reserved_qty<0 OR physical_qty IS NULL OR physical_qty<0'),
  acik_pos_satis:count(db,'pos_sale_intents',"WHERE status IS NULL OR status NOT IN ('COMPLETED','CANCELLED')"),
  gonderilmemis_bildirim:count(db,'order_notification_outbox',"WHERE status IS NULL OR status NOT IN ('SENT','CANCELLED')"),
  tamamlanmamis_satin_alma:count(db,'purchase_orders',"WHERE status IS NULL OR status NOT IN ('RECEIVED','CANCELLED')"),
  eksik_mal_kabul:count(db,'purchase_order_items',"WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE status='RECEIVED') AND received_qty<quantity"),
  acik_talep:count(db,'purchase_requests',"WHERE status IS NULL OR status NOT IN ('ORDERED','REJECTED')"),
  acik_transfer:count(db,'stock_transfers',"WHERE status IS NULL OR status NOT IN ('RECEIVED','CANCELLED')"),
  acik_sayim:count(db,'stock_count_sessions',"WHERE status IS NULL OR status NOT IN ('COMPLETED','CANCELLED')"),
  musteri_bakiyesi:count(db,'customers','WHERE balance IS NULL OR CAST(balance AS REAL)<>0'),
  cari_hareket:count(db,'account_transactions'),
  bilinmeyen_kullanici_rolu:count(db,'users',"WHERE role IS NULL OR role NOT IN ('SUPER_ADMIN','STORE_MANAGER','WAREHOUSE_KEEPER','CASHIER','B2C_CUSTOMER')"),
  aktif_super_admin_yok:count(db,'users',"WHERE role='SUPER_ADMIN' AND is_active=1")?0:1,
 };
 const counts=Object.fromEntries([...clear,'customers'].map(t=>[t,count(db,t)]));
 counts.musteri_giris_hesabi=count(db,'users',"WHERE role='B2C_CUSTOMER'");counts.korunacak_personel=count(db,'users',"WHERE role<>'B2C_CUSTOMER'");
 counts.urun_kampanyalari=count(db,'promotions','WHERE product_id IS NOT NULL');counts.fiziksel_stok_kaydi=count(db,'inventory','WHERE physical_qty<>0');
 return {counts,blockers};
}
function sameSnapshot(db){
 const schema=n=>db.prepare(`SELECT type,name,tbl_name,sql FROM ${n}.sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name`).all();
 if(JSON.stringify(schema('main'))!==JSON.stringify(schema('saved_backup')))throw Error('Yedekten sonra şema değişmiş.');
 const names=db.prepare("SELECT name FROM main.sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name").all().map(x=>x.name);
 for(const name of names){const t=q(name),a=`main.${t}`,b=`saved_backup.${t}`;if(db.prepare(`SELECT count(*) n FROM ${a}`).get().n!==db.prepare(`SELECT count(*) n FROM ${b}`).get().n||db.prepare(`SELECT 1 FROM (SELECT * FROM ${a} EXCEPT SELECT * FROM ${b}) LIMIT 1`).get()||db.prepare(`SELECT 1 FROM (SELECT * FROM ${b} EXCEPT SELECT * FROM ${a}) LIMIT 1`).get())throw Error('Yedekten sonra canlı veri değişmiş: '+name);}
}
async function main(){
 if(mode==='backup'){
  const dest=path.resolve(backupArg);if(fs.existsSync(dest))throw Error('Yedek zaten var, üzerine yazılmadı.');
  const parent=fs.realpathSync(path.dirname(dest));if(parent===path.dirname(dbPath))throw Error('Yedek, canlı DB klasöründen ayrı ve güvenli yerde olmalı.');
  const db=new Database(dbPath,{readonly:true,fileMustExist:true});try{validate(db);await db.backup(dest);fs.chmodSync(dest,0o600);}finally{db.close();}
  const copy=new Database(dest,{readonly:true,fileMustExist:true});try{validate(copy);}finally{copy.close();}
  console.log('Doğrulanmış yeni yedek:',dest);return;
 }
 let dir,db;try{
  if(mode==='apply'){
   const backup=fs.realpathSync(backupArg),st=fs.statSync(backup),live=fs.statSync(dbPath);if(!st.isFile()||backup===dbPath||(st.dev===live.dev&&st.ino===live.ino))throw Error('Yedek kaynak DB ile aynı olamaz.');
   const check=new Database(backup,{readonly:true,fileMustExist:true});try{validate(check);}finally{check.close();}
   dir=fs.mkdtempSync(path.join(os.tmpdir(),'serpilen-reset-kontrol-'));fs.chmodSync(dir,0o700);fs.copyFileSync(backup,path.join(dir,'backup.db'),fs.constants.COPYFILE_EXCL);fs.chmodSync(path.join(dir,'backup.db'),0o600);
  }
  db=new Database(dbPath,{readonly:mode==='inspect',fileMustExist:true,timeout:5000});db.pragma('foreign_keys=ON');
  if(mode==='inspect'){const report=validate(db);console.log(JSON.stringify(report,null,2));console.log('Salt okunur inceleme; veri değiştirilmedi.');return;}
  db.prepare('ATTACH DATABASE ? AS saved_backup').run(path.join(dir,'backup.db'));
  db.transaction(()=>{
   const report=validate(db);sameSnapshot(db);
   // This exception is bound to the operator's specifically reviewed live counts,
   // and never clears or invents individual reservations or affects other blockers.
   if(reservedApproval){
    const expected={products:10,customers:3,orders:2,inventory:34,pos_shifts:2,purchase_orders:1,goods_receipts:1,product_variants:21,product_images:9,musteri_giris_hesabi:2,korunacak_personel:2,fiziksel_stok_kaydi:32};
    for(const [key,value] of Object.entries(expected))if(report.counts[key]!==value)throw Error(`Onaylanan canlı sayı değişmiş: ${key}; işlem durduruldu.`);
    if(report.blockers.ayrilmis_stok!==11||count(db,'inventory_reservations')!==0)throw Error('Onaylanan 11 stok sayacı veya rezervasyon durumu değişmiş; işlem durduruldu.');
   }
   const failed=Object.entries(report.blockers).filter(([k,v])=>v>0&&!(k==='ayrilmis_stok'&&reservedApproval));if(failed.length)throw Error('İşlem durduruldu; açık işlem veya incelenmesi gereken kayıt: '+JSON.stringify(Object.fromEntries(failed)));
   const staffBefore=count(db,'users',"WHERE role<>'B2C_CUSTOMER'");
   db.exec("DELETE FROM admin_sessions WHERE user_id IN (SELECT id FROM users WHERE role='B2C_CUSTOMER'); DELETE FROM auth_nonces WHERE user_id IN (SELECT id FROM users WHERE role='B2C_CUSTOMER'); UPDATE users SET customer_id=NULL WHERE customer_id IS NOT NULL; DELETE FROM users WHERE role='B2C_CUSTOMER'; DELETE FROM promotions WHERE product_id IS NOT NULL;");
   for(const table of clear)db.prepare(`DELETE FROM ${q(table)}`).run();
   db.exec('DELETE FROM customers');
   for(const stmt of fs.readFileSync(sqlPath,'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))db.exec(stmt);
   db.prepare('INSERT INTO __migrations(tag) VALUES(?)').run(journal[27].tag);
   if(db.pragma('foreign_key_check').length||db.pragma('integrity_check',{simple:true})!=='ok'||count(db,'users',"WHERE role<>'B2C_CUSTOMER'")!==staffBefore||count(db,'customers')||clear.some(t=>count(db,t))||count(db,'users',"WHERE role='B2C_CUSTOMER'"))throw Error('Son kontrol başarısız; tüm işlem geri alındı.');
   db.prepare("INSERT INTO audit_logs(user_id,user_name,action,entity,details) VALUES('SYSTEM','Sistem','LIVE_RESET','System',?)").run('Onaylı sıfırlama: ürünler, müşteri hesapları, tamamlanmış sipariş ve satın almalar, ilişkili stok ve analiz geçmişi; 0027 uygulandı.'+(reservedApproval?' 11 ayrılmış stok satırı için yükümlülük olmadığı işletme tarafından doğrulandı.':''));
  }).immediate();
  console.log('Sıfırlama ve 0027 tek işlemde tamamlandı; bütünlük kontrolü: ok.');
 }finally{if(db)db.close();if(dir)fs.rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error('HATA:',e.message);process.exitCode=1;});
