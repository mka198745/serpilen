/**
 * Kalıcı veri dizinleri.
 *
 * Next.js standalone sunucusu çalışma dizinini `.next/standalone` klasörüne
 * çevirir (`process.chdir(__dirname)`); bu yüzden `process.cwd()/data` tabanlı
 * yollar canlıda build çıktısının İÇİNE yazılır ve her `next build`te SİLİNİR.
 * Bu yüzden yüklemeler ve yedekler canlı veritabanının YANINDA tutulur
 * (`<sqlite'un bulunduğu klasör>/uploads|backups`); DATABASE_URL=:memory:
 * ise cwd altında `data/` kullanılır.
 */
import path from "node:path";
import { sqlitePath } from "@/db";

export function dataDir(): string {
  return sqlitePath === ":memory:" ? path.join(process.cwd(), "data") : path.dirname(sqlitePath);
}

export function uploadsProductsDir(): string {
  return path.join(dataDir(), "uploads", "products");
}
