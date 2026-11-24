import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {SMTPServer} from 'smtp-server';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'notice-'));process.env.DATABASE_URL=`sqlite:${path.join(dir,'db')}`;
assert.equal(spawnSync(process.execPath,['scripts/db-apply.mjs'],{env:process.env}).status,0);
const {sqlite}=require('../src/db/index');const {enqueueStockReadyNotice,sendOneStockReadyNotice}=require('../src/lib/order-notifications');
sqlite.exec(`INSERT INTO orders(id,order_number,customer_name,customer_email,status,payment_status,payment_method) VALUES(1,'NOTICE-1','Test','buyer@example.test','PENDING','PENDING','EFT_HAVALE'),(2,'NOTICE-2','Test','buyer@example.test','PENDING','PENDING','EFT_HAVALE');
 INSERT INTO inventory_reservations(warehouse_id,product_id,qty,reference_type,reference_id,status,expires_at) VALUES(3,1,1,'PAYMENT_HOLD','1','ACTIVE',unixepoch()+86400),(3,1,1,'PAYMENT_HOLD','2','ACTIVE',unixepoch()+86400)`);
sqlite.transaction(()=>{enqueueStockReadyNotice(1);enqueueStockReadyNotice(1);enqueueStockReadyNotice(2);}).immediate();
test('SMTP failures retry without leaking secrets; leased worker sends once and stale orders are cancelled',{timeout:30000},async()=>{
 delete process.env.SMTP_HOST;await sendOneStockReadyNotice();let row=sqlite.prepare('SELECT status,attempts,last_error FROM order_notification_outbox WHERE order_id=1').get();assert.deepEqual(row,{status:'PENDING',attempts:1,last_error:'SMTP yapılandırması eksik'});
 sqlite.exec("UPDATE orders SET status='CANCELLED' WHERE id=2; UPDATE order_notification_outbox SET next_attempt_at=1 WHERE order_id=1");
 let messages:string[]=[];const server=new SMTPServer({authOptional:false,onAuth(auth,_session,cb){cb(null,{user:auth.username});},onData(stream,_session,cb){let text='';stream.on('data',chunk=>text+=chunk.toString());stream.on('end',()=>{messages.push(text);cb();});}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.server.address() as {port:number};
 Object.assign(process.env,{SMTP_HOST:'127.0.0.1',SMTP_PORT:String(address.port),SMTP_USER:'test',SMTP_PASSWORD:'secret',SMTP_FROM:'shop@example.test',PUBLIC_SITE_URL:'https://shop.example.test',NODE_TLS_REJECT_UNAUTHORIZED:'0'});
 try{await Promise.all([sendOneStockReadyNotice(),sendOneStockReadyNotice()]);row=sqlite.prepare('SELECT status,attempts,last_error FROM order_notification_outbox WHERE order_id=1').get();assert.deepEqual(row,{status:'SENT',attempts:2,last_error:null});assert.equal(messages.length,1);assert.match(messages[0],/NOTICE-1/);assert.equal((sqlite.prepare('SELECT status FROM order_notification_outbox WHERE order_id=2').get() as {status:string}).status,'CANCELLED');}
 finally{await new Promise<void>(r=>server.close(()=>r()));delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;}
});
test.after(()=>{sqlite.close();fs.rmSync(dir,{recursive:true,force:true});});
