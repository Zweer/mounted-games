import { defineConfig } from "drizzle-kit";

/**
 * SQLite/D1 dialect. `drizzle-kit generate` reads the schema and emits SQLite
 * migrations into `./db` (no DB connection needed to generate). For local
 * application the migrations run against a better-sqlite3 file; for production
 * they are applied to D1 with `wrangler d1 migrations apply` (Phase D).
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./db/schema.ts",
  out: "./db",
  strict: true,
  verbose: true,
});
