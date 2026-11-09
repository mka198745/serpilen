import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

// SQLite (dosya) sürücüsü — uygulamayla aynı dizinde kalıcı dosya kullanır.
// DATABASE_URL biçimleri:
//   sqlite:./data/tuhafiye.db   (önerilen)
//   ./data/tuhafiye.db          (sqlite: öneki atlanabilir)
//   sqlite::memory:             (yalnız testler)
// MySQL'e geçiş yapıldığında bu dosya yerine mysql2 sürücüsü kullanılacak;
// MySQL şeması schema.mysql.ts olarak korunmaktadır.

const databaseUrl = process.env.DATABASE_URL || "sqlite:./data/tuhafiye.db";

function resolveSqlitePath(url: string): string {
  let p = url.trim();
  for (const prefix of ["sqlite:", "file:"]) {
    if (p.startsWith(prefix)) p = p.slice(prefix.length);
  }
  if (p === ":memory:") return p;
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

const globalForDb = globalThis as typeof globalThis & {
  __tuhafiyeSqlite?: Database.Database;
};

export const sqlitePath = resolveSqlitePath(databaseUrl);

function openDatabase(): Database.Database {
  if (sqlitePath !== ":memory:") {
    fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  }
  const conn = new Database(sqlitePath);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  return conn;
}

export const sqlite: Database.Database =
  globalForDb.__tuhafiyeSqlite ?? openDatabase();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__tuhafiyeSqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { schema };
