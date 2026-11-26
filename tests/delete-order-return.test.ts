import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'delete-order-'));process.env.DATABASE_URL=`sqlite:${path.join(dir,'db')}`;
const migration=spawnSync(process.execPath,['scripts/db-apply.mjs'],{env:process.env,encoding:'utf8'});assert.equal(migration.status,0,migration.stderr);
const {sqlite}=require('../src/db');const {previewOrderReturnDeletion,deleteOrderReturn}=require('../src/lib/delete-order-return');
const admin={id:1,name:'Admin',role:'SUPER_ADMIN',sessionHash:'a'.repeat(64)},manager={id:2,name:'Manager',role:'STORE_MANAGER',sessionHash:'b'.repeat(64)};
sqlite.exec("INSERT INTO categories(id,name,slug) VALUES(1,'K','k'); INSERT INTO warehouses(id,name,code) VALUES(1,'Ana','A'); INSERT INTO app_settings(key,value) VALUES('sales.shared_warehouse_id','1'); INSERT INTO users(id,name,email,password_hash,role) VALUES(1,'Admin','admin@test.invalid','x','SUPER_ADMIN'),(2,'Manager','manager@test.invalid','x','STORE_MANAGER')");
sqlite.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(1,admin.sessionHash,253402300799);sqlite.prepare('INSERT INTO admin_sessions(user_id,jti,expires_at) VALUES(?,?,?)').run(2,manager.sessionHash,253402300799);
function sale(id:number,qty=3){
 sqlite.prepare("INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(?,?,?,?,1,10)").run(id,`Ürün ${id}`,`p${id}`,`s${id}`);
 sqlite.prepare('INSERT INTO inventory(warehouse_id,product_id,physical_qty,reserved_qty) VALUES(1,?,5,0)').run(id);
 sqlite.prepare("INSERT INTO orders(id,order_number,order_type,customer_name,status,payment_status,payment_method,grand_total) VALUES(?,?,'ONLINE_B2C','M','DELIVERED','PAID','EFT_HAVALE',?)").run(id,`S-${id}`,qty*10);
 sqlite.prepare("INSERT INTO order_discount_claims(order_id,kind,target_id,status) VALUES(?,'COVERAGE',0,'ACTIVE')").run(id);
 const item=Number(sqlite.prepare("INSERT INTO order_items(order_id,product_id,product_name,sku,unit_price,quantity,total_price) VALUES(?,?,?, ?,10,?,?)").run(id,id,`Ürün ${id}`,`s${id}`,qty,qty*10).lastInsertRowid);
 sqlite.prepare("INSERT INTO inventory_ledger(transaction_type,warehouse_id,product_id,quantity,reference_type,reference_id) VALUES('SALE',1,?,?,'ORDER',?)").run(id,-qty,`S-${id}`);return item;
}
function refunded(id:number,orderId:number,item:number){
 sqlite.prepare("INSERT INTO order_returns(id,return_number,order_id,order_number,status,refund_amount,restock,warehouse_id) VALUES(?,?,?,?,'RECEIVED',10,1,1)").run(id,`R-${id}`,orderId,`S-${orderId}`);
 sqlite.prepare("INSERT INTO order_return_items(return_id,order_item_id,product_id,product_name,quantity,refund_amount) VALUES(?,?,?,'Ürün',1,10)").run(id,item,orderId);
 sqlite.prepare("INSERT INTO inventory_ledger(transaction_type,warehouse_id,product_id,quantity,reference_type,reference_id) VALUES('RETURN',1,?,1,'RETURN',?)").run(orderId,`R-${id}`);
 sqlite.prepare("UPDATE order_returns SET status='REFUNDED' WHERE id=?").run(id);
}
const scalar=(sql:string,...args:any[])=>sqlite.prepare(sql).get(...args) as any;
const confirm=(p:any)=>({fingerprint:p.fingerprint,physicalConfirmed:true,cascadeConfirmed:true,rightsConfirmed:true,legacyConfirmed:false});

