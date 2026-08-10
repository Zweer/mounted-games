import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { contributionStatus, contributionTarget } from "./enums";

/**
 * Crowdsourcing queue (schema hook only; the full moderation workflow is a later
 * spec). Approving a contribution writes domain rows with `provenance =
 * 'crowdsourced'` — used to fill mg's opaque team/pair rosters and horses, and to
 * merge misresolved name-based identities.
 */
export const contribution = pgTable("contribution", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  target: contributionTarget("target").notNull(),
  /** Existing row being edited/merged (null when proposing a new row). */
  targetId: integer("target_id"),
  /** Proposed member/athlete/horse or merge pair, shape depends on `target`. */
  payload: jsonb("payload").notNull(),
  status: contributionStatus("status").default("pending").notNull(),
  reviewedBy: text("reviewed_by").references(() => user.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
});
