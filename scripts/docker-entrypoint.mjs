// Docker entrypoint: MySQL'i bekle -> migrate -> seed -> Next.js'i başlat.
// (drizzle-kit migrate + tsx seed, üretim imajının içinde mevcuttur.)
import mysql from "mysql2/promise";
import { spawn } from "node:child_process";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[entrypoint] DATABASE_URL tanımlı değil!");
  process.exit(1);
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", env: process.env });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} çıkış kodu: ${code}`))));
  });
}

async function waitForDb(tries = 60) {
  for (let i = 1; i <= tries; i++) {
    try {
      const conn = await mysql.createConnection({ uri: DATABASE_URL });
      await conn.query("select 1");
      await conn.end();
      console.log("[entrypoint] MySQL hazır.");
      return;
    } catch (err) {
      console.log(`[entrypoint] MySQL bekleniyor... (${i}/${tries})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("MySQL'e bağlanılamadı (zaman aşımı).");
}

await waitForDb();
console.log("[entrypoint] Migration uygulanıyor...");
await run("npx", ["drizzle-kit", "migrate"]);
console.log("[entrypoint] Seed kontrol ediliyor...");
await run("npx", ["tsx", "scripts/seed.ts"]);
console.log("[entrypoint] Uygulama başlatılıyor...");
await run("npm", ["start", "--", "--hostname", "0.0.0.0", "--port", process.env.PORT || "3000"]);
