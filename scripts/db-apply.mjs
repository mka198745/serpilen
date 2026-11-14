/**
 * Migration uygulayıcı (drizzle-kit yerine geçtiği durumlar için).
 *
 * DATABASE_URL şemasına göre doğru migration klasörünü seçer:
 *   sqlite:...  → drizzle-sqlite/  (better-sqlite3 ile uygulanır)
 *   mysql://... → drizzle/         (mysql2 ile uygulanır)
 *
 * SQL dosyaları journal sırasıyla, `--> statement-breakpoint` ayraçlarından
 * bölünerek uygulanır. Hata durumunda DURUR ve hatalı SQL'i gösterir.
 *
 * Kullanım:
 *   node scripts/db-apply.mjs        # .env içindeki DATABASE_URL'i kullanır
 *   DATABASE_URL="sqlite:./data/tuhafiye.db" node scripts/db-apply.mjs
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const databaseUrl = process.env.DATABASE_URL || "sqlite:./data/tuhafiye.db";

function splitStatements(content) {
  return content
    .split("--> statement-breakpoint")
    .map((s) => s.trim().replace(/;\s*$/, ""))
    .filter(Boolean);
}

function readJournal(dir) {
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  return (journal.entries || []).slice().sort((a, b) => a.idx - b.idx);
}

// ---------------------------------------------------------------- SQLite
async function applySqlite() {
  const Database = (await import("better-sqlite3")).default;
  let p = databaseUrl.replace(/^sqlite:/, "").replace(/^file:/, "");
  if (p !== ":memory:" && !path.isAbsolute(p)) p = path.resolve(root, p);
  if (p !== ":memory:") fs.mkdirSync(path.dirname(p), { recursive: true });

  const dir = path.join(root, "drizzle-sqlite");
  const entries = readJournal(dir);
  if (entries.length === 0) {
    console.error("HATA: journal boş, uygulanacak migration yok.");
    process.exit(1);
  }

  const conn = new Database(p);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  let total = 0;
  try {
    conn.exec("CREATE TABLE IF NOT EXISTS `__migrations` (`tag` text PRIMARY KEY NOT NULL)");
    const applied = new Set(
      conn.prepare("SELECT `tag` FROM `__migrations`").all().map((r) => r.tag)
    );
    for (const entry of entries) {
      if (applied.has(entry.tag)) {
        console.log(`atlandı (uygulanmış): ${entry.tag}`);
        continue;
      }
      const file = path.join(dir, `${entry.tag}.sql`);
      const statements = splitStatements(fs.readFileSync(file, "utf8"));
      console.log(`uygulanıyor: ${entry.tag} (${statements.length} ifade)`);
      for (const [i, stmt] of statements.entries()) {
        try {
          conn.exec(stmt);
          total++;
        } catch (err) {
          const msg = String(err?.message || "");
          if (/already exists/i.test(msg)) {
            console.log(`geçildi (zaten mevcut): ${entry.tag} #${i}`);
            continue;
          }
          console.error(`HATA ${entry.tag} #${i}: ${err.message}`);
          console.error(stmt.slice(0, 500));
          process.exitCode = 1;
          throw err;
        }
      }
      conn.prepare("INSERT INTO `__migrations` (`tag`) VALUES (?)").run(entry.tag);
    }
    console.log(`Tamam: ${total} ifade uygulandı. (${p})`);
  } finally {
    conn.close();
  }
}

// ----------------------------------------------------------------- MySQL
async function applyMysql() {
  const mysql = (await import("mysql2/promise")).default;
  const dir = path.join(root, "drizzle");
  const entries = readJournal(dir);
  if (entries.length === 0) {
    console.error("HATA: journal boş, uygulanacak migration yok.");
    process.exit(1);
  }

  const pool = mysql.createPool({ uri: databaseUrl, connectionLimit: 2 });
  let total = 0;
  try {
    await pool.query("CREATE TABLE IF NOT EXISTS `__migrations` (`tag` varchar(255) NOT NULL PRIMARY KEY)");
    const [appliedRows] = await pool.query("SELECT `tag` FROM `__migrations`");
    const applied = new Set((appliedRows || []).map((r) => r.tag));
    const [tables] = await pool.query("SHOW TABLES");
    const existing = new Set((tables || []).map((r) => Object.values(r)[0]));
    for (const entry of entries) {
      if (applied.has(entry.tag)) {
        console.log(`atlandı (uygulanmış): ${entry.tag}`);
        continue;
      }
      const file = path.join(dir, `${entry.tag}.sql`);
      const content = fs.readFileSync(file, "utf8");
      const creates = [...content.matchAll(/CREATE TABLE\s+`([^`]+)`/gi)].map((m) => m[1]);
      if (creates.length > 0 && creates.every((t) => existing.has(t))) {
        console.log(`atlandı (tablolar mevcut): ${entry.tag}`);
        continue;
      }
      const statements = splitStatements(content);
      console.log(`uygulanıyor: ${entry.tag} (${statements.length} ifade)`);
      for (const [i, stmt] of statements.entries()) {
        try {
          await pool.query(stmt);
          total++;
        } catch (err) {
          const msg = String(err?.message || "");
          if (/already exists|duplicate/i.test(msg)) {
            console.log(`geçildi (zaten mevcut): ${entry.tag} #${i}`);
            continue;
          }
          console.error(`HATA ${entry.tag} #${i}: ${err.message}`);
          console.error(stmt.slice(0, 500));
          process.exitCode = 1;
          throw err;
        }
      }
      await pool.query("INSERT INTO `__migrations` (`tag`) VALUES (?)", [entry.tag]);
    }
    console.log(`Tamam: ${total} ifade uygulandı.`);
  } finally {
    await pool.end();
  }
}

if (/^mysql:/i.test(databaseUrl)) {
  await applyMysql();
} else {
  await applySqlite();
}
