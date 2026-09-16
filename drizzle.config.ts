import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Örn: mysql://kullanici:sifre@127.0.0.1:3306/tuhafiye
    url: process.env.DATABASE_URL || "mysql://root:root@127.0.0.1:3306/tuhafiye",
  },
});
