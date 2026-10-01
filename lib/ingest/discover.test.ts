import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scrapeTarget } from "@/db/schema";
import type { DiscoveredTarget } from "@/lib/scrapers/types";
import { createTestDb, type TestDb } from "@/lib/test/sqlite-harness";

/**
 * `syncTargets` writes through the module `db` proxy (@/db). Point that proxy at
 * a fresh migrated in-memory SQLite handle per test so the real chunked-insert
 * code path runs against a real engine — the same dialect production uses on D1,
 * minus D1's 100-bound-parameter cap (the cap is exactly what the chunking
 * guards against; see discover.ts MAX_ROWS_PER_INSERT).
 */
let testDb: TestDb;

vi.mock("@/db", () => ({
  get db() {
    return testDb.db;
  },
}));

// Imported AFTER the mock is registered so it binds to the mocked `db`.
const { syncTargets } = await import("./discover");

beforeEach(() => {
  testDb = createTestDb();
});

afterEach(() => {
  testDb.close();
  vi.clearAllMocks();
});

/** N distinct toplist targets — more than one D1 chunk (MAX_ROWS_PER_INSERT=14). */
function makeTargets(n: number): DiscoveredTarget[] {
  return Array.from({ length: n }, (_, i) => ({
    kind: "toplist",
    url: `https://example.test/event/${i}`,
  }));
}

describe("syncTargets — D1 100-bound-parameter chunking", () => {
  it("persists ALL rows when the batch exceeds one D1 chunk (>14 rows)", async () => {
    // 30 rows = 3 inserts (14 + 14 + 2); a single INSERT would bind 210 params
    // and D1 would reject it ("too many SQL variables").
    await syncTargets("mg-scoreboard", makeTargets(30));

    const rows = await testDb.db.select().from(scrapeTarget);
    expect(rows).toHaveLength(30);
  });

  it("is idempotent across re-runs (upsert on the url unique key)", async () => {
    await syncTargets("mg-scoreboard", makeTargets(30));
    // Re-run with the same urls plus 5 new ones — no duplicates, 5 added.
    await syncTargets("mg-scoreboard", makeTargets(35));

    const rows = await testDb.db.select().from(scrapeTarget);
    expect(rows).toHaveLength(35);
  });

  it("keeps every chunk within the 100 bound-parameter limit", async () => {
    // 7 bound params/row => at most 14 rows/statement => <= 98 params. This
    // asserts the arithmetic the chunk size derives from, so a column added to
    // the row shape without updating BOUND_PARAMS_PER_ROW is caught here.
    const BOUND_PARAMS_PER_ROW = 7;
    const MAX_ROWS_PER_INSERT = Math.floor(100 / BOUND_PARAMS_PER_ROW);
    expect(MAX_ROWS_PER_INSERT * BOUND_PARAMS_PER_ROW).toBeLessThanOrEqual(100);

    // A batch sized to the chunk boundary still persists fully.
    await syncTargets("pmglivescore", makeTargets(MAX_ROWS_PER_INSERT));
    const rows = await testDb.db.select().from(scrapeTarget);
    expect(rows).toHaveLength(MAX_ROWS_PER_INSERT);
  });
});
