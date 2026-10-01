import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveredTarget, SourceKind } from "@/lib/scrapers/types";
import { createTestDb, type TestDb } from "@/lib/test/sqlite-harness";

/**
 * Phase D — D7 live-window integration test.
 *
 * Exercises the FULL `refreshLiveWindow` path against a real migrated SQLite DB
 * (the D1 dialect harness): a running event listed by the source is inserted +
 * flagged live in `scrape_target`, and the authoritative truth is then published
 * to the KV idle gate (`poller:is-live` / `poller:next-refresh`). Finally the
 * cheap hot path (`hasLiveTargets`) answers from KV alone.
 *
 * The ingest layer reaches the DB through the module-level `@/db` proxy, so we
 * mock `@/db` to delegate to a per-test harness handle (via a hoisted holder),
 * and stub `@/lib/scrapers/registry` so no network is touched. The KV binding is
 * injected through the OpenNext global Cloudflare-context symbol, exactly as in
 * live-window.idle.test.ts.
 */

const holder = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("@/db", () => ({
  get db() {
    return holder.db;
  },
}));

// Stubbed scraper registry: mg reports ONE live event, pmg reports none.
const LIVE_URL = "https://mg-scoreboard.de/scoreboard?id=123";
const liveEvents: Record<SourceKind, DiscoveredTarget[]> = {
  "mg-scoreboard": [{ kind: "event", url: LIVE_URL }],
  pmglivescore: [],
};

vi.mock("@/lib/scrapers/registry", () => ({
  getScraper: (source: SourceKind) => ({
    source,
    entryKind: "event",
    async listLiveEvents() {
      return liveEvents[source];
    },
    async listEvents() {
      return [];
    },
    async fetch() {
      return "";
    },
    parse() {
      throw new Error("not used");
    },
    discoverTargets() {
      return [];
    },
  }),
}));

const CLOUDFLARE_CONTEXT_SYMBOL = Symbol.for("__cloudflare-context__");

function makeFakeKv(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  const kv = {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
  return { kv: kv as unknown as KVNamespace, store };
}

function installContext(env: Record<string, unknown>): void {
  (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT_SYMBOL] = {
    env,
    ctx: { waitUntil() {}, passThroughOnException() {} },
    cf: undefined,
  };
}

describe("refreshLiveWindow integration (D1 + KV publish)", () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
    holder.db = testDb.db;
  });

  afterEach(() => {
    delete (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT_SYMBOL];
    testDb.close();
    vi.clearAllMocks();
  });

  it("flags a running event live in D1 and publishes it to the KV idle gate", async () => {
    // Arrange
    const { kv, store } = makeFakeKv();
    installContext({ POLLER_KV: kv });
    // Import AFTER the mocks + context are in place.
    const { refreshLiveWindow, hasLiveTargets, KV_IS_LIVE, KV_NEXT_REFRESH } =
      await import("./live-window");
    const { scrapeTarget } = await import("@/db/schema");

    // Act
    await refreshLiveWindow(new AbortController().signal);

    // Assert — D1: the live event was inserted and flagged live.
    const rows = await (
      testDb.db as unknown as {
        select: () => {
          from: (t: unknown) => {
            where: (c: unknown) => Promise<{ url: string; isLive: boolean }[]>;
          };
        };
      }
    )
      .select()
      .from(scrapeTarget)
      .where(eq(scrapeTarget.url, LIVE_URL));
    expect(rows).toHaveLength(1);
    expect(rows[0].isLive).toBe(true);

    // Assert — KV: the truth was published for the idle gate.
    expect(store.get(KV_IS_LIVE)).toBe("1");
    expect(store.get(KV_NEXT_REFRESH)).toBeDefined();

    // Assert — the cheap hot path now answers "live" from KV alone.
    expect(await hasLiveTargets()).toBe(true);
  });

  it("publishes is-live '0' when no event is running", async () => {
    // Arrange: source reports nothing live this run.
    liveEvents["mg-scoreboard"] = [];
    const { kv, store } = makeFakeKv();
    installContext({ POLLER_KV: kv });
    const { refreshLiveWindow, KV_IS_LIVE } = await import("./live-window");

    // Act
    await refreshLiveWindow(new AbortController().signal);

    // Assert
    expect(store.get(KV_IS_LIVE)).toBe("0");

    // Restore for other tests.
    liveEvents["mg-scoreboard"] = [{ kind: "event", url: LIVE_URL }];
  });
});
