import {
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";
import {
  categoryFormat,
  competitionLevel,
  phaseKind,
  sourceKind,
} from "./enums";
import { nation, venue } from "./reference";

/**
 * A competition (an event weekend). Grouping is best-effort: pmg groups its
 * category posts by shared title; mg groups event ids by title prefix. When
 * grouping is uncertain a category owns a thin 1:1 competition.
 */
export const competition = sqliteTable(
  "competition",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    /** Normalized key used to group source categories into one competition. */
    groupingKey: text("grouping_key").notNull(),
    level: text("level", { enum: competitionLevel }),
    nationId: integer("nation_id").references(() => nation.id),
    venueId: integer("venue_id").references(() => venue.id),
    /** ISO `YYYY-MM-DD` string (already how scrapers produce dates). */
    startsOn: text("starts_on"),
    endsOn: text("ends_on"),
    organizer: text("organizer"),
    source: text("source", { enum: sourceKind }).notNull(),
    /** Verbatim source title, kept for later re-grouping / merge. */
    sourceTitleRaw: text("source_title_raw"),
  },
  (t) => [index("competition_source_group_idx").on(t.source, t.groupingKey)],
);

/**
 * A category = one format × age band within a competition. THIS is the scraping
 * unit (one mg event id = one category; one pmg CPT post = one category).
 * PRO is orthogonal to the age band; `12a`/`12b` splits go to `division`.
 */
export const category = sqliteTable(
  "category",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    competitionId: integer("competition_id")
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    format: text("format", { enum: categoryFormat }).notNull(),
    /** Normalized band: OPEN | U12 | U15 | U18 (unknowns kept normalized). */
    ageBand: text("age_band"),
    pro: integer("pro", { mode: "boolean" }).default(false).notNull(),
    /** `a`/`b` for 12a/12b-style splits. */
    division: text("division"),
    /** Raw source label, e.g. "Under 12a". */
    label: text("label"),
    source: text("source", { enum: sourceKind }).notNull(),
  },
  (t) => [
    index("category_competition_idx").on(t.competitionId),
    index("category_format_idx").on(t.format),
  ],
);

/**
 * A phase within a category (session / semifinal / final). Source-specific
 * routing (session number, final tier, pmg slug) lives in `native_params`.
 */
export const phase = sqliteTable(
  "phase",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: phaseKind }).notNull(),
    ordinal: integer("ordinal").notNull(),
    label: text("label").notNull(),
    /** Ingestion-only metadata to rebuild the source view, e.g. {final:'A',heat:1}. */
    nativeParams: text("native_params", { mode: "json" }),
  },
  (t) => [
    unique("phase_category_kind_ord_uq").on(t.categoryId, t.kind, t.ordinal),
  ],
);

/** A heat within a phase (individual/pairs sessions split into heats/batterie). */
export const heat = sqliteTable(
  "heat",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    phaseId: integer("phase_id")
      .notNull()
      .references(() => phase.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
  },
  (t) => [unique("heat_phase_number_uq").on(t.phaseId, t.number)],
);
