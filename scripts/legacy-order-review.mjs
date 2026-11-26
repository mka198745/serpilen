/** Read-only diagnostics: this command never changes, migrates or infers financial records. */
import 'dotenv/config';import path from 'node:path';import Database from 'better-sqlite3';
const url=process.env.DATABASE_URL;if(!url||!url.trim()||url.includes(':memory:')){console.error('DATABASE_URL olarak mevcut bir SQLite dosyasını belirtin.');process.exit(2);}
let filename=url.trim().replace(/^sqlite:/,'').replace(/^file:/,'');if(filename.startsWith('mysql:')||filename.startsWith('mysql://')){console.error('Yalnız SQLite desteklenir.');process.exit(2);}filename=path.resolve(filename);
let db;try{
 db=new Database(filename,{readonly:true,fileMustExist:true});db.pragma('query_only = ON');
 const has=name=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
 if(!has('orders')||!has('inventory_reservations'))throw Error('Sipariş veya rezervasyon tablosu bulunamadı.');
 const hasClaims=has('order_discount_claims');
 const filter=`o.order_type='ONLINE_B2C' AND (EXISTS(SELECT 1 FROM inventory_reservations r WHERE r.reference_type='PAYMENT_HOLD' AND r.reference_id=CAST(o.id AS TEXT) AND r.status='ACTIVE' AND r.expires_at>=4102444800) OR (CAST(o.discount_total AS REAL)>0 AND ${hasClaims?"NOT EXISTS(SELECT 1 FROM order_discount_claims c WHERE c.order_id=o.id AND c.kind IN ('COUPON','PROMOTION'))":"1=1"}))`;
 const total=db.prepare(`SELECT COUNT(*) n FROM orders o WHERE ${filter}`).get().n;
 const limit=100,page=Math.max(1,Math.min(100000,Math.floor(Number(process.env.REVIEW_PAGE)||1)));
 const rows=db.prepare(`SELECT o.id,o.order_number,o.status,o.payment_status,o.grand_total,o.discount_total,EXISTS(SELECT 1 FROM inventory_reservations r WHERE r.reference_type='PAYMENT_HOLD' AND r.reference_id=CAST(o.id AS TEXT) AND r.status='ACTIVE' AND r.expires_at>=4102444800) AS long_hold,${hasClaims?"NOT EXISTS(SELECT 1 FROM order_discount_claims c WHERE c.order_id=o.id AND c.kind IN ('COUPON','PROMOTION'))":"1"} AS no_claim_record FROM orders o WHERE ${filter} ORDER BY o.id LIMIT ? OFFSET ?`).all(limit,(page-1)*limit);
 const counters={coupons:has('coupons')?db.prepare('SELECT id,code,used_count,usage_limit FROM coupons ORDER BY id').all():[],promotions:has('promotions')?db.prepare('SELECT id,name,used_count FROM promotions ORDER BY id').all():[]};
 console.log(JSON.stringify({readOnly:true,total,page,pageSize:limit,hasClaims,rows,counters,note:'Hak kaydının olmaması sayaç kullanımını kanıtlamaz. Banka hareketleri ve belgeler ayrıca incelenmelidir.'},null,2));
}catch(e){console.error('Salt okunur inceleme başarısız:',e instanceof Error?e.message:'bilinmeyen hata');process.exitCode=1;}finally{db?.close();}
