import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

test("CRM müşteri oluşturma ve etiket API'si: yetki, doğrulama ve bütünlük", { timeout: 30000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "serpilen-crm-tags-"));
  const dbPath = path.join(dir, "test.db");
  let server;
  try {
    const env = { ...process.env, DATABASE_URL: `sqlite:${dbPath}` };
    const migration = spawnSync(process.execPath, ["scripts/db-apply.mjs"], { env, encoding: "utf8", timeout: 15000 });
    assert.equal(migration.status, 0, migration.stderr);
    const repeat = spawnSync(process.execPath, ["scripts/db-apply.mjs"], { env, encoding: "utf8", timeout: 15000 });
    assert.equal(repeat.status, 0, repeat.stderr);
    assert.match(repeat.stdout, /atlandı \(uygulanmış\): 0014_crm_tags/);
    const db = new Database(dbPath);
    db.pragma("foreign_keys = ON");
    db.prepare("INSERT INTO customers (id,name,phone,email) VALUES (1,?,?,?)").run("Mevcut", "+90 (555) 123-45-67", "existing@example.test");
    const tokens = {};
    for (const role of ["SUPER_ADMIN", "STORE_MANAGER", "CASHIER", "B2C_CUSTOMER"]) {
      const user = db.prepare("INSERT INTO users (email,password_hash,name,role) VALUES (?,?,?,?)").run(`${role}@example.test`, "hash", role, role);
      const token = crypto.randomBytes(32).toString("hex");
      db.prepare("INSERT INTO admin_sessions (user_id,jti,expires_at) VALUES (?,?,?)").run(user.lastInsertRowid, crypto.createHash("sha256").update(token).digest("hex"), Math.floor(Date.now() / 1000) + 3600);
      tokens[role] = token;
    }
    db.close();
    const port = await freePort();
    server = spawn(process.execPath, ["scripts/start-standalone.mjs"], { env: { ...env, PORT: String(port), NODE_ENV: "production" }, stdio: "ignore" });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error(`Test sunucusu kapandı: ${server.exitCode}`);
      try { await fetch(`${base}/api/crm/customers`); ready = true; break; } catch { await delay(100); }
    }
    assert.ok(ready);
    const request = (url, role, method = "GET", body, extraHeaders = {}) => fetch(`${base}${url}`, {
      method, headers: { ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...extraHeaders },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const customer = { name: "Yeni Müşteri", phone: "555 999 1122", email: " NEW@example.test ", city: "Adana", address: "", companyName: "" };
    for (const role of [undefined, "CASHIER", "B2C_CUSTOMER"]) {
      assert.equal((await request("/api/crm/customers", role, "POST", customer)).status, role ? 403 : 401);
      assert.equal((await request("/api/crm/tags", role)).status, role ? 403 : 401);
      assert.equal((await request("/api/crm/customers/1/tags", role, "POST", { action: "ADD", name: "Test" })).status, role ? 403 : 401);
    }
    assert.equal((await request("/api/crm/customers", "SUPER_ADMIN", "POST", customer, { Origin: "https://invalid.example" })).status, 403);
    assert.equal((await fetch(`${base}/api/crm/customers`, { method: "POST", headers: { Authorization: `Bearer ${tokens.SUPER_ADMIN}`, "Content-Type": "text/plain" }, body: "{}" })).status, 415);
    assert.equal((await fetch(`${base}/api/crm/customers`, { method: "POST", headers: { Authorization: `Bearer ${tokens.SUPER_ADMIN}`, "Content-Type": "application/json" }, body: "{" })).status, 400);
    const oversizedBody = () => new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(' '.repeat(17000))); controller.close(); } });
    const oversized = await fetch(`${base}/api/crm/customers`, { method: "POST", headers: { Authorization: `Bearer ${tokens.SUPER_ADMIN}`, "Content-Type": "application/json" }, body: oversizedBody(), duplex: "half" });
    assert.equal(oversized.status, 413);
    assert.equal((await request("/api/crm/customers", "SUPER_ADMIN", "POST", { ...customer, email: "a@b" })).status, 422);
    assert.equal((await request("/api/crm/customers", "SUPER_ADMIN", "POST", { ...customer, phone: "12" })).status, 422);
    assert.equal((await request("/api/crm/customers", "SUPER_ADMIN", "POST", { ...customer, phone: "555\n9991122" })).status, 422);
    assert.equal((await request("/api/crm/customers", "SUPER_ADMIN", "POST", { ...customer, phone: "555+9991122" })).status, 422);
    assert.equal((await request("/api/crm/customers", "SUPER_ADMIN", "POST", { ...customer, loyaltyPoints: 1 })).status, 422);
    assert.equal((await request("/api/crm/customers", "SUPER_ADMIN", "POST", { ...customer, email: "EXISTING@example.test" })).status, 409);
    assert.equal((await request("/api/crm/customers", "SUPER_ADMIN", "POST", { ...customer, phone: "905551234567" })).status, 409);
    const created = await request("/api/crm/customers", "SUPER_ADMIN", "POST", customer);
    assert.equal(created.status, 201);
    const id = (await created.json()).data.id;
    const detail = await (await request(`/api/crm/customers/${id}`, "SUPER_ADMIN")).json();
    assert.equal(detail.data.customer.email, "new@example.test");
    assert.deepEqual(detail.data.tags, []);
    assert.equal((await request("/api/crm/customers", "SUPER_ADMIN", "POST", customer)).status, 409);
    const check = new Database(dbPath);
    assert.equal(check.prepare("SELECT COUNT(*) AS n FROM users WHERE customer_id=?").get(id).n, 0);
    check.exec("CREATE TRIGGER fail_crm_create BEFORE INSERT ON audit_logs WHEN NEW.action='CRM_CUSTOMER_CREATED' BEGIN SELECT RAISE(ABORT,'audit failure'); END");
    check.close();
    assert.equal((await request("/api/crm/customers", "SUPER_ADMIN", "POST", { ...customer, phone: "5557771122", email: "rollback@example.test" })).status, 500);
    const checkRollback = new Database(dbPath);
    assert.equal(checkRollback.prepare("SELECT COUNT(*) AS n FROM customers WHERE email='rollback@example.test'").get().n, 0);
    checkRollback.exec("DROP TRIGGER fail_crm_create");
    checkRollback.close();
    const simultaneous = { ...customer, phone: "5558881122", email: "concurrent@example.test" };
    const simultaneousResults = await Promise.all([request("/api/crm/customers", "SUPER_ADMIN", "POST", simultaneous), request("/api/crm/customers", "SUPER_ADMIN", "POST", simultaneous)]);
    assert.deepEqual(simultaneousResults.map(response => response.status).sort(), [201, 409]);
    const endpoint = `/api/crm/customers/${id}/tags`;
    assert.equal((await fetch(`${base}${endpoint}`, { method: "POST", headers: { Authorization: `Bearer ${tokens.SUPER_ADMIN}`, "Content-Type": "application/json" }, body: oversizedBody(), duplex: "half" })).status, 413);
    assert.equal((await request(endpoint, "SUPER_ADMIN", "POST", { action: "ADD", name: " " })).status, 422);
    assert.equal((await request(endpoint, "SUPER_ADMIN", "POST", { action: "ADD", name: "x".repeat(41) })).status, 422);
    assert.equal((await request(endpoint, "SUPER_ADMIN", "POST", { action: "ADD", name: "Test" }, { Origin: "https://invalid.example" })).status, 403);
    assert.equal((await request("/api/crm/customers/999/tags", "SUPER_ADMIN", "POST", { action: "ADD", name: "Test" })).status, 404);
    const addGuard = new Database(dbPath);
    addGuard.exec("CREATE TRIGGER fail_tag_add BEFORE INSERT ON audit_logs WHEN NEW.action='CRM_TAG_ADDED' BEGIN SELECT RAISE(ABORT,'audit failure'); END");
    addGuard.close();
    assert.equal((await request(endpoint, "SUPER_ADMIN", "POST", { action: "ADD", name: "GeriAlınmalı" })).status, 500);
    const addVerify = new Database(dbPath);
    assert.equal(addVerify.prepare("SELECT COUNT(*) AS n FROM crm_tags WHERE name='GeriAlınmalı'").get().n, 0);
    assert.equal(addVerify.prepare("SELECT COUNT(*) AS n FROM crm_customer_tags").get().n, 0);
    addVerify.exec("DROP TRIGGER fail_tag_add");
    addVerify.close();
    const tagAdd = await request(endpoint, "STORE_MANAGER", "POST", { action: "ADD", name: "  İlgili  " });
    assert.equal(tagAdd.status, 200);
    const tags = (await tagAdd.json()).data;
    assert.equal(tags.length, 1);
    const tagId = tags[0].id;
    assert.equal(tags[0].name, "İlgili");
    assert.equal((await (await request(endpoint, "SUPER_ADMIN", "POST", { action: "ADD", name: "ilgili" })).json()).data.length, 1);
    assert.equal((await request(`/api/crm/customers?tag=${tagId}`, "SUPER_ADMIN")).status, 200);
    const filtered = await (await request(`/api/crm/customers?tag=${tagId}`, "SUPER_ADMIN")).json();
    assert.equal(filtered.pagination.total, 1);
    assert.equal(filtered.data[0].id, id);
    assert.equal((await request("/api/crm/customers?tag=abc", "SUPER_ADMIN")).status, 422);
    const allTags = await (await request("/api/crm/tags", "SUPER_ADMIN")).json();
    assert.equal(allTags.data.length, 1);
    assert.equal(allTags.data[0].customerCount, 1);
    assert.deepEqual((await (await request(`/api/crm/customers/${id}`, "SUPER_ADMIN")).json()).data.tags, tags);
    const guard = new Database(dbPath);
    guard.exec("CREATE TRIGGER fail_tag_audit BEFORE INSERT ON audit_logs WHEN NEW.action='CRM_TAG_REMOVED' BEGIN SELECT RAISE(ABORT,'audit failure'); END");
    guard.close();
    assert.equal((await request(endpoint, "SUPER_ADMIN", "POST", { action: "REMOVE", tagId })).status, 500);
    const afterFail = new Database(dbPath);
    afterFail.pragma("foreign_keys = ON");
    assert.equal(afterFail.prepare("SELECT COUNT(*) AS n FROM crm_customer_tags WHERE customer_id=?").get(id).n, 1);
    assert.throws(() => afterFail.prepare("DELETE FROM customers WHERE id=?").run(id), /FOREIGN KEY/);
    afterFail.exec("DROP TRIGGER fail_tag_audit");
    afterFail.close();
    assert.deepEqual((await (await request(endpoint, "SUPER_ADMIN", "POST", { action: "REMOVE", tagId })).json()).data, []);
    assert.equal((await (await request(`/api/crm/customers?tag=${tagId}`, "SUPER_ADMIN")).json()).pagination.total, 0);
    const limits = new Database(dbPath);
    const addTag = limits.prepare("INSERT INTO crm_tags (name,normalized_name) VALUES (?,?)");
    const assignTag = limits.prepare("INSERT INTO crm_customer_tags (customer_id,tag_id) VALUES (?,?)");
    for (let i = 0; i < 30; i++) { const tag = addTag.run(`sınır${i}`, `sınır${i}`); assignTag.run(id, tag.lastInsertRowid); }
    limits.close();
    assert.equal((await request(endpoint, "SUPER_ADMIN", "POST", { action: "ADD", name: "sınırı aşan" })).status, 422);
    assert.equal((await request(endpoint, "SUPER_ADMIN", "POST", { action: "ADD", name: "sınır0" })).status, 200);
    const limitVerify = new Database(dbPath, { readonly: true });
    assert.equal(limitVerify.prepare("SELECT COUNT(*) AS n FROM crm_customer_tags WHERE customer_id=?").get(id).n, 30);
    assert.equal(limitVerify.prepare("SELECT COUNT(*) AS n FROM crm_tags WHERE name='sınırı aşan'").get().n, 0);
    limitVerify.close();
    assert.equal((await request("/api/role-matrix", "SUPER_ADMIN", "POST", { matrix: { STORE_MANAGER: { crm: false } } })).status, 200);
    assert.equal((await request("/api/crm/customers", "STORE_MANAGER", "POST", customer)).status, 403);
    assert.equal((await request("/api/crm/tags", "STORE_MANAGER")).status, 403);
    assert.equal((await request(endpoint, "STORE_MANAGER", "POST", { action: "ADD", name: "Test" })).status, 403);
  } finally {
    if (server && server.exitCode === null) { server.kill("SIGTERM"); await new Promise(resolve => server.once("exit", resolve)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
