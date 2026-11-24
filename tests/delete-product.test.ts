import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { deleteProductSafely } from "../src/lib/delete-product";

function setup() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT,is_active INTEGER); INSERT INTO users VALUES(1,'SUPER_ADMIN',1),(2,'STORE_MANAGER',1);
    CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT); INSERT INTO products VALUES(5,'Test ürün'),(6,'Başka ürün');
    CREATE TABLE product_variants(id INTEGER PRIMARY KEY, product_id INTEGER); INSERT INTO product_variants VALUES(11,5);
    CREATE TABLE product_images(id INTEGER PRIMARY KEY,product_id INTEGER,variant_id INTEGER); INSERT INTO product_images VALUES(1,5,11);
    CREATE TABLE inventory(id INTEGER PRIMARY KEY,product_id INTEGER,variant_id INTEGER,physical_qty INTEGER,reserved_qty INTEGER); INSERT INTO inventory VALUES(1,5,11,0,0);
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
    "INSERT INTO decision_records VALUES(1,5)", "CREATE TABLE newer_refs(id INTEGER, product_id INTEGER); INSERT INTO newer_refs VALUES(1,5)"
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
