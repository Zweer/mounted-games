/**
 * Shared domain enums, kept in one file so any model can import them without
 * cross-domain module cycles. Auth-only enums (`user_role`, `user_status`) live
 * with the auth tables in `./auth` since nothing else references them.
 *
 * SQLite/D1 has no native enum type. Drizzle's `sqlite-core` `text()` column
 * accepts an `enum` tuple, which produces the SAME TypeScript union type as the
 * old `pgEnum` (a compile-time narrowing, no runtime CHECK). We therefore export
 * the string tuples here and apply them inline in each table via
 * `text(name, { enum: <tuple> })`. Every downstream TS union stays identical, so
 * query code and Zod schemas are unaffected. Tuples are `as const` so the union
 * is the literal set, not `string[]`.
 */

/** The two third-party portals we ingest from. */
export const sourceKind = ["mg-scoreboard", "pmglivescore"] as const;

/** Best-effort competition level (often inferred from the title / circuit). */
export const competitionLevel = [
  "club",
  "regional",
  "national",
  "international",
] as const;

/** Competition format; the participant type mirrors it. */
export const categoryFormat = ["team", "individual", "pair"] as const;

/** Participant discriminator (polymorphic participant, aligned to the format). */
export const participantType = ["team", "individual", "pair"] as const;

/** Phase kind within a category. Tier/heat specifics live in `phase.native_params`. */
export const phaseKind = ["session", "semifinal", "final"] as const;

/** Where a piece of roster/identity data came from. */
export const provenance = ["scraped", "crowdsourced", "merged"] as const;

/** Moderation status of a crowdsourcing contribution. */
export const contributionStatus = ["pending", "approved", "rejected"] as const;

/** What a contribution proposes to create/edit/merge. */
export const contributionTarget = [
  "participant_member",
  "athlete",
  "horse",
  "participant",
  "identity_merge",
] as const;

/** Domain entity kinds that carry a per-source native id in `source_ref`. */
export const sourceEntityType = [
  "competition",
  "category",
  "participant",
] as const;
