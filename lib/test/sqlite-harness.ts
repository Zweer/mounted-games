import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import type { PersistDb } from "@/lib/ingest/upsert";

/**
 * In-memory SQLite test harness that matches the production D1 dialect.
 *
 * Replaces the old embedded-Postgres test harness (Phase A′). Each call
 * returns a fresh `:memory:` database with `PRAGMA foreign_keys = ON` (D1
 * enforces FKs; the pragma makes the local engine enforce the same cascades) and
 * the generated SQLite baseline applied.
 *
 * The schema is applied from the drizzle-kit generated SQLite migrations under
 * `db/*.sql` (statement-split on the `--> statement-breakpoint` marker, run in
 * filename order). After Phase A there is a single `0000_*` baseline; the loader
 * globs every top-level `db/*.sql` so a later migration is picked up
 * automatically. The retired Postgres migrations live under
 * `db/_postgres_retired/` and are NOT read (only top-level `db/*.sql`).
 */

const MIGRATIONS_DIR = join(__dirname, "..", "..", "db");

export interface TestDb {
  db: PersistDb;
  /** Close the underlying connection (call in afterEach). */
  close: () => void;
}

/** Apply every top-level `db/*.sql` migration to a better-sqlite3 client. */
function applySchema(client: Database.Database): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const raw = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    const statements = raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const statement of statements) {
      client.exec(statement);
    }
  }
}

/**
 * Create a fresh in-memory SQLite database with the schema applied and foreign
 * keys enforced. Returns the Drizzle handle (typed as `PersistDb`, the same
 * injectable handle production code accepts) plus a `close` teardown.
 */
export function createTestDb(): TestDb {
  const client = new Database(":memory:");
  client.pragma("foreign_keys = ON");
  applySchema(client);
  const db = drizzle(client, { schema }) as unknown as PersistDb;
  return { db, close: () => client.close() };
}
