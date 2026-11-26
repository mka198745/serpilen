import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { deleteProductSafely, previewProductDeletion } from "../src/lib/delete-product";

function setup() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT,is_active INTEGER); INSERT INTO users VALUES(1,'SUPER_ADMIN',1),(2,'STORE_MANAGER',1);
    CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT); INSERT INTO products VALUES(5,'Test ürün'),(6,'Başka ürün');
    CREATE TABLE product_variants(id INTEGER PRIMARY KEY, product_id INTEGER); INSERT INTO product_variants VALUES(11,5);
    CREATE TABLE product_images(id INTEGER PRIMARY KEY,product_id INTEGER,variant_id INTEGER); INSERT INTO product_images VALUES(1,5,11);
    CREATE TABLE warehouses(id INTEGER PRIMARY KEY,name TEXT); INSERT INTO warehouses VALUES(1,'Merkez'),(2,'Diğer');
    CREATE TABLE inventory(id INTEGER PRIMARY KEY,product_id INTEGER,variant_id INTEGER,physical_qty INTEGER,reserved_qty INTEGER,warehouse_id INTEGER); INSERT INTO inventory VALUES(1,5,11,0,0,1);
    CREATE TABLE order_items(id INTEGER PRIMARY KEY,product_id INTEGER,variant_id INTEGER);
    CREATE TABLE decision_records(id INTEGER PRIMARY KEY,related_product_id INTEGER);
    CREATE TABLE audit_logs(user_id TEXT,user_name TEXT,action TEXT,entity TEXT,entity_id TEXT,details TEXT);`);
  return db;
}
const actor = {id:1,role:"SUPER_ADMIN",name:"Admin"};
test("Bağlantısız ürün, sıfır stok satırı, varyantlar ve görsel kayıtları atomik silinir",()=>{
  const db=setup();try {
    assert.deepEqual(deleteProductSafely(db,5,actor),{status:200,name:"Test ürün"});
    for(const table of ['product_variants','product_images','inventory'])assert.equal((db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as {n:number}).n,0);
    assert.equal((db.prepare('SELECT COUNT(*) n FROM products').get() as {n:number}).n,1);
    assert.deepEqual(db.prepare('SELECT action,entity_id FROM audit_logs').get(),{action:'PRODUCT_DELETED',entity_id:'5'});
    assert.equal(deleteProductSafely(db,5,actor).status,404);
  }finally{db.close();}
});
test("Stok, rezervasyon, sipariş, eski veya yeni ilişkiler korumaya alınır",()=>{
  const updates = [
    "UPDATE inventory SET physical_qty=1", "UPDATE inventory SET reserved_qty=1", "UPDATE inventory SET product_id=6",
    "INSERT INTO product_images VALUES(2,6,11)", "INSERT INTO product_variants VALUES(12,6); UPDATE inventory SET variant_id=12", "INSERT INTO product_variants VALUES(12,6); UPDATE product_images SET variant_id=12", "INSERT INTO order_items VALUES(1,5,NULL)", "INSERT INTO order_items VALUES(1,6,11)",
    "INSERT INTO decision_records VALUES(1,5)", "CREATE TABLE newer_refs(id INTEGER, product_id INTEGER); INSERT INTO newer_refs VALUES(1,5)",
    "CREATE TABLE purchase_order_items(id INTEGER,product_id INTEGER,variant_id INTEGER); INSERT INTO purchase_order_items VALUES(1,5,NULL)",
    "CREATE TABLE goods_receipt_items(id INTEGER,product_id INTEGER,variant_id INTEGER); INSERT INTO goods_receipt_items VALUES(1,5,NULL)",
    "CREATE TABLE supplier_return_items(id INTEGER,product_id INTEGER,variant_id INTEGER); INSERT INTO supplier_return_items VALUES(1,5,11)"
  ];
  for(const sql of updates){const db=setup();try{db.exec(sql);assert.equal(deleteProductSafely(db,5,actor).status,409,sql);assert.ok(db.prepare('SELECT id FROM products WHERE id=5').get());assert.equal((db.prepare('SELECT COUNT(*) n FROM audit_logs').get() as {n:number}).n,0);}finally{db.close();}}
});
test("Yetkisiz işlem ve denetim hatası hiçbir kayıt değiştirmez",()=>{
  const db=setup();try{
    assert.equal(deleteProductSafely(db,5,{id:2,role:'STORE_MANAGER',name:'Müdür'}).status,403);
    db.exec("CREATE TRIGGER block_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'fail'); END");
    assert.throws(()=>deleteProductSafely(db,5,actor));
    assert.ok(db.prepare('SELECT id FROM products WHERE id=5').get());assert.ok(db.prepare('SELECT id FROM product_variants WHERE id=11').get());assert.ok(db.prepare('SELECT id FROM inventory WHERE id=1').get());
  }finally{db.close();}
});

test("Kaydedilmiş katalog ve silme yetkileri işlem içinde doğrulanır; iptal, hesap ve stok korumaları uygulanır",()=>{
  const db=setup(), manager={id:2,role:'STORE_MANAGER',name:'Müdür'};
  const set=(value:string)=>db.prepare("INSERT OR REPLACE INTO app_settings(key,value) VALUES('admin.role_matrix',?)").run(value);
  try {
    assert.equal(deleteProductSafely(db,5,manager).status,403);
    set('{bad'); assert.equal(deleteProductSafely(db,5,manager).status,403);
    set(JSON.stringify({STORE_MANAGER:{catalog:false,productDelete:true}}));assert.equal(deleteProductSafely(db,5,manager).status,403);
    set(JSON.stringify({STORE_MANAGER:{catalog:true,productDelete:false}}));assert.equal(deleteProductSafely(db,5,manager).status,403);
    set(JSON.stringify({STORE_MANAGER:{catalog:true,productDelete:true}}));
    db.exec('UPDATE inventory SET physical_qty=2');assert.equal(deleteProductSafely(db,5,manager).status,409);
    db.exec('UPDATE inventory SET physical_qty=0; UPDATE users SET is_active=0 WHERE id=2');assert.equal(deleteProductSafely(db,5,manager).status,403);
    db.exec("UPDATE users SET is_active=1,role='CASHIER' WHERE id=2");assert.equal(deleteProductSafely(db,5,manager).status,403);
    db.exec("UPDATE users SET role='STORE_MANAGER' WHERE id=2");
    set(JSON.stringify({STORE_MANAGER:{catalog:true,productDelete:false}}));assert.equal(deleteProductSafely(db,5,manager).status,403);
    set(JSON.stringify({STORE_MANAGER:{catalog:true,productDelete:true}}));assert.equal(deleteProductSafely(db,5,manager).status,200);
    assert.deepEqual(db.prepare('SELECT user_id,user_name,action FROM audit_logs').get(),{user_id:'2',user_name:'Müdür',action:'PRODUCT_DELETED'});
  } finally { db.close(); }
});

test("Tüm depolardaki ayrılmamış stok yalnız güncel açık onayla silinir",()=>{
  const db=setup();try{
    db.exec("UPDATE inventory SET physical_qty=8; INSERT INTO inventory VALUES(2,5,11,3,0,2)");
    const first=previewProductDeletion(db,5,actor);assert.equal(first.status,200);if(first.status!==200)throw Error('preview');
    assert.equal(first.preview.totalStock,11);assert.deepEqual(first.preview.warehouses,[{id:1,name:'Merkez',quantity:8},{id:2,name:'Diğer',quantity:3}]);
    assert.equal(deleteProductSafely(db,5,actor).status,409);
    db.exec('UPDATE inventory SET physical_qty=4 WHERE id=2');assert.equal(deleteProductSafely(db,5,actor,first.preview.fingerprint).status,409);
    let next=previewProductDeletion(db,5,actor);if(next.status!==200)throw Error('preview');
    db.exec('UPDATE inventory SET reserved_qty=1 WHERE id=2');assert.equal(deleteProductSafely(db,5,actor,next.preview.fingerprint).status,409);
    db.exec('UPDATE inventory SET reserved_qty=0 WHERE id=2; INSERT INTO order_items VALUES(1,5,NULL)');assert.equal(deleteProductSafely(db,5,actor,next.preview.fingerprint).status,409);
    db.exec('DELETE FROM order_items');next=previewProductDeletion(db,5,actor);if(next.status!==200)throw Error('preview');
    assert.equal(deleteProductSafely(db,5,actor,next.preview.fingerprint).status,200);
    assert.equal((db.prepare('SELECT count(*) n FROM inventory').get() as {n:number}).n,0);
    const audit=db.prepare('SELECT details FROM audit_logs').get() as {details:string};const details=JSON.parse(audit.details);assert.equal(details.discardedStock,12);assert.equal(details.warehouses[1].quantity,4);assert.equal(details.stockRows[1].variantId,11);assert.equal(details.stockRows[1].physicalQty,4);
  }finally{db.close();}
});
