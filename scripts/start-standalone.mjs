/**
 * Üretim başlatıcı: `.next/standalone/server.js`'i doğru ortamla ayağa kaldırır.
 *
 * Neden gerekli: Next.js standalone sunucusu çalışma dizinini `.next/standalone`
 * klasörüne çevirir (process.chdir(__dirname)). Bu yüzden kod içindeki göreli
 * SQLite varsayılanı (`sqlite:./data/tuhafiye.db`) standalone klasörünü işaret
 * eder hale gelir. Bu betik, DATABASE_URL tanımlı değilse depo köküne göre
 * MUTLAK varsayılan atar; PORT/HOSTNAME için güvenli varsayılanları kurar.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const env = { ...process.env };
if (!env.DATABASE_URL) {
  env.DATABASE_URL = `sqlite:${path.join(root, "data", "tuhafiye.db")}`;
}
env.PORT = env.PORT || "3000";
env.HOSTNAME = env.HOSTNAME || "0.0.0.0";

const serverJs = path.join(root, ".next", "standalone", "server.js");

const child = spawn(process.execPath, [serverJs], { stdio: "inherit", env });
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
child.on("exit", (code) => process.exit(code ?? 0));
