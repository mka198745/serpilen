import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import Database from 'better-sqlite3';
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}

test('Ürün ve varyant stokları tek işlemde kaydedilir; hata hepsini geri alır', {timeout:40000}, async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'new-product-variants-')),file=path.join(dir,'test.db'),env={...process.env,DATABASE_URL:`sqlite:${file}`};let db,server;
 try {
  const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);
  db=new Database(file);db.pragma('foreign_keys = ON');
  db.prepare("INSERT INTO warehouses(id,name,code) VALUES (1,'Merkez','MRK'),(2,'Mağaza','M2')").run();
  const user=db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES ('Admin','admin@example.test','hash','SUPER_ADMIN')").run().lastInsertRowid;
  const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(user,crypto.createHash('sha256').update(token).digest('hex'),Math.floor(Date.now()/1000)+3600);
  const hook=path.join(dir,'dns-hook.cjs');fs.writeFileSync(hook, `const dns=require('node:dns');const orig=dns.promises.lookup.bind(dns.promises);dns.promises.lookup=(host,opts)=>host==='cdn.fixture.example'?Promise.resolve([{address:'8.8.8.8',family:4}]):host==='private.fixture.example'?Promise.resolve([{address:'127.0.0.1',family:4}]):orig(host,opts);`);
  const port=await freePort();server=spawn(process.execPath,['scripts/start-standalone.mjs'],{env:{...env,PORT:String(port),NODE_ENV:'production',NODE_OPTIONS:`--require=${hook}`},stdio:'ignore'});const base=`http://127.0.0.1:${port}/api/products`;let ready=false;for(let i=0;i<100;i++){try{await fetch(base);ready=true;break}catch{await delay(100)}}assert.ok(ready);
  const post=(body,auth=true)=>fetch(base,{method:'POST',headers:{...(auth?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},body:JSON.stringify(body)});
  const v=(name,stock,extra={})=>({colorName:name,colorHex:'',size:'',length:'',sku:'',barcode:'',retailPrice:'',buyPrice:'',initialStock:String(stock),...extra});
  const product={name:'Deneme İplik',sku:'DENEME',barcode:'',categoryId:1,brandId:'',buyPrice:'30.00',retailPrice:'55.00',initialStock:0,warehouseId:2,images:['https://example.test/product.jpg'],variants:[v('Siyah',8,{retailPrice:'60.00',imageUrl:'https://cdn.fixture.example/siyah.jpg'}),v('Kırmızı',3,{sku:'KIRMIZI',barcode:'123456'})]};
  assert.equal((await post(product,false)).status,401);
  const res=await post(product);assert.equal(res.status,200,JSON.stringify(await res.clone().json()));const result=(await res.json()).data;assert.equal(result.hasVariants,true);assert.equal(result.barcode,null);
  const vars=db.prepare('SELECT * FROM product_variants WHERE product_id=? ORDER BY id').all(result.id);assert.equal(vars.length,2);assert.equal(vars[0].sku,'DENEME-SIYAH-STD-1');assert.equal(vars[0].barcode,null);assert.equal(vars[0].image_url,'https://cdn.fixture.example/siyah.jpg');assert.equal(vars[1].image_url,null);assert.equal(Number(vars[0].retail_price),60);assert.equal(Number(vars[1].retail_price),55);assert.equal(vars[1].barcode,'123456');
  assert.deepEqual(db.prepare('SELECT warehouse_id,variant_id,physical_qty FROM inventory WHERE product_id=? ORDER BY variant_id').all(result.id),[{warehouse_id:2,variant_id:vars[0].id,physical_qty:8},{warehouse_id:2,variant_id:vars[1].id,physical_qty:3}]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM product_images WHERE product_id=?').get(result.id).n,1);
  const fetched=(await (await fetch(`${base}?q=KIRMIZI`)).json()).data;assert.equal(fetched[0].totalStock,11);assert.equal(fetched[0].variants.length,2);
  // Zero stock must not create a parent or variant inventory row.
  const zero=await post({...product,name:'Stoksuz',sku:'ZERO',images:[],variants:[v('Beyaz',0)]});assert.equal(zero.status,200);const zp=(await zero.json()).data;
  assert.equal(db.prepare('SELECT COUNT(*) n FROM inventory WHERE product_id=?').get(zp.id).n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM product_variants WHERE product_id=?').get(zp.id).n,1);
  const counts=()=>[db.prepare('SELECT COUNT(*) n FROM products').get().n,db.prepare('SELECT COUNT(*) n FROM product_variants').get().n,db.prepare('SELECT COUNT(*) n FROM inventory').get().n,db.prepare('SELECT COUNT(*) n FROM product_images').get().n];
  const before=counts();
  const duplicateInside=await post({...product,name:'Çift Barkod',sku:'CIFT',variants:[v('A',1,{barcode:'same'}),v('B',2,{barcode:'same'})]});
  assert.equal(duplicateInside.status,422);assert.deepEqual(counts(),before);
  const duplicateParent=await post({...product,name:'Ürün Barkodu',sku:'BARKOD',barcode:'same',variants:[v('A',1,{barcode:'same'})]});
  assert.equal(duplicateParent.status,422);assert.deepEqual(counts(),before);
  for(const [variant, change] of [
   [v('Mavi',1,{sku:'KIRMIZI'}),{}], [v('Mavi',1,{barcode:'123456'}),{}],
   [v('Mavi',1,{imageUrl:'https://private.fixture.example/unsafe.jpg'}),{}], [v('Mavi',1,{imageUrl:'http://cdn.fixture.example/unsafe.jpg'}),{}], [v('Mavi',-1),{}], [v('Mavi',1,{retailPrice:'-2'}),{}], [v('',1),{}],
   [v('Mavi',1),{warehouseId:99}], [v('Mavi',1),{initialStock:50}], [v('Mavi',1),{retailPrice:'-1'}],
  ]) {
   const invalid=await post({...product,...change,name:'Hatalı Ürün',sku:'HATALI',variants:[variant]});assert.equal(invalid.status,422,JSON.stringify(await invalid.clone().json()));assert.deepEqual(counts(),before);
  }
  // Force a failure after the product, gallery, and first variant have been inserted.
  db.exec("CREATE TRIGGER fail_second_variant BEFORE INSERT ON product_variants WHEN NEW.color_name='Hata' BEGIN SELECT RAISE(ABORT, 'test rollback'); END");
  const rollback=await post({...product,name:'Geri Alma',sku:'GERI',variants:[v('Mavi',4),v('Hata',5)]});assert.equal(rollback.status,500);assert.deepEqual(counts(),before);assert.equal(db.prepare("SELECT COUNT(*) n FROM products WHERE sku='GERI'").get().n,0);db.exec('DROP TRIGGER fail_second_variant');
  // The existing simple product workflow still creates product-level stock.
  const single=await post({...product,name:'Tek Ürün',sku:'TEK',barcode:'987654',initialStock:9,variants:[]});assert.equal(single.status,200);const sp=(await single.json()).data;assert.equal(sp.hasVariants,false);assert.equal(db.prepare('SELECT physical_qty FROM inventory WHERE product_id=? AND variant_id IS NULL').get(sp.id).physical_qty,9);
 } finally {if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
