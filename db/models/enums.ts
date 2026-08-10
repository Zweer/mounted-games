import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Shared domain enums, kept in one file so any model can import them without
 * cross-domain module cycles. Auth-only enums (`user_role`, `user_status`) live
 * with the auth tables in `./auth` since nothing else references them.
 */

/** The two third-party portals we ingest from. */
export const sourceKind = pgEnum("source_kind", [
  "mg-scoreboard",
  "pmglivescore",
]);

/** Best-effort competition level (often inferred from the title / circuit). */
export const competitionLevel = pgEnum("competition_level", [
  "club",
  "regional",
  "national",
  "international",
]);

/** Competition format; the participant type mirrors it. */
export const categoryFormat = pgEnum("category_format", [
  "team",
  "individual",
  "pair",
]);

/** Participant discriminator (polymorphic participant, aligned to the format). */
export const participantType = pgEnum("participant_type", [
  "team",
  "individual",
  "pair",
]);

/** Phase kind within a category. Tier/heat specifics live in `phase.native_params`. */
export const phaseKind = pgEnum("phase_kind", [
  "session",
  "semifinal",
  "final",
]);

/** Where a piece of roster/identity data came from. */
export const provenance = pgEnum("provenance", [
  "scraped",
  "crowdsourced",
  "merged",
]);

/** Moderation status of a crowdsourcing contribution. */
export const contributionStatus = pgEnum("contribution_status", [
  "pending",
  "approved",
  "rejected",
]);

/** What a contribution proposes to create/edit/merge. */
export const contributionTarget = pgEnum("contribution_target", [
  "participant_member",
  "athlete",
  "horse",
  "participant",
  "identity_merge",
]);

/** Domain entity kinds that carry a per-source native id in `source_ref`. */
export const sourceEntityType = pgEnum("source_entity_type", [
  "competition",
  "category",
  "participant",
]);
