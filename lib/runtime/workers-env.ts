/// <reference types="@cloudflare/workers-types" />

/**
 * Request-scoped Cloudflare Workers environment accessor (OpenNext).
 *
 * On Workers (OpenNext runtime) bindings (D1, KV) and secrets are NOT on
 * `process.env`; they arrive on the Worker `env`. OpenNext exposes that `env`
 * (plus `cf` / `ctx`) through {@link getCloudflareContext} from
 * `@opennextjs/cloudflare`. Unlike the ViNext `cloudflare:workers` virtual
 * module, `getCloudflareContext` is an ordinary named export that is SAFE TO
 * IMPORT under plain Node — it only *reads* an AsyncLocalStorage-backed context
 * when called, and throws (or is unavailable) when there is no request context.
 * That is why this module can be imported by the Node/Vitest graph without an
 * alias or a stub: there is no Workers-only module in the import graph anymore.
 *
 * This module is the single place that reaches the Worker `env`, so the rest of
 * the app depends only on the plain accessors below.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Typed Worker environment. Extend as bindings are added; declared here so
 * callers get `DB` / `POLLER_KV` typed without importing the OpenNext context.
 */
export interface WorkerEnv {
  /** D1 binding (wrangler.jsonc `d1_databases[].binding = "DB"`). */
  DB?: D1Database;
  /** KV binding for the Phase D idle gate (`kv_namespaces[].binding`). */
  POLLER_KV?: KVNamespace;
  /** Better Auth secret + base URL (Workers secrets, not process.env). */
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  /** Shared bearer token for the manual poll/seed routes. */
  CRON_SECRET?: string;
  /** Source portal base URLs. */
  MG_SCOREBOARD_BASE_URL?: string;
  PMG_LIVESCORE_BASE_URL?: string;
  [key: string]: unknown;
}

/**
 * The request-scoped Worker environment.
 *
 * On Workers this is the live `env` (bindings + secrets) resolved via OpenNext's
 * {@link getCloudflareContext}. Off-Workers — under `next dev` on Node before
 * `initOpenNextCloudflareForDev()` has wired local bindings, in Vitest, or in a
 * plain `tsx` script — no Cloudflare context exists and `getCloudflareContext`
 * throws; we swallow that and return an EMPTY env, so reads return `undefined`
 * and every caller takes its dev/test fallback (better-sqlite3, `process.env`).
 *
 * NEVER throws: callers (including `auth.ts` at module init) can rely on getting
 * an object back regardless of runtime or request scope.
 */
export function getEnv(): WorkerEnv {
  try {
    // `getCloudflareContext()` is sync inside a request on Workers and under
    // `next dev` once local bindings are wired. Outside any request context it
    // throws — treated as "no bindings" below.
    const ctx = getCloudflareContext();
    return (ctx?.env ?? {}) as unknown as WorkerEnv;
  } catch {
    return {} as WorkerEnv;
  }
}

/**
 * True when running with a D1 binding present (Workers, or `next dev` with
 * local bindings). Chooses between the request-scoped D1 handle and the dev/test
 * better-sqlite3 handle (db/index.ts).
 */
export function isWorkers(): boolean {
  return Boolean(getEnv().DB);
}

/**
 * Read a string config value (secret / base URL) from the Workers `env` first,
 * then `process.env` for local dev / Node. Use instead of a bare `process.env.X`
 * anywhere that must also work on Workers, where secrets are bound on `env`.
 */
export function getSecret(key: string): string | undefined {
  const fromEnv = getEnv()[key];
  if (typeof fromEnv === "string") return fromEnv;
  return process.env[key];
}
