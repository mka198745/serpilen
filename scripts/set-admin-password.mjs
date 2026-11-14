#!/usr/bin/env node
/**
 * Hosting kurulumunda yönetici parolasını belirlemek için tek komutluk yardımcı.
 * Bu dosya depoda tutulur ve zip paketine de dahil edilir.
 * better-sqlite3, paket içindeki .next/standalone/node_modules'dan alınır.
 *
 * Kullanım (hosting terminalinden, uygulama klasöründe):
 *   node scripts/set-admin-password.mjs "YeniSifreniz!123" admin@serpilencollection.com
 */
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "..", ".next", "standalone", "node_modules", "x.cjs"));
const Database = require("better-sqlite3");

const [password, email = "admin@serpilencollection.com"] = process.argv.slice(2);
if (!password || password.length < 8) {
  console.error('Kullanım: node scripts/set-admin-password.mjs "EnAz8KarakterSifre" [e-posta]');
  process.exit(1);
}
const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync(password, salt, 64).toString("hex");
const dbPath = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/^sqlite:/, "")
  : path.join(here, "..", "data", "tuhafiye.db");
const db = new Database(dbPath);
const r = db.prepare("UPDATE users SET password_hash = ? WHERE email = ?").run(`scrypt$${salt}$${hash}`, email);
db.close();
console.log(r.changes > 0 ? `Parola güncellendi: ${email}` : `E-posta bulunamadı: ${email}`);
process.exit(r.changes > 0 ? 0 : 1);
