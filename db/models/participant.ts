import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { category } from "./competition";
import { participantType, provenance } from "./enums";
import { nation } from "./reference";

/**
 * A squad participant identity. mg nation-teams (`England U12` → nation England)
 * and pmg clubs both live here; `isClub` distinguishes them so a club is never
 * merged with a nation-team. The age band belongs to the category, not the team.
 */
export const team = pgTable("team", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  nationId: integer("nation_id").references(() => nation.id),
  isClub: boolean("is_club").default(false).notNull(),
});

/** A rider identity, resolved across events by `normalizedName`. */
export const athlete = pgTable("athlete", {
  id: serial("id").primaryKey(),
  familyName: text("family_name").notNull(),
  givenName: text("given_name"),
  normalizedName: text("normalized_name").notNull().unique(),
  nationId: integer("nation_id").references(() => nation.id),
});

/** A horse/pony identity (pmg only in practice; mg never shows horses). */
export const horse = pgTable("horse", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull().unique(),
});

/**
 * Polymorphic participant within a category. `type` mirrors the category format.
 * `teamId`/`athleteId` are fast-path links for team/individual; the full roster
 * (any type) is in `participant_member`. Native id (mg team_id) lives in
 * `source_ref`; scores join by `normalizedLabel` within the category.
 */
export const participant = pgTable(
  "participant",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    type: participantType("type").notNull(),
    label: text("label").notNull(),
    normalizedLabel: text("normalized_label").notNull(),
    teamId: integer("team_id").references(() => team.id),
    athleteId: integer("athlete_id").references(() => athlete.id),
    nationId: integer("nation_id").references(() => nation.id),
    startNumber: integer("start_number"),
  },
  (t) => [
    unique("participant_category_label_uq").on(t.categoryId, t.normalizedLabel),
  ],
);

/**
 * Roster link: which athletes (+ optional horse) rode for a participant.
 * individual → 1 row, pair → 2, team → N; mg team/pair start at 0 rows until
 * `crowdsourced`. `provenance` lets the UI flag and moderation revert them.
 */
export const participantMember = pgTable(
  "participant_member",
  {
    id: serial("id").primaryKey(),
    participantId: integer("participant_id")
      .notNull()
      .references(() => participant.id, { onDelete: "cascade" }),
    athleteId: integer("athlete_id")
      .notNull()
      .references(() => athlete.id),
    horseId: integer("horse_id").references(() => horse.id),
    role: text("role"),
    provenance: provenance("provenance").default("scraped").notNull(),
  },
  (t) => [unique("participant_member_uq").on(t.participantId, t.athleteId)],
);