test('Satış silme: yetki, açık onay, değişiklik tespiti, iade ve FIFO tek transaction',()=>{
 const item=sale(1);refunded(1,1,item);sqlite.exec("UPDATE inventory SET physical_qty=1 WHERE product_id=1; INSERT INTO orders(id,order_number,order_type,customer_name,status,payment_status,payment_method,grand_total) VALUES(100,'WAIT','ONLINE_B2C','Sıradaki','BACKORDER','PENDING','EFT_HAVALE',20); INSERT INTO order_items(order_id,product_id,product_name,sku,unit_price,quantity,total_price) VALUES(100,1,'Ürün 1','s1',10,2,20)");
 assert.throws(()=>previewOrderReturnDeletion('order',1,manager),/yetki/);
 sqlite.prepare("INSERT INTO app_settings(key,value) VALUES('admin.role_matrix',?)").run(JSON.stringify({STORE_MANAGER:{orders:true,orderReturnDelete:true}}));
 const p=previewOrderReturnDeletion('order',1,manager);assert.equal(p.returnCount,1);assert.deepEqual(p.stocks.map((x:any)=>[x.physical,x.delta,x.after]),[[1,2,3]]);
 assert.throws(()=>deleteOrderReturn('order',1,manager,{...confirm(p),cascadeConfirmed:false}),/Onay/);
 assert.throws(()=>deleteOrderReturn('order',1,manager,{...confirm(p),physicalConfirmed:false}),/Onay/);
 sqlite.exec('UPDATE inventory SET physical_qty=2 WHERE product_id=1');assert.throws(()=>deleteOrderReturn('order',1,manager,confirm(p)),/değişti/);sqlite.exec('UPDATE inventory SET physical_qty=1 WHERE product_id=1');
 const r=deleteOrderReturn('order',1,manager,confirm(p));assert.equal(r.promoted,1);
 assert.equal(scalar('SELECT count(*) n FROM orders WHERE id=1').n,0);assert.equal(scalar('SELECT count(*) n FROM order_returns WHERE id=1').n,0);assert.equal(scalar('SELECT count(*) n FROM deleted_refund_guards WHERE return_id=1').n,1);
 assert.deepEqual(scalar('SELECT physical_qty,reserved_qty FROM inventory WHERE product_id=1'),{physical_qty:3,reserved_qty:2});assert.equal(scalar('SELECT status FROM orders WHERE id=100').status,'PENDING');assert.equal(scalar("SELECT count(*) n FROM order_notification_outbox WHERE order_id=100 AND status='PENDING'").n,1);
 assert.equal(scalar("SELECT count(*) n FROM audit_logs WHERE action='ORDER_DELETED' AND entity_id='1'").n,1);
});
test('İade silme tahsisi korur ve stokla birlikte audit hatasında geri alınır',()=>{
 const item=sale(2);refunded(2,2,item);const p=previewOrderReturnDeletion('return',2,admin);assert.equal(p.stocks[0].delta,-1);
 sqlite.exec("CREATE TRIGGER fail_delete_audit BEFORE INSERT ON audit_logs WHEN NEW.action='RETURN_DELETED' BEGIN SELECT RAISE(ABORT,'fault'); END");assert.throws(()=>deleteOrderReturn('return',2,admin,confirm(p)),/fault/);
 assert.equal(scalar('SELECT count(*) n FROM order_returns WHERE id=2').n,1);assert.equal(scalar('SELECT count(*) n FROM deleted_refund_guards WHERE return_id=2').n,0);assert.equal(scalar('SELECT physical_qty FROM inventory WHERE product_id=2').physical_qty,5);
 sqlite.exec('DROP TRIGGER fail_delete_audit');deleteOrderReturn('return',2,admin,confirm(p));assert.equal(scalar('SELECT physical_qty FROM inventory WHERE product_id=2').physical_qty,4);assert.equal(scalar('SELECT refund_cents FROM deleted_refund_guards WHERE return_id=2').refund_cents,1000);
 assert.equal(scalar('SELECT count(*) n FROM order_return_items WHERE return_id=2').n,0);
 const {createReturn,completeReturn}=require('../src/lib/order-returns');assert.throws(()=>sqlite.transaction(()=>createReturn(2,[{orderItemId:item,quantity:3}],1,false,'test',admin)).immediate(),/aşıyor/);
 assert.throws(()=>sqlite.transaction(()=>completeReturn(2,admin)).immediate(),/Tekrar para iadesi yapmayın/);
});
test('Belirsizlik, eksik stok, ödeme ve çözülmemiş iadeler silmeyi durdurur',()=>{
 sale(3);sqlite.exec("UPDATE orders SET payment_status='PENDING' WHERE id=3");assert.throws(()=>previewOrderReturnDeletion('order',3,admin),/ödeme/);sqlite.exec("UPDATE orders SET payment_status='PAID' WHERE id=3; DELETE FROM inventory WHERE product_id=3");assert.throws(()=>previewOrderReturnDeletion('order',3,admin),/Stok kaydı/);
 sale(4);sqlite.exec("INSERT INTO order_returns(return_number,order_id,order_number,status,warehouse_id) VALUES('OPEN',4,'S-4','REQUESTED',1)");assert.throws(()=>previewOrderReturnDeletion('order',4,admin),/Sonuçlanmamış/);
 sale(5);sqlite.exec("INSERT INTO loyalty_transactions(customer_id,points,type,order_id) VALUES(1,1,'EARN',5)");assert.throws(()=>previewOrderReturnDeletion('order',5,admin),/Sadakat/);
});
test('POS satışı silinirken kapanmış vardiya ve tekrar tahsilat koruması değişmez',()=>{
 sqlite.exec("INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(6,'POS Ürün','pos-u','pos-u',1,10); INSERT INTO inventory(warehouse_id,product_id,physical_qty,reserved_qty) VALUES(1,6,5,0); INSERT INTO pos_shifts(id,cashier_name,warehouse_id,status,opening_amount,expected_amount) VALUES(6,'Kasiyer',1,'OPEN',0,0)");
 const {preparePosSale,completePosSale}=require('../src/lib/pos-sale-intent');const tx=(f:()=>any)=>sqlite.transaction(f).immediate();
 const payload={orderType:'POS',posRequestKey:randomUUID(),paymentMethod:'CASH',posShiftId:6,warehouseId:1,discountTotal:0,grandTotal:10,items:[{productId:6,quantity:1,unitPrice:10,productName:'POS Ürün',sku:'pos-u'}]};
 tx(()=>preparePosSale(payload,admin));const sale=tx(()=>completePosSale(payload.posRequestKey,admin));
 assert.throws(()=>previewOrderReturnDeletion('order',sale.order.id,admin),/vardiya/);sqlite.exec("UPDATE pos_shifts SET status='CLOSED' WHERE id=6");const before=scalar('SELECT * FROM pos_shifts WHERE id=6');
 const p=previewOrderReturnDeletion('order',sale.order.id,admin);deleteOrderReturn('order',sale.order.id,admin,confirm(p));
 assert.deepEqual(scalar('SELECT * FROM pos_shifts WHERE id=6'),before);assert.equal(scalar('SELECT count(*) n FROM pos_sale_payments WHERE order_id=?',sale.order.id).n,1);assert.equal(scalar('SELECT count(*) n FROM pos_sale_requests WHERE request_key=?',payload.posRequestKey).n,1);
 assert.throws(()=>tx(()=>completePosSale(payload.posRequestKey,admin)),/tekrar tahsilat yapmayın/);assert.equal(scalar('SELECT physical_qty FROM inventory WHERE product_id=6').physical_qty,5);
});
test('POS iade silme nakit kayıtlarını ve tekrar iade engelini korur',()=>{
 sqlite.exec("INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(8,'Kasa','kasa','kasa',1,10); INSERT INTO inventory(warehouse_id,product_id,physical_qty,reserved_qty) VALUES(1,8,5,0); INSERT INTO pos_shifts(id,cashier_name,warehouse_id,status,opening_amount,expected_amount) VALUES(8,'Kasiyer',1,'OPEN',100,100)");
 const {preparePosSale,completePosSale}=require('../src/lib/pos-sale-intent');const {createReturn,receiveReturn,completeReturn}=require('../src/lib/order-returns');const tx=(f:()=>any)=>sqlite.transaction(f).immediate();
 const payload={orderType:'POS',posRequestKey:randomUUID(),paymentMethod:'CASH',posShiftId:8,warehouseId:1,discountTotal:0,grandTotal:20,items:[{productId:8,quantity:2,unitPrice:10,productName:'Kasa',sku:'kasa'}]};tx(()=>preparePosSale(payload,admin));const sale=tx(()=>completePosSale(payload.posRequestKey,admin));const item=scalar('SELECT id FROM order_items WHERE order_id=?',sale.order.id).id;
 const ret=tx(()=>createReturn(sale.order.id,[{orderItemId:item,quantity:1}],1,true,'test',admin,true));sqlite.prepare("INSERT INTO pos_return_context(return_id,shift_id,refund_method) VALUES(?,8,'CASH')").run(ret.id);tx(()=>receiveReturn(ret.id,admin));tx(()=>completeReturn(ret.id,admin,'CASH',8));
 assert.throws(()=>previewOrderReturnDeletion('return',ret.id,admin),/vardiya/);sqlite.exec("UPDATE pos_shifts SET status='CLOSED' WHERE id=8");const before=scalar('SELECT * FROM pos_shifts WHERE id=8');const p=previewOrderReturnDeletion('return',ret.id,admin);deleteOrderReturn('return',ret.id,admin,confirm(p));
 assert.deepEqual(scalar('SELECT * FROM pos_shifts WHERE id=8'),before);assert.equal(scalar('SELECT count(*) n FROM pos_return_context WHERE return_id=?',ret.id).n,1);assert.equal(scalar('SELECT count(*) n FROM deleted_refund_guards WHERE return_id=?',ret.id).n,1);assert.throws(()=>tx(()=>completeReturn(ret.id,admin,'CASH',8)),/Tekrar para iadesi yapmayın/);
});
test('Çok depolu varyant hareketleri doğrulanır; iade silinirse eski sipariş onayı geçersizleşir',()=>{
 sqlite.exec("INSERT INTO warehouses(id,name,code) VALUES(2,'Diğer','B'); INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(7,'Varyantlı','varyant','v',1,10); INSERT INTO product_variants(id,product_id,sku,color_name,retail_price) VALUES(70,7,'v70','Mavi',10); INSERT INTO inventory(warehouse_id,product_id,variant_id,physical_qty,reserved_qty) VALUES(1,7,70,2,0),(2,7,70,4,0); INSERT INTO orders(id,order_number,order_type,customer_name,status,payment_status,payment_method,grand_total) VALUES(7,'S-7','ONLINE_B2C','M','DELIVERED','PAID','EFT_HAVALE',30); INSERT INTO order_items(id,order_id,product_id,variant_id,product_name,sku,unit_price,quantity,total_price) VALUES(70,7,7,70,'Varyantlı','v70',10,3,30); INSERT INTO order_discount_claims(order_id,kind,target_id) VALUES(7,'COVERAGE',0); INSERT INTO inventory_ledger(transaction_type,warehouse_id,product_id,variant_id,quantity,reference_type,reference_id) VALUES('SALE',1,7,70,-2,'ORDER','S-7'),('SALE',2,7,70,-1,'ORDER','S-7'),('RETURN',2,7,70,1,'RETURN','R-7'); INSERT INTO order_returns(id,return_number,order_id,order_number,status,refund_amount,restock,warehouse_id) VALUES(7,'R-7',7,'S-7','RECEIVED',10,1,2); INSERT INTO order_return_items(return_id,order_item_id,product_id,variant_id,product_name,quantity,refund_amount) VALUES(7,70,7,70,'Varyantlı',1,10); UPDATE order_returns SET status='REFUNDED' WHERE id=7");
 const op=previewOrderReturnDeletion('order',7,admin);assert.deepEqual(op.stocks.map((x:any)=>[x.warehouseId,x.variantName,x.delta]),[[1,'Mavi',2],[2,'Mavi',0]]);
 const rp=previewOrderReturnDeletion('return',7,admin);deleteOrderReturn('return',7,admin,confirm(rp));assert.throws(()=>deleteOrderReturn('order',7,admin,confirm(op)),/değişti/);
 const newOrderPreview=previewOrderReturnDeletion('order',7,admin);deleteOrderReturn('order',7,admin,confirm(newOrderPreview));assert.deepEqual(sqlite.prepare('SELECT warehouse_id,physical_qty FROM inventory WHERE product_id=7 ORDER BY warehouse_id').all(),[{warehouse_id:1,physical_qty:4},{warehouse_id:2,physical_qty:4}]);
});
test('Kısmi iade sonrası puan ve indirim hakları ayrı onayla bir kez terslenir',()=>{
 sale(10);sqlite.exec("INSERT INTO customers(id,name,phone,loyalty_points) VALUES(10,'M','55510',20); UPDATE orders SET customer_id=10,discount_total=2 WHERE id=10; INSERT INTO loyalty_transactions(customer_id,points,type,order_id) VALUES(10,10,'EARN',10),(10,-4,'SPEND',10),(10,-3,'RETURN_REVERSE_EARN',10),(10,1,'RETURN_RESTORE_SPEND',10); INSERT INTO coupons(id,code,discount_value,used_count) VALUES(10,'TEN',2,2); INSERT INTO promotions(id,name,used_count) VALUES(10,'Ten Promo',3); INSERT INTO order_discount_claims(order_id,kind,target_id) VALUES(10,'COUPON',10),(10,'PROMOTION',10)");
 const p=previewOrderReturnDeletion('order',10,admin);assert.deepEqual(p.rights.loyalty,{customerId:10,current:20,delta:-4,after:16});assert.deepEqual(p.rights.discounts.map((d:any)=>[d.kind,d.current,d.after]),[['COUPON',2,1],['PROMOTION',3,2]]);
 assert.throws(()=>deleteOrderReturn('order',10,admin,{...confirm(p),rightsConfirmed:false}),/Onay/);
 sqlite.exec("UPDATE customers SET loyalty_points=21 WHERE id=10");assert.throws(()=>deleteOrderReturn('order',10,admin,confirm(p)),/değişti/);sqlite.exec("UPDATE customers SET loyalty_points=20 WHERE id=10");
 sqlite.exec("CREATE TRIGGER fail_rights_audit BEFORE INSERT ON audit_logs WHEN NEW.action='ORDER_DELETED' BEGIN SELECT RAISE(ABORT,'rights_fault'); END");assert.throws(()=>deleteOrderReturn('order',10,admin,confirm(p)),/rights_fault/);assert.equal(scalar('SELECT loyalty_points FROM customers WHERE id=10').loyalty_points,20);assert.equal(scalar('SELECT used_count FROM coupons WHERE id=10').used_count,2);sqlite.exec('DROP TRIGGER fail_rights_audit');
 deleteOrderReturn('order',10,admin,confirm(p));assert.equal(scalar('SELECT loyalty_points FROM customers WHERE id=10').loyalty_points,16);assert.equal(scalar('SELECT used_count FROM coupons WHERE id=10').used_count,1);assert.equal(scalar('SELECT used_count FROM promotions WHERE id=10').used_count,2);assert.equal(scalar("SELECT points FROM loyalty_transactions WHERE order_id=10 AND type='ORDER_DELETE_REVERSAL'").points,-4);assert.equal(scalar("SELECT count(*) n FROM order_discount_claims WHERE order_id=10 AND status='RELEASED'").n,3);
});
test('Puan yetersizliği durdurur; eski kayıtlar ayrıca belgelerle doğrulama gerektirir',()=>{
 sale(11);sqlite.exec("INSERT INTO customers(id,name,phone,loyalty_points) VALUES(11,'M','55511',1); UPDATE orders SET customer_id=11 WHERE id=11; INSERT INTO loyalty_transactions(customer_id,points,type,order_id) VALUES(11,5,'EARN',11)");assert.throws(()=>previewOrderReturnDeletion('order',11,admin),/yetersiz/);
 sale(12);sqlite.exec('DELETE FROM order_discount_claims WHERE order_id=12');const legacy=previewOrderReturnDeletion('order',12,admin);assert.equal(legacy.rights.legacyReviewRequired,true);assert.throws(()=>deleteOrderReturn('order',12,admin,confirm(legacy)),/Onay/);deleteOrderReturn('order',12,admin,{...confirm(legacy),legacyConfirmed:true});const audit=JSON.parse(scalar("SELECT details FROM audit_logs WHERE action='ORDER_DELETED' AND entity_id='12'").details);assert.equal(audit.legacyConfirmed,true);assert.equal(audit.rights.legacyReviewRequired,true);
});
test('Eski satışın kayıtlı kuponu ancak ayrıca mutabakatla geri verilir',()=>{
 sale(14);sqlite.exec("DELETE FROM order_discount_claims WHERE order_id=14; INSERT INTO coupons(id,code,discount_value,used_count) VALUES(14,'OLD14',2,1); INSERT INTO order_discount_claims(order_id,kind,target_id) VALUES(14,'COUPON',14); UPDATE orders SET discount_total=2 WHERE id=14");
 const p=previewOrderReturnDeletion('order',14,admin);assert.equal(p.rights.legacyReviewRequired,true);assert.equal(p.rights.discounts[0].name,'OLD14');assert.throws(()=>deleteOrderReturn('order',14,admin,confirm(p)),/Onay/);assert.throws(()=>deleteOrderReturn('order',14,admin,{...confirm(p),rightsConfirmed:false,legacyConfirmed:true}),/Onay/);deleteOrderReturn('order',14,admin,{...confirm(p),legacyConfirmed:true});assert.equal(scalar('SELECT used_count FROM coupons WHERE id=14').used_count,0);
});
test('POS kupon, kampanya ve puan hakları tamamlanmış hazırlık kanıtına dayanarak terslenir',()=>{
 sqlite.exec("INSERT INTO products(id,name,slug,sku,category_id,retail_price) VALUES(13,'Haklı POS','hakli-pos','hakli-pos',1,10); INSERT INTO inventory(warehouse_id,product_id,physical_qty,reserved_qty) VALUES(1,13,5,0); INSERT INTO pos_shifts(id,cashier_name,warehouse_id,status,opening_amount,expected_amount) VALUES(13,'Kasiyer',1,'OPEN',0,0); INSERT INTO customers(id,name,phone,loyalty_points) VALUES(13,'M','55513',50); INSERT INTO coupons(id,code,discount_type,discount_value,used_count) VALUES(13,'POS13','PERCENT',10,0); INSERT INTO promotions(id,name,rule_type,category_id,percent_value,start_date,used_count) VALUES(13,'Yüzde','PERCENT_CATEGORY',1,10,1,0)");
 const {preparePosSale,completePosSale}=require('../src/lib/pos-sale-intent'),{posQuote}=require('../src/lib/pos-quote');const tx=(f:()=>any)=>sqlite.transaction(f).immediate();const items=[{productId:13,quantity:1,unitPrice:10,productName:'Haklı POS',sku:'hakli-pos'}];const quote=tx(()=>posQuote(items,0,true,'POS13',2,13));
 const payload={orderType:'POS',posRequestKey:randomUUID(),customerId:13,paymentMethod:'CASH',posShiftId:13,warehouseId:1,discountTotal:0,grandTotal:quote.grandTotal,couponCode:'POS13',spentPoints:2,items};tx(()=>preparePosSale(payload,admin));const result=tx(()=>completePosSale(payload.posRequestKey,admin));sqlite.exec("UPDATE pos_shifts SET status='CLOSED' WHERE id=13");
 const p=previewOrderReturnDeletion('order',result.order.id,admin);assert.equal(p.rights.loyalty.delta,2);assert.deepEqual(new Set(p.rights.discounts.map((d:any)=>d.kind)),new Set(['COUPON','PROMOTION']));deleteOrderReturn('order',result.order.id,admin,confirm(p));assert.equal(scalar('SELECT loyalty_points FROM customers WHERE id=13').loyalty_points,50);assert.equal(scalar('SELECT used_count FROM coupons WHERE id=13').used_count,0);assert.equal(scalar('SELECT used_count FROM promotions WHERE id=13').used_count,0);assert.throws(()=>tx(()=>completePosSale(payload.posRequestKey,admin)),/tekrar tahsilat yapmayın/);
});
test.after(()=>{sqlite.close();fs.rmSync(dir,{recursive:true,force:true});});
