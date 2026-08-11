import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { category } from "./competition";
import { sourceEntityType, sourceKind } from "./enums";

/**
 * Per-source native id map. Keeps source ids (mg event id / mg team_id / pmg
 * post_id) out of the domain tables and is the idempotency anchor for re-scrapes.
 * `entityId` is a soft reference resolved by `entityType` (no hard FK — the
 * target table varies).
 */
export const sourceRef = pgTable(
  "source_ref",
  {
    id: serial("id").primaryKey(),
    source: sourceKind("source").notNull(),
    entityType: sourceEntityType("entity_type").notNull(),
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
export const scrapeTarget = pgTable(
  "scrape_target",
  {
    id: serial("id").primaryKey(),
    source: sourceKind("source").notNull(),
    url: text("url").notNull(),
    /** e.g. "toplist" | "session" | "final" | "iscritti" | "archive". */
    kind: text("kind").notNull(),
    categoryId: integer("category_id").references(() => category.id, {
      onDelete: "cascade",
    }),
    isLive: boolean("is_live").default(false).notNull(),
    lastScrapedAt: timestamp("last_scraped_at"),
  },
  (t) => [
    unique("scrape_target_url_uq").on(t.url),
    index("scrape_target_live_stale_idx").on(t.isLive, t.lastScrapedAt),
  ],
);
