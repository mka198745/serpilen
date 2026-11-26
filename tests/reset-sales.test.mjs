import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const script = path.resolve("scripts/reset-sales.mjs");
const confirmation = "SATISLARI-VE-KAPALI-Z-RAPORLARINI-SIL";

function fixture(openShift = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "serpilen-reset-test-"));
  const dbPath = path.join(dir, "test.db");
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE orders (id INTEGER PRIMARY KEY, status TEXT, order_number TEXT, pos_shift_id INTEGER);
    CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id));
    CREATE TABLE order_status_history (order_id INTEGER REFERENCES orders(id));
    CREATE TABLE order_returns (id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id));
    CREATE TABLE order_return_items (return_id INTEGER REFERENCES order_returns(id), order_item_id INTEGER REFERENCES order_items(id));
    CREATE TABLE loyalty_transactions (order_id INTEGER REFERENCES orders(id), points INTEGER);
    CREATE TABLE pos_shifts (id INTEGER PRIMARY KEY, status TEXT);
    CREATE TABLE pos_cash_transactions (shift_id INTEGER REFERENCES pos_shifts(id));
    CREATE TABLE inventory (id INTEGER PRIMARY KEY, physical_qty INTEGER, reserved_qty INTEGER);
    CREATE TABLE inventory_ledger (id INTEGER PRIMARY KEY, note TEXT);
    CREATE TABLE customers (id INTEGER PRIMARY KEY, loyalty_points INTEGER);
    CREATE TABLE products (id INTEGER PRIMARY KEY);
    CREATE TABLE order_number_reservations (order_number TEXT);
    INSERT INTO pos_shifts VALUES (1, '${openShift ? "OPEN" : "CLOSED"}');
    INSERT INTO pos_cash_transactions VALUES (1);
    INSERT INTO orders VALUES (1, 'PAID', 'SİP20260001', 1);
    INSERT INTO order_items VALUES (1, 1);
    INSERT INTO order_status_history VALUES (1);
    INSERT INTO order_returns VALUES (1, 1);
    INSERT INTO order_return_items VALUES (1, 1);
    INSERT INTO loyalty_transactions VALUES (1, 10);
    INSERT INTO inventory VALUES (1, 17, 2);
    INSERT INTO inventory_ledger VALUES (1, 'Satış defteri');
    INSERT INTO customers VALUES (1, 10);
    INSERT INTO products VALUES (1);
    INSERT INTO order_number_reservations VALUES ('SİP20260001');
  `);
  db.close();
  return { dir, dbPath };
}

function run(dbPath, ...args) {
  return spawnSync(process.execPath, [script, "--db", dbPath, ...args], { encoding: "utf8", timeout: 15000 });
}

test("İnceleme ve eksik onay verileri değiştirmez", () => {
  const { dir, dbPath } = fixture();
  try {
    assert.equal(run(dbPath, "--inspect").status, 0);
    assert.notEqual(run(dbPath, "--apply").status, 0);
    const db = new Database(dbPath, { readonly: true });
    assert.equal(db.prepare("SELECT count(*) AS c FROM orders").get().c, 1);
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Açık vardiya varsa silmeden durur", () => {
  const { dir, dbPath } = fixture(true);
  try {
    const result = run(dbPath, "--apply", "--confirm", confirmation);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Açık veya durumu bilinmeyen vardiya/);
    const db = new Database(dbPath, { readonly: true });
    assert.equal(db.prepare("SELECT count(*) AS c FROM orders").get().c, 1);
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Yedek alır, satış ve kapalı vardiyayı siler; stok, puan ve rezervasyonu korur", () => {
  const { dir, dbPath } = fixture();
  const backupDir = path.join(dir, "backups");
  try {
    const result = run(dbPath, "--apply", "--confirm", confirmation, "--backup-dir", backupDir);
    assert.equal(result.status, 0, result.stderr);
    const backupFiles = fs.readdirSync(backupDir).filter((x) => x.endsWith(".db"));
    assert.equal(backupFiles.length, 1);
    const backup = new Database(path.join(backupDir, backupFiles[0]), { readonly: true });
    assert.equal(backup.pragma("integrity_check", { simple: true }), "ok");
    assert.equal(backup.prepare("SELECT count(*) AS c FROM orders").get().c, 1);
    backup.close();
    const db = new Database(dbPath, { readonly: true });
    for (const table of ["orders", "order_items", "order_status_history", "order_returns", "order_return_items", "pos_shifts", "pos_cash_transactions"]) {
      assert.equal(db.prepare(`SELECT count(*) AS c FROM ${table}`).get().c, 0, table);
    }
    assert.deepEqual(db.prepare("SELECT physical_qty, reserved_qty FROM inventory").get(), { physical_qty: 17, reserved_qty: 2 });
    assert.deepEqual(db.prepare("SELECT order_id, points FROM loyalty_transactions").get(), { order_id: null, points: 10 });
    assert.equal(db.prepare("SELECT loyalty_points FROM customers").get().loyalty_points, 10);
    assert.equal(db.prepare("SELECT count(*) AS c FROM inventory_ledger").get().c, 1);
    assert.equal(db.prepare("SELECT count(*) AS c FROM order_number_reservations").get().c, 1);
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
