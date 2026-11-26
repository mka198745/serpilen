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

test('Yinelenen müşteri adayları indeksli, yetkili, sayfalı ve salt incelemedir', { timeout: 30000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-duplicates-'));
  const dbPath = path.join(dir, 'test.db');
  const env = { ...process.env, DATABASE_URL: `sqlite:${dbPath}` };
  let server;
  try {
    const migrate = () => spawnSync(process.execPath, ['scripts/db-apply.mjs'], { env, encoding: 'utf8', timeout: 15000 });
    assert.equal(migrate().status, 0);
    let db = new Database(dbPath);
    const add = db.prepare('INSERT INTO customers (id,name,phone,email) VALUES (?,?,?,?)');
    add.run(1, 'Kaynak', '+90 (555) 123-45-67', ' Shared@Example.test ');
    add.run(2, 'İkisi', '90555 1234567', 'shared@example.test');
    add.run(3, 'E-posta', '5559876543', 'SHARED@EXAMPLE.TEST');
    add.run(4, 'Telefon', '90-555-123-45-67', 'other@example.test');
    add.run(5, 'Ülke kodsuz', '05551234567', 'different@example.test');
    add.run(6, 'Geçersiz', '---', '  ');
    add.run(7, 'Başka boş', '  ', null);
    add.run(8, 'Yanlış biçimli', '90555x1234567', 'wrong@example.test');
    for (let i = 10; i <= 30; i++) add.run(i, `Aday ${i}`, `555444${String(i).padStart(4, '0')}`, 'shared@example.test');
    const user = db.prepare('INSERT INTO users (email,password_hash,name,role) VALUES (?,?,?,?)');
    const tokens = {};
    for (const role of ['SUPER_ADMIN', 'STORE_MANAGER', 'CASHIER', 'B2C_CUSTOMER']) {
      const id = user.run(`${role}@example.test`, 'hash', role, role).lastInsertRowid;
      const token = crypto.randomBytes(32).toString('hex'); tokens[role] = token;
      db.prepare('INSERT INTO admin_sessions (user_id,jti,expires_at) VALUES (?,?,?)').run(id, crypto.createHash('sha256').update(token).digest('hex'), Math.floor(Date.now()/1000)+3600);
    }
    db.exec('DROP INDEX customers_crm_normalized_email_idx; DROP INDEX customers_crm_normalized_phone_idx; DELETE FROM __migrations WHERE tag=\'0017_crm_duplicate_candidate_indexes\'');
    db.close();
    const migration = migrate(); assert.equal(migration.status, 0, migration.stderr);
    const repeat = migrate(); assert.equal(repeat.status, 0, repeat.stderr); assert.match(repeat.stdout, /atlandı \(uygulanmış\): 0017_crm_duplicate_candidate_indexes/);
    db = new Database(dbPath);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customers').get().n, 29);
    assert.match(db.prepare('EXPLAIN QUERY PLAN SELECT id FROM customers WHERE lower(trim(email))=?').all('shared@example.test').map(x => x.detail).join(' '), /customers_crm_normalized_email_idx/);
    assert.match(db.prepare("EXPLAIN QUERY PLAN SELECT id FROM customers WHERE replace(replace(replace(replace(replace(replace(phone,' ',''),'-',''),'(',''),')',''),'.',''),'+','')=?").all('905551234567').map(x => x.detail).join(' '), /customers_crm_normalized_phone_idx/);
    db.close();
    const port = await freePort();
    server = spawn(process.execPath, ['scripts/start-standalone.mjs'], { env: { ...env, PORT: String(port), NODE_ENV: 'production' }, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 100; i++) { try { await fetch(base + '/api/crm/customers'); ready = true; break; } catch { if (server.exitCode !== null) throw Error('Sunucu kapandı'); await delay(100); } }
    assert.ok(ready);
    const get = (suffix = '', role = 'SUPER_ADMIN', id = '1') => fetch(`${base}/api/crm/customers/${id}/duplicate-candidates${suffix}`, { headers: role ? { Authorization: `Bearer ${tokens[role]}` } : {} });
    assert.equal((await get('', null)).status, 401);
    assert.equal((await get('', 'CASHIER')).status, 403);
    assert.equal((await get('', 'B2C_CUSTOMER')).status, 403);
    assert.equal((await get('', 'SUPER_ADMIN', 'abc')).status, 422);
    assert.equal((await get('?page=0')).status, 422);
    assert.equal((await get('?page=1%20OR%201=1')).status, 422);
    assert.equal((await get('', 'SUPER_ADMIN', '999')).status, 404);
    const response = await get(); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
    const first = await response.json();
    assert.deepEqual(first.criteria, { email: true, phone: true });
    assert.equal(first.data.length, 20); assert.equal(first.pagination.hasMore, true);
    assert.deepEqual(first.data.slice(0,3).map(x => [x.id,x.emailMatch,x.phoneMatch]), [[2,1,1],[3,1,0],[4,0,1]]);
    assert.ok(!first.data.some(x => [1,5,6,7,8].includes(x.id)));
    const second = await (await get('?page=2')).json();
    assert.deepEqual(second.data.map(x => x.id), [27,28,29,30]); assert.equal(second.pagination.hasMore, false);
    const invalid = await (await get('', 'SUPER_ADMIN', '6')).json();
    assert.deepEqual(invalid.criteria, { email: false, phone: false }); assert.deepEqual(invalid.data, []);
    const check = new Database(dbPath);
    assert.equal(check.prepare('SELECT COUNT(*) AS n FROM customers').get().n, 29);
    const logs = check.prepare("SELECT details FROM audit_logs WHERE action='CRM_DUPLICATE_CANDIDATES' AND entity_id='1'").all();
    assert.equal(logs.length, 2); assert.ok(!JSON.stringify(logs).includes('example.test')); assert.ok(!JSON.stringify(logs).includes('555'));
    check.exec("CREATE TRIGGER fail_duplicate_audit BEFORE INSERT ON audit_logs WHEN NEW.action='CRM_DUPLICATE_CANDIDATES' BEGIN SELECT RAISE(ABORT,'audit failure'); END");
    check.close();
    assert.equal((await get()).status, 500);
    const verify = new Database(dbPath); assert.equal(verify.prepare('SELECT COUNT(*) AS n FROM customers').get().n, 29); verify.exec('DROP TRIGGER fail_duplicate_audit'); verify.close();
    const roleChange = await fetch(`${base}/api/role-matrix`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.SUPER_ADMIN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ matrix: { STORE_MANAGER: { crm: true, crmWrite: false } } }) });
    assert.equal(roleChange.status, 200);
    assert.equal((await get('', 'STORE_MANAGER')).status, 403);
  } finally {
    if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
