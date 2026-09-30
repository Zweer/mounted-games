/// <reference types="@cloudflare/workers-types" />
import { createRequire } from "node:module";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import type { PersistDb } from "@/lib/ingest/upsert";
import { getEnv } from "@/lib/runtime/workers-env";

/**
 * Dialect-aware, request-scoped database factory.
 *
 * The app now runs on Cloudflare Workers + D1 (SQLite). Workers has NO ambient
 * `process.env` and NO module-level connection: the D1 binding arrives per
 * request on the Worker `env`. So — unlike the old Neon module that threw at
 * import time on a missing `DATABASE_URL` — this module never opens a connection
 * as a side effect of being imported.
 *
 * Two backends:
 *   - Production (Workers): `drizzle(env.DB, { schema })` from `drizzle-orm/d1`,
 *     built per request from the D1 binding via {@link getD1Db}.
 *   - Dev / test: `better-sqlite3` against a file or `:memory:` via {@link getDb}.
 *
 * Query and ingest code takes an injectable `database?` handle (see
 * `lib/ingest/upsert.ts` `PersistDb`), so a route handler resolves the
 * request-scoped D1 handle once and threads it down; only when no handle is
 * passed do the lazy defaults below apply (dev/test convenience).
 *
 * `drizzle-orm/d1` is pure JS and safe to import in the Workers bundle. The
 * dev-only `better-sqlite3` (a native CJS addon) is loaded through
 * `createRequire` INSIDE {@link getDb}, so it is never pulled into the Workers
 * bundle and importing `@/db` in production costs nothing.
 */

/** Union of the two concrete Drizzle handles this app runs against. */
export type AppDatabase =
  | DrizzleD1Database<typeof schema>
  | BetterSQLite3Database<typeof schema>;

/**
 * Build a D1-backed Drizzle handle from a Worker `env.DB` binding. Call this in
 * a route handler / scheduled handler where the request `env` is available.
 * D1 enforces foreign keys itself; no PRAGMA is needed on the platform binding.
 */
export function getD1Db(d1: D1Database): DrizzleD1Database<typeof schema> {
  return drizzleD1(d1, { schema });
}

// --- Dev / test: better-sqlite3 -----------------------------------------

let devDb: BetterSQLite3Database<typeof schema> | undefined;

/**
 * A process-local better-sqlite3 handle for dev/test and any Node-side script.
 * Lazily created once. The path comes from `DATABASE_PATH` (default
 * `:memory:`), and `PRAGMA foreign_keys = ON` matches D1's FK enforcement so the
 * cascades declared in the schema behave the same locally.
 */
export function getDb(): BetterSQLite3Database<typeof schema> {
  if (devDb) return devDb;
  const require = createRequire(import.meta.url);
  const Database = require("better-sqlite3");
  const { drizzle } = require("drizzle-orm/better-sqlite3");
  const client = new Database(process.env.DATABASE_PATH ?? ":memory:");
  client.pragma("foreign_keys = ON");
  const created: BetterSQLite3Database<typeof schema> = drizzle(client, {
    schema,
  });
  devDb = created;
  return created;
}

/**
 * Resolve the database handle appropriate to the current runtime, per request.
 *
 * - On Cloudflare Workers (OpenNext), returns `getD1Db(env.DB)` built from the
 *   request-scoped D1 binding exposed via OpenNext's `getCloudflareContext()`
 *   (see `lib/runtime/workers-env.ts`). D1 has no module-level singleton; the
 *   handle is cheap to build per call and D1 enforces FKs itself.
 * - Under Node / dev / test (no D1 binding), returns the lazy `better-sqlite3`
 *   handle from {@link getDb}.
 *
 * Route handlers, the scheduled handler, `auth.ts` and the DB-backed server
 * components all resolve through this one accessor (directly, or via the `db`
 * proxy below which delegates to it), so exactly one place decides the backend.
 *
 * Typed as {@link PersistDb} — the `BaseSQLiteDatabase<"async" | "sync">` union
 * the codebase already uses for injectable handles — so one handle type covers
 * both the async D1 client and the sync better-sqlite3 client with unified
 * query-builder signatures (same reason `persistScrape`/the query fns use it).
 */
export function getRequestDb(): PersistDb {
  const workerEnv = getEnv();
  if (workerEnv?.DB) {
    return getD1Db(workerEnv.DB) as unknown as PersistDb;
  }
  return getDb() as unknown as PersistDb;
}

/**
 * Lazy default handle for callers that do not thread a request-scoped handle
 * (DB-backed server components, the injectable-`database?` query fns' fallback,
 * and the ingest helpers). Kept as a getter-backed proxy (NOT a module-level
 * `const`) so importing `@/db` never opens a connection — the backend is chosen
 * on first property access via {@link getRequestDb}, which returns request-scoped
 * D1 on Workers and better-sqlite3 under Node/test.
 */
export const db: PersistDb = new Proxy({} as PersistDb, {
  get(_target, prop, receiver) {
    const real = getRequestDb();
    return Reflect.get(real as object, prop, receiver);
  },
});
