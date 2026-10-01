import {
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";
import { category } from "./competition";
import { sourceEntityType, sourceKind } from "./enums";

/**
 * Per-source native id map. Keeps source ids (mg event id / mg team_id / pmg
 * post_id) out of the domain tables and is the idempotency anchor for re-scrapes.
 * `entityId` is a soft reference resolved by `entityType` (no hard FK — the
 * target table varies).
 */
export const sourceRef = sqliteTable(
  "source_ref",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source", { enum: sourceKind }).notNull(),
    entityType: text("entity_type", { enum: sourceEntityType }).notNull(),
    entityId: integer("entity_id").notNull(),
    nativeId: text("native_id").notNull(),
    nativeUrl: text("native_url"),
  },
  (t) => [
    unique("source_ref_source_type_native_uq").on(
      t.source,
      t.entityType,
      t.nativeId,
    ),
  ],
);

/**
 * The poller's unit of work: what to scrape next is data, not code. The
 * bounded-tick poller reads/writes this (see spec 01-ingestion).
 */
export const scrapeTarget = sqliteTable(
  "scrape_target",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source", { enum: sourceKind }).notNull(),
    url: text("url").notNull(),
    /** e.g. "toplist" | "session" | "final" | "iscritti" | "archive". */
    kind: text("kind").notNull(),
    categoryId: integer("category_id").references(() => category.id, {
      onDelete: "cascade",
    }),
    isLive: integer("is_live", { mode: "boolean" }).default(false).notNull(),
    lastScrapedAt: integer("last_scraped_at", { mode: "timestamp" }),
    nextPollAt: integer("next_poll_at", { mode: "timestamp" }),
    lastAttemptAt: integer("last_attempt_at", { mode: "timestamp" }),
    lastSuccessAt: integer("last_success_at", { mode: "timestamp" }),
    leasedUntil: integer("leased_until", { mode: "timestamp" }),
    failureCount: integer("failure_count").default(0).notNull(),
    contentHash: text("content_hash"),
    /**
     * Event date captured at discovery from the source list page (event pages
     * carry no date). Threaded into `competition.starts_on`/`ends_on` when the
     * entry page is persisted. `ends_on` is set only when the list gives a range.
     * ISO `YYYY-MM-DD` string.
     */
    startsOn: text("starts_on"),
    endsOn: text("ends_on"),
  },
  (t) => [
    unique("scrape_target_url_uq").on(t.url),
    index("scrape_target_live_stale_idx").on(t.isLive, t.nextPollAt),
  ],
);

/** Singleton leases used to prevent overlapping dispatcher invocations. */
export const ingestionState = sqliteTable("ingestion_state", {
  job: text("job").primaryKey(),
  leaseUntil: integer("lease_until", { mode: "timestamp" }),
  nextRunAt: integer("next_run_at", { mode: "timestamp" }),
  lastDiscoveryAt: integer("last_discovery_at", { mode: "timestamp" }),
  nextDiscoveryAt: integer("next_discovery_at", { mode: "timestamp" }),
  lastArchiveAt: integer("last_archive_at", { mode: "timestamp" }),
});
