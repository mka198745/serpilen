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

test('Temel segment filtreleri yetki, birleşim, tanım ve sayfalamayı korur', { timeout: 30000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-segment-'));
  const dbPath = path.join(dir, 'test.db');
  const env = { ...process.env, DATABASE_URL: `sqlite:${dbPath}` };
  let server;
  try {
    const migration = spawnSync(process.execPath, ['scripts/db-apply.mjs'], { env, encoding: 'utf8', timeout: 15000 });
    assert.equal(migration.status, 0, migration.stderr);
    const db = new Database(dbPath);
    const addCustomer = db.prepare('INSERT INTO customers (id,name,phone) VALUES (?,?,?)');
    for (let id = 1; id <= 25; id++) addCustomer.run(id, `Müşteri ${id}`, `555000${String(id).padStart(4, '0')}`);
    const addUser = db.prepare('INSERT INTO users (email,password_hash,name,role,customer_id) VALUES (?,?,?,?,?)');
    const admin = addUser.run('admin@example.test', 'hash', 'admin', 'SUPER_ADMIN', null).lastInsertRowid;
    const cashier = addUser.run('cashier@example.test', 'hash', 'cashier', 'CASHIER', null).lastInsertRowid;
    addUser.run('web@example.test', 'hash', 'web', 'B2C_CUSTOMER', 1);
    addUser.run('web2@example.test', 'hash', 'web2', 'B2C_CUSTOMER', 1); // no duplicate customer counts
    addUser.run('staff@example.test', 'hash', 'staff', 'CASHIER', 2); // not a B2C link
    const addOrder = db.prepare('INSERT INTO orders (order_number,customer_id,customer_name,grand_total,status,payment_status) VALUES (?,?,?,?,?,?)');
    addOrder.run('paid1', 1, 'Müşteri 1', '100', 'PAID', 'PAID');
    addOrder.run('paid2', 1, 'Müşteri 1', '200', 'DELIVERED', 'PAID');
    addOrder.run('paid3', 2, 'Müşteri 2', '50', 'PAID', 'PAID');
    for (const [number, status, payment] of [['cancel', 'CANCELLED', 'PAID'], ['refund', 'REFUNDED', 'PAID'], ['return', 'RETURNED', 'PAID'], ['pending', 'PAID', 'PENDING']]) addOrder.run(number, 3, 'Müşteri 3', '1000', status, payment);
    addOrder.run('guest', null, 'Müşteri 3', '1000', 'PAID', 'PAID');
    const tag = db.prepare("INSERT INTO crm_tags (name,normalized_name) VALUES ('Test','test')").run().lastInsertRowid;
    db.prepare('INSERT INTO crm_customer_tags (customer_id,tag_id) VALUES (?,?)').run(1, tag);
    db.prepare('INSERT INTO crm_customer_tags (customer_id,tag_id) VALUES (?,?)').run(2, tag);
    const tokens = {};
    for (const [role, id] of [['admin', admin], ['cashier', cashier]]) {
      const token = crypto.randomBytes(32).toString('hex'); tokens[role] = token;
      db.prepare('INSERT INTO admin_sessions (user_id,jti,expires_at) VALUES (?,?,?)').run(id, crypto.createHash('sha256').update(token).digest('hex'), Math.floor(Date.now()/1000)+3600);
    }
    db.close();
    const port = await freePort();
    server = spawn(process.execPath, ['scripts/start-standalone.mjs'], { env: { ...env, PORT: String(port), NODE_ENV: 'production' }, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + '/api/crm/customers'); break; } catch { if (server.exitCode !== null) throw Error('Sunucu kapandı'); await delay(100); } }
    const get = (query, role = 'admin') => fetch(`${base}/api/crm/customers?${query}`, { headers: role ? { Authorization: `Bearer ${tokens[role]}` } : {} });
    assert.equal((await get('purchase=repeat', null)).status, 401);
    assert.equal((await get('membership=linked', 'cashier')).status, 403);
    for (const query of ['purchase=bad', 'purchase=repeat%20OR%201%3D1', 'membership=bad']) assert.equal((await get(query)).status, 422);
    const none = await (await get('purchase=none')).json();
    assert.equal(none.pagination.total, 23); assert.equal(none.data.length, 20); assert.equal(none.metrics.customerCount, 23); assert.equal(none.metrics.paidCustomers, 0);
    const page2 = await (await get('purchase=none&page=2')).json();
    assert.deepEqual(page2.data.map(c => c.id), [5,4,3]);
    const once = await (await get('purchase=once')).json();
    assert.deepEqual(once.data.map(c => c.id), [2]); assert.equal(once.metrics.paidOrderTotal, 50);
    const repeat = await (await get(`purchase=repeat&membership=linked&tag=${tag}&q=M%C3%BC%C5%9Fteri`)).json();
    assert.deepEqual(repeat.data.map(c => c.id), [1]); assert.equal(repeat.metrics.registeredCount, 1); assert.equal(repeat.metrics.paidOrderCount, 2); assert.equal(repeat.metrics.paidOrderTotal, 300); assert.equal(repeat.metrics.averagePaidOrder, 150);
    assert.equal((await (await get('membership=unlinked')).json()).pagination.total, 24);
    assert.equal((await (await get('purchase=once&membership=linked')).json()).pagination.total, 0);
    assert.equal((await (await get(`purchase=once&tag=${tag}&q=2`)).json()).pagination.total, 1);
    assert.equal((await (await get('purchase=none&q=3')).json()).pagination.total, 3);
  } finally {
    if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
