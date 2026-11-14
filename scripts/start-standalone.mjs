/**
 * Üretim başlatıcı: `.next/standalone/server.js`'i doğru ortamla ayağa kaldırır.
 *
 * Neden gerekli: Next.js standalone çalışma dizinini `.next/standalone`'a çevirir;
 * göreli SQLite varsayılanı standalone klasörünü işaret eder. Bu betik DATABASE_URL
 * tanımlı değilse kök-göreli MUTLAK varsayılan atar.
 *
 * Ortam kuralları:
 * - HOSTNAME ASLA miras alınmaz; her zaman `0.0.0.0`. (Panel/shell HOSTNAME değişkeni
 *   sunucu adını taşır ve sunucu o adrese bağlanamayabilir; curl 127.0.0.1 reddedilir.)
 * - PORT: tanımlıysa korunur; boşsa `3000`.
 *
 * Süreç modeli: `server.js` AYNI süreçte `import()` ile yüklenir; child process
 * spawn EDİLMEZ. CloudLinux/Passenger uygulamayı öldürdüğünde port yetim bir
 * süreçte kalmaz (eski spawn modeli `EADDRINUSE 0.0.0.0:3000` sonsuz döngüsünün
 * sebebiydi).
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `sqlite:${path.join(root, "data", "tuhafiye.db")}`;
}
process.env.PORT = process.env.PORT || "3000";
process.env.HOSTNAME = "0.0.0.0";
process.env.NODE_ENV = process.env.NODE_ENV || "production";

const serverJs = path.join(root, ".next", "standalone", "server.js");
await import(pathToFileURL(serverJs).href);
