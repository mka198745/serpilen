import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // MySQL 8 — geçiş yapıldığında kullanılacak (şu an SQLite aktif)
    url: process.env.DATABASE_URL || "mysql://root:root@127.0.0.1:3306/tuhafiye",
  },
});
