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
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

test("Yorum ve soru moderasyonu, mağaza görünürlüğü ve rol yetkileri", { timeout: 30000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "serpilen-feedback-"));
  const dbPath = path.join(dir, "feedback.db");
  let server;
  try {
    const migration = spawnSync(process.execPath, ["scripts/db-apply.mjs"], {
      env: { ...process.env, DATABASE_URL: `sqlite:${dbPath}` }, encoding: "utf8", timeout: 15000,
    });
    assert.equal(migration.status, 0, migration.stderr);
    const db = new Database(dbPath);
    db.exec("INSERT INTO categories (id,name,slug) VALUES (1,'Test kategori','test-kategori'); INSERT INTO products (id,name,slug,sku,category_id) VALUES (1,'Test Ürün','test-urun','TEST-URUN',1)");
    const tokens = {};
    const userStmt = db.prepare("INSERT INTO users (email,password_hash,name,role) VALUES (?,?,?,?)");
    const sessionStmt = db.prepare("INSERT INTO admin_sessions (user_id,jti,expires_at) VALUES (?,?,?)");
    for (const role of ["SUPER_ADMIN", "STORE_MANAGER", "CASHIER", "B2C_CUSTOMER"]) {
      const { lastInsertRowid } = userStmt.run(`${role.toLowerCase()}@example.test`, "test-hash", role, role);
      const token = crypto.randomBytes(32).toString("hex");
      sessionStmt.run(lastInsertRowid, crypto.createHash("sha256").update(token).digest("hex"), Math.floor(Date.now()/1000)+3600);
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
      try { await fetch(`${base}/api/reviews?productId=1`); ready = true; break; } catch { await delay(100); }
    }
    assert.ok(ready, "Test sunucusu başlatılamadı");
    const request = (route, { role, method = "GET", body } = {}) => fetch(`${base}${route}`, {
      method, headers: { ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const post = (route, body, role) => request(route, { method: "POST", body, role });

    for (const endpoint of ["reviews", "questions"]) {
      assert.equal((await request(`/api/${endpoint}?all=1`)).status, 401);
      for (const role of ["STORE_MANAGER", "CASHIER", "B2C_CUSTOMER"]) assert.equal((await request(`/api/${endpoint}?all=1`, { role })).status, 403);
      assert.equal((await request(`/api/${endpoint}?id=1`, { method: "DELETE" })).status, 401);
      assert.equal((await request(`/api/${endpoint}?id=1`, { method: "DELETE", role: "CASHIER" })).status, 403);
    }
    for (const [endpoint, action, body] of [["reviews", "MODERATE", { status: "APPROVE" }], ["questions", "APPROVE", {}], ["questions", "ANSWER", { answer: "yetkisiz" }], ["questions", "HIDE", {}]]) {
      assert.equal((await post(`/api/${endpoint}`, { id: 1, action, ...body })).status, 401);
      assert.equal((await post(`/api/${endpoint}`, { id: 1, action, ...body }, "CASHIER")).status, 403);
    }

    const reviewResponse = await post("/api/reviews", { productId: 1, customerName: "Deniz", customerEmail: "deniz@example.test", rating: 5, comment: "Güzel ürün" });
    assert.equal(reviewResponse.status, 200);
    const reviewId = (await reviewResponse.json()).data.id;
    const questionResponse = await post("/api/questions", { productId: 1, askerName: "Deniz", question: "Hangi ölçü?" });
    assert.equal(questionResponse.status, 200);
    const questionId = (await questionResponse.json()).data.id;
    assert.equal((await post("/api/reviews", { productId: 1, customerName: " ", comment: "Test", rating: 5 })).status, 422);
    assert.equal((await post("/api/questions", { productId: 999, askerName: "Test", question: "Soru?" })).status, 404);
    let publicReviews = await (await request("/api/reviews?productId=1")).json();
    assert.equal(publicReviews.stats.count, 0);
    assert.equal(publicReviews.data.length, 0);
    assert.equal((await (await request("/api/questions?productId=1")).json()).data.length, 0);

    let adminReviews = await (await request("/api/reviews?all=1", { role: "SUPER_ADMIN" })).json();
    assert.equal(adminReviews.data[0].status, "PENDING");
    assert.equal(adminReviews.data[0].product.name, "Test Ürün");
    assert.equal(adminReviews.data[0].customerEmail, "deniz@example.test");
    let adminQuestions = await (await request("/api/questions?all=1", { role: "SUPER_ADMIN" })).json();
    assert.equal(adminQuestions.data[0].status, "OPEN");
    assert.equal(adminQuestions.data[0].product.slug, "test-urun");

    assert.equal((await post("/api/reviews", { action: "MODERATE", id: reviewId, status: "APPROVE" }, "SUPER_ADMIN")).status, 200);
    publicReviews = await (await request("/api/reviews?productId=1")).json();
    assert.equal(publicReviews.stats.count, 1);
    assert.equal(publicReviews.stats.avg, 5);
    assert.equal(publicReviews.data[0].customerEmail, undefined);
    assert.equal((await post("/api/questions", { action: "APPROVE", id: questionId }, "SUPER_ADMIN")).status, 200);
    assert.equal((await (await request("/api/questions?productId=1")).json()).data.length, 1);
    assert.equal((await post("/api/questions", { action: "HIDE", id: questionId }, "SUPER_ADMIN")).status, 200);
    assert.equal((await (await request("/api/questions?productId=1")).json()).data.length, 0);
    assert.equal((await post("/api/questions", { action: "ANSWER", id: questionId, answer: " " }, "SUPER_ADMIN")).status, 422);
    assert.equal((await post("/api/questions", { action: "ANSWER", id: questionId, answer: "30 cm" }, "SUPER_ADMIN")).status, 200);
    assert.equal((await (await request("/api/questions?productId=1")).json()).data[0].answer, "30 cm");

    const matrixResponse = await post("/api/role-matrix", { matrix: { STORE_MANAGER: { productFeedback: true } } }, "SUPER_ADMIN");
    assert.equal(matrixResponse.status, 200);
    assert.equal((await request("/api/reviews?all=1", { role: "STORE_MANAGER" })).status, 200);
    assert.equal((await post("/api/reviews", { action: "MODERATE", id: reviewId, status: "REJECT" }, "STORE_MANAGER")).status, 200);
    assert.equal((await (await request("/api/reviews?productId=1")).json()).data.length, 0);
    assert.equal((await request(`/api/reviews?id=${reviewId}`, { method: "DELETE", role: "STORE_MANAGER" })).status, 200);
    assert.equal((await request(`/api/questions?id=${questionId}`, { method: "DELETE", role: "SUPER_ADMIN" })).status, 200);
    assert.equal((await request(`/api/questions?id=${questionId}`, { method: "DELETE", role: "SUPER_ADMIN" })).status, 404);
    adminReviews = await (await request("/api/reviews?all=1", { role: "SUPER_ADMIN" })).json();
    adminQuestions = await (await request("/api/questions?all=1", { role: "SUPER_ADMIN" })).json();
    assert.equal(adminReviews.data.length, 0);
    assert.equal(adminQuestions.data.length, 0);

    // Denetim kaydı yazılamazsa moderasyon ve silme de geri alınır.
    const review2 = await (await post("/api/reviews", { productId: 1, customerName: "Test", rating: 4, comment: "İkinci yorum" })).json();
    const question2 = await (await post("/api/questions", { productId: 1, askerName: "Test", question: "İkinci soru?" })).json();
    const inspectDb = new Database(dbPath);
    const auditActions = inspectDb.prepare("SELECT action FROM audit_logs").all().map(row => row.action);
    for (const action of ["REVIEW_MODERATED", "REVIEW_DELETED", "QUESTION_APPROVE", "QUESTION_HIDE", "QUESTION_ANSWER", "QUESTION_DELETED"]) assert.ok(auditActions.includes(action), action);
    inspectDb.exec("DROP TABLE audit_logs");
    inspectDb.close();
    assert.equal((await post("/api/reviews", { action: "MODERATE", id: review2.data.id, status: "APPROVE" }, "SUPER_ADMIN")).status, 500);
    assert.equal((await request(`/api/questions?id=${question2.data.id}`, { method: "DELETE", role: "SUPER_ADMIN" })).status, 500);
    const verifyDb = new Database(dbPath, { readonly: true });
    assert.equal(verifyDb.prepare("SELECT status FROM product_reviews WHERE id = ?").get(review2.data.id).status, "PENDING");
    assert.equal(verifyDb.prepare("SELECT status FROM product_questions WHERE id = ?").get(question2.data.id).status, "OPEN");
    verifyDb.close();
  } finally {
    if (server && server.exitCode === null) { server.kill("SIGTERM"); await new Promise(resolve => server.once("exit", resolve)); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
