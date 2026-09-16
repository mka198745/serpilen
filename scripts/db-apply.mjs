/**
 * Migration uygulayıcı (drizzle-kit yerine geçtiği durumlar için).
 *
 * drizzle/ altındaki SQL dosyalarını _journal.json sırasıyla okuyup
 * `--> statement-breakpoint` ayraçlarından bölerek DATABASE_URL'deki
 * veritabanına uygular. Hata durumunda DURUR ve hatalı SQL'i gösterir
 * (sessiz geçme yok).
 *
 * Kullanım:
 *   DATABASE_URL="mysql://..." node scripts/db-apply.mjs
 *   # veya .env dosyasındaki DATABASE_URL otomatik okunur
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const drizzleDir = path.join(root, "drizzle");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("HATA: DATABASE_URL bulunamadı (.env ya da ortam değişkeni).");
  process.exit(1);
}

const journalPath = path.join(drizzleDir, "meta", "_journal.json");
const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
const entries = (journal.entries || []).slice().sort((a, b) => a.idx - b.idx);
if (entries.length === 0) {
  console.error("HATA: journal boş, uygulanacak migration yok.");
  process.exit(1);
}

const pool = mysql.createPool({ uri: databaseUrl, connectionLimit: 2 });
let total = 0;
try {
  // Uygulanan migration'ları takip et (özellikle ALTER TABLE içeren
  // dosyaların ikinci çalışta hata vermemesi için).
  await pool.query("CREATE TABLE IF NOT EXISTS `__migrations` (`tag` varchar(255) NOT NULL PRIMARY KEY)");
  const [appliedRows] = await pool.query("SELECT `tag` FROM `__migrations`");
  const applied = new Set((appliedRows || []).map((r) => r.tag));
  // Köprü/gerçek MySQL fark etmez: idempotentlik için CREATE TABLE varsa geç.
  const [tables] = await pool.query("SHOW TABLES");
  const existing = new Set((tables || []).map((r) => Object.values(r)[0]));
  for (const entry of entries) {
    if (applied.has(entry.tag)) {
      console.log(`atlandı (uygulanmış): ${entry.tag}`);
      continue;
    }
    const file = path.join(drizzleDir, `${entry.tag}.sql`);
    const content = fs.readFileSync(file, "utf8");
    // CREATE TABLE `x` ifadelerini bul; tablo varsa dosyayı atla (basit idempotens).
    const creates = [...content.matchAll(/CREATE TABLE\s+`([^`]+)`/gi)].map((m) => m[1]);
    if (creates.length > 0 && creates.every((t) => existing.has(t))) {
      console.log(`atlandı (tablolar mevcut): ${entry.tag}`);
      continue;
    }
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim().replace(/;\s*$/, ""))
      .filter(Boolean);
    console.log(`uygulanıyor: ${entry.tag} (${statements.length} ifade)`);
    for (const [i, stmt] of statements.entries()) {
      try {
        await pool.query(stmt);
        total++;
      } catch (err) {
        const msg = String(err?.message || "");
        // Idempotens: tablo/sütun zaten mevcutsa geç (köprü + gerçek MySQL).
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
