// Docker entrypoint: SQLite veritabanını hazırla -> migrate -> seed -> Next.js'i başlat.
// (better-sqlite3 ile dosya tabanlıdır; ayrı bir veritabanı sunucusu gerekmez.)
import { spawn } from "node:child_process";

const DATABASE_URL = process.env.DATABASE_URL || "sqlite:./data/tuhafiye.db";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", env: process.env });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} çıkış kodu: ${code}`))));
  });
}

console.log(`[entrypoint] Veritabanı hazırlanıyor (${DATABASE_URL})...`);
console.log("[entrypoint] Migration uygulanıyor...");
await run("node", ["scripts/db-apply.mjs"]);
console.log("[entrypoint] Seed kontrol ediliyor...");
await run("npx", ["tsx", "scripts/seed.ts"]);
console.log("[entrypoint] Uygulama başlatılıyor (standalone)...");
await run("npm", ["start"]);
