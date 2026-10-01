import { afterEach, describe, expect, it } from "vitest";
import {
  hasLiveTargets,
  isLiveWindowRefreshDue,
  KV_IS_LIVE,
  KV_NEXT_REFRESH,
  LIVE_WINDOW_TTL_MS,
} from "./live-window";

/**
 * Phase D — D7. The idle gate must make an off-season poll tick cost NOTHING at
 * the database: with `poller:is-live == "0"` the hot path reads KV and returns
 * without ever building the request-scoped D1 handle. These tests prove exactly
 * that by injecting a fake KV + a D1 stub through the same OpenNext global
 * Cloudflare-context symbol the runtime uses, and asserting the D1 stub is never
 * touched on the idle path.
 *
 * They run on plain Vitest (no Miniflare): the fake bindings are enough because
 * `getEnv()` (lib/runtime/workers-env.ts) reads the context off
 * `globalThis[Symbol.for("__cloudflare-context__")]`, which is what OpenNext's
 * `runWithCloudflareRequestContext` populates in production.
 */

const CLOUDFLARE_CONTEXT_SYMBOL = Symbol.for("__cloudflare-context__");

/** Minimal in-memory KV honoring the get/put subset the idle gate uses. */
function makeFakeKv(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  const calls = { get: 0, put: 0 };
  const kv = {
    async get(key: string): Promise<string | null> {
      calls.get += 1;
      return store.get(key) ?? null;
    },
    async put(key: string, value: string): Promise<void> {
      calls.put += 1;
      store.set(key, value);
    },
  };
  return { kv: kv as unknown as KVNamespace, store, calls };
}

/**
 * A D1 stub that fails LOUDLY if used. Any real query on the idle path routes
 * through `getRequestDb()` -> `getD1Db(env.DB)` -> `env.DB.prepare(...)`, so a
 * bumped counter (or a thrown `prepare`) is proof the hot path touched D1.
 */
function makeCountingD1() {
  const calls = { prepare: 0, batch: 0, exec: 0 };
  const d1 = {
    prepare(_q: string) {
      calls.prepare += 1;
      throw new Error("D1.prepare called on the idle path — gate leaked to DB");
    },
    batch() {
      calls.batch += 1;
      throw new Error("D1.batch called on the idle path");
    },
    exec() {
      calls.exec += 1;
      throw new Error("D1.exec called on the idle path");
    },
  };
  return { d1: d1 as unknown as D1Database, calls };
}

/** Install a fake Cloudflare context (env bindings) for the duration of a test. */
function installContext(env: Record<string, unknown>): void {
  (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT_SYMBOL] = {
    env,
    ctx: { waitUntil() {}, passThroughOnException() {} },
    cf: undefined,
  };
}

function clearContext(): void {
  delete (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT_SYMBOL];
}

describe("live-window idle gate (KV)", () => {
  afterEach(() => {
    clearContext();
  });

  it("idle tick issues ZERO D1 queries when poller:is-live is '0'", async () => {
    // Arrange: KV says idle; D1 is a stub that throws if touched at all.
    const { kv, calls: kvCalls } = makeFakeKv({ [KV_IS_LIVE]: "0" });
    const { d1, calls: d1Calls } = makeCountingD1();
    installContext({ DB: d1, POLLER_KV: kv });

    // Act
    const live = await hasLiveTargets();

    // Assert: answered from KV alone, no D1 access whatsoever.
    expect(live).toBe(false);
    expect(kvCalls.get).toBe(1);
    expect(d1Calls.prepare).toBe(0);
    expect(d1Calls.batch).toBe(0);
    expect(d1Calls.exec).toBe(0);
  });

  it("returns true from KV alone when poller:is-live is '1' (no D1)", async () => {
    // Arrange
    const { kv, calls: kvCalls } = makeFakeKv({ [KV_IS_LIVE]: "1" });
    const { d1, calls: d1Calls } = makeCountingD1();
    installContext({ DB: d1, POLLER_KV: kv });

    // Act
    const live = await hasLiveTargets();

    // Assert
    expect(live).toBe(true);
    expect(kvCalls.get).toBe(1);
    expect(d1Calls.prepare).toBe(0);
  });

  it("refresh is due when poller:next-refresh is absent", async () => {
    // Arrange: KV present but no next-refresh key yet.
    const { kv } = makeFakeKv();
    installContext({ POLLER_KV: kv });

    // Act + Assert
    expect(await isLiveWindowRefreshDue()).toBe(true);
  });

  it("refresh is due once the next-refresh deadline has elapsed", async () => {
    // Arrange
    const now = 1_000_000;
    const { kv } = makeFakeKv({ [KV_NEXT_REFRESH]: String(now - 1) });
    installContext({ POLLER_KV: kv });

    // Act + Assert
    expect(await isLiveWindowRefreshDue(now)).toBe(true);
  });

  it("refresh is NOT due before the next-refresh deadline (cheap KV read)", async () => {
    // Arrange
    const now = 1_000_000;
    const { kv, calls } = makeFakeKv({
      [KV_NEXT_REFRESH]: String(now + LIVE_WINDOW_TTL_MS),
    });
    installContext({ POLLER_KV: kv });

    // Act + Assert
    expect(await isLiveWindowRefreshDue(now)).toBe(false);
    expect(calls.get).toBe(1);
  });

  it("falls back to true (Node/test, no KV binding) so the D1 throttle applies", async () => {
    // Arrange: no context at all — the Node/test path.
    clearContext();

    // Act + Assert: without KV the refresh is always "due"; poll.ts then relies
    // on claimScheduledTask (D1) to throttle, preserving pre-Phase-D behavior.
    expect(await isLiveWindowRefreshDue()).toBe(true);
  });
});
