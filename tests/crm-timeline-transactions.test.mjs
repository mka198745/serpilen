import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';

async function freePort() {
  const s = net.createServer();
  await new Promise((resolve, reject) => { s.once('error', reject); s.listen(0, '127.0.0.1', resolve); });
  const p = s.address().port;
  await new Promise(resolve => s.close(resolve));
  return p;
}

test('İade ve sadakat zaman çizelgesi müşteri, kanal ve tarih sınırlarını korur', { timeout: 30000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-timeline-tx-'));
  const dbPath = path.join(dir, 'test.db');
  const env = { ...process.env, DATABASE_URL: `sqlite:${dbPath}` };
  let server;
  try {
    const migrate = () => spawnSync(process.execPath, ['scripts/db-apply.mjs'], { env, encoding: 'utf8', timeout: 15000 });
    let result = migrate(); assert.equal(result.status, 0, result.stderr);
    const db = new Database(dbPath);
    const customer = db.prepare('INSERT INTO customers (id,name,phone) VALUES (?,?,?)');
    customer.run(1, 'İlk', '5551234567'); customer.run(2, 'Diğer', '5551234568');
    const order = db.prepare('INSERT INTO orders (id,order_number,customer_id,customer_name,order_type,grand_total) VALUES (?,?,?,?,?,?)');
    order.run(1,'A-1',1,'İlk','ONLINE_B2C','100'); order.run(2,'OTHER-SECRET',2,'Diğer','POS','200'); order.run(3,'GUEST-SECRET',null,'İlk','POS','300');
    const ret = db.prepare('INSERT INTO order_returns (id,return_number,order_id,order_number,status,created_by,created_at,reason) VALUES (?,?,?,?,?,?,?,?)');
    ret.run(1,'IAD-1',1,'A-1','REFUNDED','Personel',1735689600,'GİZLİ NEDEN');
    ret.run(2,'IAD-OTHER',2,'OTHER-SECRET','REQUESTED','Diğer',1735689600,'GİZLİ');
    ret.run(3,'IAD-GUEST',3,'GUEST-SECRET','REQUESTED','Diğer',1735689600,'GİZLİ');
    const loyalty = db.prepare('INSERT INTO loyalty_transactions (id,customer_id,points,type,order_id,created_at,description) VALUES (?,?,?,?,?,?,?)');
    loyalty.run(1,1,-40,'SPEND',1,1735775999,'GİZLİ PUAN AÇIKLAMASI');
    loyalty.run(2,1,10,'BONUS',null,1735776000,'GİZLİ');
    loyalty.run(3,1,5,'EARN',2,1735776001,'GİZLİ'); // inconsistent order relationship, never expose it
    loyalty.run(4,2,99,'BONUS',2,1735776000,'GİZLİ');
    for (let i = 10; i < 31; i++) loyalty.run(i,1,i,'EARN',null,1735862400+i,'GİZLİ');
    assert.match(db.prepare('EXPLAIN QUERY PLAN SELECT id FROM order_returns WHERE order_id=? ORDER BY created_at,id').all(1).map(x => x.detail).join(' '), /order_returns_order_created_idx/);
    assert.match(db.prepare('EXPLAIN QUERY PLAN SELECT id FROM loyalty_transactions WHERE customer_id=? ORDER BY created_at,id').all(1).map(x => x.detail).join(' '), /loyalty_transactions_customer_created_idx/);
    const user = db.prepare('INSERT INTO users (email,password_hash,name,role) VALUES (?,?,?,?)');
    const tokens = {};
    for (const role of ['SUPER_ADMIN', 'STORE_MANAGER', 'CASHIER', 'B2C_CUSTOMER']) {
      const id = user.run(`${role}@example.test`, 'hash', role, role).lastInsertRowid;
      const token = crypto.randomBytes(32).toString('hex'); tokens[role] = token;
      db.prepare('INSERT INTO admin_sessions (user_id,jti,expires_at) VALUES (?,?,?)').run(id, crypto.createHash('sha256').update(token).digest('hex'), Math.floor(Date.now()/1000)+3600);
    }
    db.exec("DROP INDEX order_returns_order_created_idx; DROP INDEX loyalty_transactions_customer_created_idx; DELETE FROM __migrations WHERE tag='0018_crm_timeline_transaction_indexes'");
    db.close();
    result = migrate(); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /uygulanıyor: 0018_crm_timeline_transaction_indexes/);
    const afterMigration = new Database(dbPath, { readonly: true });
    assert.equal(afterMigration.prepare('SELECT COUNT(*) AS n FROM order_returns').get().n, 3);
    assert.equal(afterMigration.prepare('SELECT COUNT(*) AS n FROM loyalty_transactions').get().n, 25);
    assert.ok(afterMigration.prepare("PRAGMA index_list('loyalty_transactions')").all().some(index => index.name === 'loyalty_transactions_customer_created_idx'));
    afterMigration.close();
    result = migrate(); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /atlandı \(uygulanmış\): 0018_crm_timeline_transaction_indexes/);
    const port = await freePort();
    server = spawn(process.execPath, ['scripts/start-standalone.mjs'], { env: { ...env, PORT: String(port), NODE_ENV: 'production' }, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}`;
    let ready = false; for (let i = 0; i < 100; i++) { try { await fetch(base+'/api/crm/customers'); ready = true; break; } catch { if (server.exitCode !== null) throw Error('Sunucu kapandı'); await delay(100); } } assert.ok(ready);
    const get = (query = '', role = 'SUPER_ADMIN', id = 1) => fetch(`${base}/api/crm/customers/${id}/timeline?${query}`, { headers: role ? { Authorization: `Bearer ${tokens[role]}` } : {} });
    assert.equal((await get('', null)).status, 401); assert.equal((await get('', 'CASHIER')).status, 403); assert.equal((await get('', 'B2C_CUSTOMER')).status, 403);
    assert.equal((await get('', 'SUPER_ADMIN', 999)).status, 404);
    const response = await get('kind=RETURN_CREATED'); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
    const returns = await response.json(); assert.equal(returns.pagination.total, 1); assert.equal(returns.data[0].returnNumber, 'IAD-1'); assert.equal(returns.data[0].returnStatus, 'REFUNDED'); assert.equal(returns.data[0].actor, 'Personel');
    assert.ok(!JSON.stringify(returns).includes('GİZLİ')); assert.ok(!JSON.stringify(returns).includes('OTHER-SECRET')); assert.ok(!JSON.stringify(returns).includes('GUEST-SECRET'));
    assert.equal((await (await get('kind=RETURN_CREATED&channel=POS')).json()).pagination.total, 0);
    assert.equal((await (await get('kind=RETURN_CREATED&channel=ONLINE_B2C&actor=Personel&from=2025-01-01&to=2025-01-01')).json()).pagination.total, 1);
    assert.equal((await (await get('kind=RETURN_CREATED&actor=%25')).json()).pagination.total, 0);
    const points = await (await get('kind=LOYALTY_TRANSACTION')).json(); assert.equal(points.pagination.total, 24); assert.equal(points.data.length, 20);
    const page2 = await (await get('kind=LOYALTY_TRANSACTION&page=2')).json(); assert.equal(page2.data.length, 4);
    const conflicting = page2.data.find(x => x.eventId === 3); assert.equal(conflicting.orderNumber, null); assert.equal(conflicting.channel, null); assert.equal(conflicting.points, 5);
    const spend = page2.data.find(x => x.eventId === 1); assert.equal(spend.orderNumber, 'A-1'); assert.equal(spend.channel, 'ONLINE_B2C'); assert.equal(spend.points, -40); assert.equal(spend.loyaltyType, 'SPEND'); assert.equal(spend.actor, null);
    assert.ok(!JSON.stringify(points).includes('GİZLİ')); assert.ok(!JSON.stringify(page2).includes('OTHER-SECRET'));
    const oneDay = await (await get('kind=LOYALTY_TRANSACTION&from=2025-01-01&to=2025-01-01')).json(); assert.equal(oneDay.pagination.total, 1); assert.equal(oneDay.data[0].eventId, 1);
    const nextDay = await (await get('kind=LOYALTY_TRANSACTION&from=2025-01-02&to=2025-01-02')).json(); assert.equal(nextDay.pagination.total, 2);
    assert.equal((await (await get('kind=LOYALTY_TRANSACTION&channel=ONLINE_B2C')).json()).pagination.total, 1);
    assert.equal((await (await get('kind=LOYALTY_TRANSACTION&actor=Personel')).json()).pagination.total, 0);
    assert.equal((await get('kind=LOYALTY_TRANSACTION&to=2025-02-30')).status, 422);
    const change = await fetch(base+'/api/role-matrix', { method: 'POST', headers: { Authorization: `Bearer ${tokens.SUPER_ADMIN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ matrix: { STORE_MANAGER: { crm: false } } }) }); assert.equal(change.status, 200);
    assert.equal((await get('kind=LOYALTY_TRANSACTION', 'STORE_MANAGER')).status, 403);
  } finally {
    if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
