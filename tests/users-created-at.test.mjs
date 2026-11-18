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

test("Yeni personelin kayıt tarihi oluşturma yanıtında ve listede aynıdır", { timeout: 30000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "serpilen-users-test-"));
  const dbPath = path.join(dir, "users.db");
  const token = crypto.randomBytes(32).toString("hex");
  let server;
  try {
    const migration = spawnSync(process.execPath, ["scripts/db-apply.mjs"], {
      env: { ...process.env, DATABASE_URL: `sqlite:${dbPath}` }, encoding: "utf8", timeout: 15000,
    });
    assert.equal(migration.status, 0, migration.stderr);
    const db = new Database(dbPath);
    db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)")
      .run("admin@example.test", "test-only-hash", "Test Admin", "SUPER_ADMIN");
    db.prepare("INSERT INTO admin_sessions (user_id, jti, expires_at) VALUES (?, ?, ?)")
      .run(1, crypto.createHash("sha256").update(token).digest("hex"), Math.floor(Date.now() / 1000) + 3600);
    db.close();

    const port = await availablePort();
    server = spawn(process.execPath, ["scripts/start-standalone.mjs"], {
      env: { ...process.env, DATABASE_URL: `sqlite:${dbPath}`, PORT: String(port), NODE_ENV: "production" },
      stdio: "ignore",
    });
    const url = `http://127.0.0.1:${port}/api/users`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error(`Test sunucusu durdu: ${server.exitCode}`);
      try {
        const response = await fetch(url);
        assert.equal(response.status, 401);
        ready = true;
        break;
      } catch (error) {
        if (error instanceof assert.AssertionError) throw error;
        await delay(100);
      }
    }
    assert.ok(ready, "Test sunucusu başlatılamadı");

    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const createdResponse = await fetch(url, {
      method: "POST", headers,
      body: JSON.stringify({ name: "Test Personel", email: "staff@example.test", role: "CASHIER", password: "Testpass123" }),
    });
    const created = await createdResponse.json();
    assert.equal(createdResponse.status, 200, JSON.stringify(created));
    assert.equal(created.success, true);
    assert.match(created.data.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.ok(Number.isFinite(Date.parse(created.data.createdAt)));
    assert.equal(created.data.passwordHash, undefined);

    const list = await (await fetch(`${url}?type=staff`, { headers })).json();
    const listed = list.data.find(user => user.id === created.data.id);
    assert.equal(listed.createdAt, created.data.createdAt);
    assert.equal(listed.roleLabel, created.data.roleLabel);

    const updateResponse = await fetch(url, {
      method: "PATCH", headers, body: JSON.stringify({ id: created.data.id, isActive: false }),
    });
    assert.equal(updateResponse.status, 200);
    const refreshed = await (await fetch(`${url}?type=staff`, { headers })).json();
    assert.equal(refreshed.data.find(user => user.id === created.data.id).createdAt, created.data.createdAt);
  } finally {
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise(resolve => server.once("exit", resolve));
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
