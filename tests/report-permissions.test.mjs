import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

test("Rapor API ve CSV, kayıtlı rol matrisine göre sunucuda korunur", { timeout: 30000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "serpilen-reports-test-"));
  const dbPath = path.join(dir, "reports.db");
  let server;
  try {
    const migration = spawnSync(process.execPath, ["scripts/db-apply.mjs"], {
      env: { ...process.env, DATABASE_URL: `sqlite:${dbPath}` }, encoding: "utf8", timeout: 15000,
    });
    assert.equal(migration.status, 0, migration.stderr);
    const db = new Database(dbPath);
    const tokens = {};
    const addUser = db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)");
    const addSession = db.prepare("INSERT INTO admin_sessions (user_id, jti, expires_at) VALUES (?, ?, ?)");
    for (const role of ["SUPER_ADMIN", "STORE_MANAGER", "CASHIER", "WAREHOUSE_KEEPER", "B2C_CUSTOMER"]) {
      const { lastInsertRowid } = addUser.run(`${role.toLowerCase()}@example.test`, "test-only-hash", role, role);
      const token = crypto.randomBytes(32).toString("hex");
      addSession.run(lastInsertRowid, crypto.createHash("sha256").update(token).digest("hex"), Math.floor(Date.now() / 1000) + 3600);
      tokens[role] = token;
    }
    db.close();

    const port = await availablePort();
    server = spawn(process.execPath, ["scripts/start-standalone.mjs"], {
      env: { ...process.env, DATABASE_URL: `sqlite:${dbPath}`, PORT: String(port), NODE_ENV: "production" }, stdio: "ignore",
    });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error(`Test sunucusu durdu: ${server.exitCode}`);
      try { await fetch(`${base}/api/reports`); ready = true; break; } catch { await delay(100); }
    }
    assert.ok(ready, "Test sunucusu başlatılamadı");
    const request = (role, route = "/api/reports") => fetch(`${base}${route}`, {
      headers: role ? { Authorization: `Bearer ${tokens[role]}` } : {},
    });
    assert.equal((await request(null)).status, 401);
    for (const role of ["CASHIER", "WAREHOUSE_KEEPER", "B2C_CUSTOMER"]) {
      assert.equal((await request(role)).status, 403, role);
      assert.equal((await request(role, "/api/reports?format=csv&export=sales")).status, 403, `${role} CSV`);
    }
    for (const role of ["SUPER_ADMIN", "STORE_MANAGER"]) {
      const response = await request(role);
      assert.equal(response.status, 200, `${role}: ${await response.text()}`);
      assert.equal((await request(role, "/api/reports?format=csv&export=sales")).status, 200, `${role} CSV`);
    }

    const update = await fetch(`${base}/api/role-matrix`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokens.SUPER_ADMIN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ matrix: { CASHIER: { reports: true }, STORE_MANAGER: { reports: false }, SUPER_ADMIN: { reports: false } } }),
    });
    assert.equal(update.status, 200);
    const matrix = (await update.json()).data.matrix;
    assert.equal(matrix.SUPER_ADMIN.reports, true);
    assert.equal((await request("CASHIER")).status, 200);
    assert.equal((await request("CASHIER", "/api/reports?format=csv&export=sales")).status, 200);
    assert.equal((await request("STORE_MANAGER")).status, 403);
    assert.equal((await request("STORE_MANAGER", "/api/reports?format=csv&export=sales")).status, 403);
    assert.equal((await request("SUPER_ADMIN")).status, 200);
  } finally {
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise(resolve => server.once("exit", resolve));
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
