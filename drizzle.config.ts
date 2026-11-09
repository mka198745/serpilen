import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle-sqlite",
  dbCredentials: {
    // Örn: sqlite:./data/tuhafiye.db
    url: (process.env.DATABASE_URL || "sqlite:./data/tuhafiye.db").replace(/^sqlite:/, ""),
  },
});
