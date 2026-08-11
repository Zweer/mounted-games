/**
 * Normalized, source-agnostic record types produced by every scraper's `parse`,
 * and the `Scraper` interface itself. These map onto the domain schema
 * (see .kiro/specs/02-schema-stats) but carry raw + normalized strings only —
 * id resolution and upserts happen in `lib/ingest`.
 */

export type SourceKind = "mg-scoreboard" | "pmglivescore";
export type CompetitionFormat = "team" | "individual" | "pair";
export type PhaseKind = "session" | "semifinal" | "final";
export type CompetitionLevel =
  | "club"
  | "regional"
  | "national"
  | "international";

export interface NationRef {
  /** ISO2 (`IT`, `FR`) or home-nation token (`england`, `scotland`, `wales`). */
  code: string;
  name: string;
}

/** A rider (+ optional horse) belonging to a participant's roster. */
export interface NormalizedMember {
  familyName: string;
  givenName?: string;
  /** Horse/pony name (pmg only; absent on mg). */
  horse?: string;
}

export interface NormalizedParticipant {
  type: CompetitionFormat;
  /** Verbatim label as shown (nation+category / rider name / pair label). */
  label: string;
  /** Per-source native id (e.g. mg `team_id`). */
  nativeId?: string;
  nation?: NationRef;
  startNumber?: number;
  /** Roster: 0 rows when opaque (mg team/pair), 1 individual, 2 pair, N team. */
  members: NormalizedMember[];
}

export interface NormalizedGameScore {
  /** Raw game name as seen (resolved to a canonical game via game_alias). */
  game: string;
  points: number;
  ordinal: number;
}

export interface NormalizedPhaseRef {
  kind: PhaseKind;
  ordinal: number;
  label: string;
  /** Ingestion-only routing metadata, e.g. `{ session: 2 }` or `{ final: "A", heat: 1 }`. */
  nativeParams?: Record<string, unknown>;
}

export interface NormalizedResult {
  /** Join key back to a participant within this scrape (by its label). */
  participantLabel: string;
  phase: NormalizedPhaseRef;
  heatNumber?: number;
  pointsTotal: number;
  penaltyPoints?: number;
  rank?: number;
  isTie?: boolean;
  games: NormalizedGameScore[];
}

export interface NormalizedCompetition {
  name: string;
  /** Normalized key used to group source categories into one competition. */
  groupingKey: string;
  level?: CompetitionLevel;
  nation?: NationRef;
  venue?: string;
  startsOn?: string;
  endsOn?: string;
  organizer?: string;
  sourceTitleRaw?: string;
}

export interface NormalizedCategory {
  format: CompetitionFormat;
  /** OPEN | U12 | U15 | U18 (normalized; unknowns kept normalized). */
  ageBand?: string;
  pro: boolean;
  /** `a`/`b` for 12a/12b-style splits. */
  division?: string;
  label?: string;
  /** mg event id / pmg post_id. */
  nativeId: string;
}

/**
 * The result of parsing ONE source page. A full category is assembled from
 * several pages (toplist + sessions + finals + rosters), so `participants` and
 * `results` may be partial; the upsert layer merges them idempotently.
 */
export interface NormalizedScrape {
  source: SourceKind;
  competition: NormalizedCompetition;
  category: NormalizedCategory;
  participants: NormalizedParticipant[];
  results: NormalizedResult[];
}

/** Context passed to `parse` so it can resolve ids/phase from the fetched URL. */
export interface ScrapeContext {
  url: string;
  /** e.g. "toplist" | "session" | "final" | "iscritti" | "archive". */
  kind: string;
}

/**
 * One scrape target discovered from an event/competition page's phase nav.
 * `kind` matches the `ScrapeContext.kind` the target should later be parsed
 * with; `url` is an absolute, canonical page URL (the idempotency key in
 * `scrape_target`). Produced by `Scraper.discoverTargets`.
 */
export interface DiscoveredTarget {
  kind: string;
  url: string;
}

export interface Scraper {
  readonly source: SourceKind;
  /** Fetch raw HTML for a URL with a per-fetch abort signal (timeout). */
  fetch(url: string, signal: AbortSignal): Promise<string>;
  /** Pure parse of raw HTML → normalized records (unit-tested vs fixtures). */
  parse(html: string, ctx: ScrapeContext): NormalizedScrape;
  /**
   * Enumerate the phase/view pages linked from an event page's nav bar into
   * canonical, de-duplicated `scrape_target` candidates. Pure (unit-tested vs
   * fixtures); the ingest layer persists the result via `syncTargets`.
   */
  discoverTargets(html: string, ctx: ScrapeContext): DiscoveredTarget[];
  /**
   * The entry-page kind for this source. When the poller parses a target of
   * this kind it also runs `discoverTargets` to seed the event's sub-phases.
   */
  readonly entryKind: string;
  /**
   * List every known event as an entry-kind target (bootstrap seeding): mg
   * crawls the archive/upcoming/current lists, pmg enumerates the wp-json CPTs.
   */
  listEvents(signal: AbortSignal): Promise<DiscoveredTarget[]>;
  /**
   * List the events that are LIVE right now, straight from the source's own
   * "current / in-progress" list (mg "Current competitions" nav; pmg home cards
   * with `gara-stato--in_corso`). Drives the automatic live-window — no dates,
   * no manual flag. Returns entry-kind targets, same shape as `listEvents`.
   */
  listLiveEvents(signal: AbortSignal): Promise<DiscoveredTarget[]>;
}
