import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __tuhafiyeMysqlPool?: mysql.Pool;
};

export const pool =
  globalForDb.__tuhafiyeMysqlPool ??
  mysql.createPool({
    uri: databaseUrl,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // UTC tutarlılığı: TIMESTAMP/DATETIME değerleri UTC olarak okunur/yazılır
    timezone: "Z",
    // utf8mb4 Türkçe karakter desteği (sunucu tarafında da utf8mb4 önerilir)
    charset: "utf8mb4",
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__tuhafiyeMysqlPool = pool;
}

export const db = drizzle(pool, { schema, mode: "default" });
export { schema };
