import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { contributionStatus, contributionTarget } from "./enums";

/**
 * Crowdsourcing queue (schema hook only; the full moderation workflow is a later
 * spec). Approving a contribution writes domain rows with `provenance =
 * 'crowdsourced'` — used to fill mg's opaque team/pair rosters and horses, and to
 * merge misresolved name-based identities.
 */
export const contribution = sqliteTable("contribution", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  target: text("target", { enum: contributionTarget }).notNull(),
  /** Existing row being edited/merged (null when proposing a new row). */
  targetId: integer("target_id"),
  /** Proposed member/athlete/horse or merge pair, shape depends on `target`. */
  payload: text("payload", { mode: "json" }).notNull(),
  status: text("status", { enum: contributionStatus })
    .default("pending")
    .notNull(),
  reviewedBy: text("reviewed_by").references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
  reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
});
