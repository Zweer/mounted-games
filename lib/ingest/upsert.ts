import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "@/db/schema";
import {
  athlete,
  category,
  competition,
  game,
  gameAlias,
  gameResult,
  heat,
  horse,
  nation,
  participant,
  participantMember,
  phase,
  result,
  sourceRef,
  team,
} from "@/db/schema";
import { normalizeKey } from "@/lib/normalize";
import type {
  NationRef,
  NormalizedCategory,
  NormalizedMember,
  NormalizedParticipant,
  NormalizedResult,
  NormalizedScrape,
  SourceKind,
} from "@/lib/scrapers/types";

/**
 * Any Drizzle Postgres handle bound to our schema. Broad enough to accept both
 * the production `neon-http` client (`@/db`) and a test-only pglite client
 * (`drizzle-orm/pglite`), so `persistScrape` can be exercised against an
 * embedded Postgres with no external database. See `upsert.test.ts`.
 */
export type PersistDb = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * Per-scrape identity caches. neon-http has no interactive transaction and each
 * statement is its own HTTP round-trip, so the same nation/game/athlete/phase
 * resolved once per row would multiply round-trips several-fold. We memoize the
 * `Promise<id>` (not the id) so concurrent callers awaiting the same key share a
 * single in-flight resolve — this both deduplicates the work AND removes the
 * get-or-create race that plain parallelism would introduce. Scoped to one
 * `persistScrape` call; nothing leaks across scrapes.
 */
interface ResolveCaches {
  nation: Map<string, Promise<number>>;
  team: Map<string, Promise<number>>;
  athlete: Map<string, Promise<number>>;
  horse: Map<string, Promise<number>>;
  game: Map<string, Promise<number>>;
  phase: Map<string, Promise<number>>;
  heat: Map<string, Promise<number>>;
}

function createCaches(): ResolveCaches {
  return {
    nation: new Map(),
    team: new Map(),
    athlete: new Map(),
    horse: new Map(),
    game: new Map(),
    phase: new Map(),
    heat: new Map(),
  };
}

/** Memoize a `Promise<id>` in a cache keyed by `key`. */
function memoize(
  cache: Map<string, Promise<number>>,
  key: string,
  resolve: () => Promise<number>,
): Promise<number> {
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = resolve();
  cache.set(key, pending);
  return pending;
}

/** Numeric columns are string-typed in Drizzle; format numbers deterministically. */
function num(value: number): string {
  return value.toString();
}

/**
 * Build the roster identity name for an athlete. Both sources expose no stable
 * person id, so identity is resolved purely by the normalized name key.
 */
function memberDisplayName(member: NormalizedMember): string {
  return [member.familyName, member.givenName].filter(Boolean).join(" ");
}

// --- get-or-create helpers ------------------------------------------------
//
// The production driver is neon-http, which does NOT support interactive
// `db.transaction()`. Every step below is therefore an idempotent upsert keyed
// on a unique constraint (or a select-then-insert where the schema only has a
// non-unique index), so a re-run of the same scrape converges to the same rows
// and never duplicates — no wrapping transaction required.

function resolveNation(
  db: PersistDb,
  ref: NationRef,
  caches: ResolveCaches,
): Promise<number> {
  const code = ref.code.trim();
  return memoize(caches.nation, code, async () => {
    await db
      .insert(nation)
      .values({ code, name: ref.name })
      .onConflictDoNothing({ target: nation.code });
    const [row] = await db
      .select({ id: nation.id })
      .from(nation)
      .where(eq(nation.code, code))
      .limit(1);
    return row.id;
  });
}

/**
 * competition has only a NON-unique index on (source, grouping_key), so we
 * cannot use onConflict here — resolve by select, insert when missing. Safe to
 * re-run: a concurrent double-insert is not expected (one poller tick at a time)
 * and would only create a duplicate thin competition, never corrupt data.
 */
async function resolveCompetition(
  db: PersistDb,
  scrape: NormalizedScrape,
  caches: ResolveCaches,
): Promise<number> {
  const c = scrape.competition;
  const existing = await db
    .select({ id: competition.id })
    .from(competition)
    .where(
      and(
        eq(competition.source, scrape.source),
        eq(competition.groupingKey, c.groupingKey),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0].id;

  const nationId = c.nation ? await resolveNation(db, c.nation, caches) : null;
  const [row] = await db
    .insert(competition)
    .values({
      name: c.name,
      normalizedName: normalizeKey(c.name),
      groupingKey: c.groupingKey,
      level: c.level ?? null,
      nationId,
      startsOn: c.startsOn ?? null,
      endsOn: c.endsOn ?? null,
      organizer: c.organizer ?? null,
      source: scrape.source,
      sourceTitleRaw: c.sourceTitleRaw ?? null,
    })
    .returning({ id: competition.id });
  return row.id;
}

/**
 * category has only non-unique indexes, so resolve by the logical key
 * (competition + format + age_band + pro + division) via select, insert when
 * missing. Nullable age_band/division are matched with IS NULL.
 */
async function resolveCategory(
  db: PersistDb,
  competitionId: number,
  scrape: NormalizedScrape,
): Promise<number> {
  const cat: NormalizedCategory = scrape.category;
  const ageBand = cat.ageBand ?? null;
  const division = cat.division ?? null;
  const existing = await db
    .select({ id: category.id })
    .from(category)
    .where(
      and(
        eq(category.competitionId, competitionId),
        eq(category.format, cat.format),
        ageBand === null
          ? isNull(category.ageBand)
          : eq(category.ageBand, ageBand),
        eq(category.pro, cat.pro),
        division === null
          ? isNull(category.division)
          : eq(category.division, division),
      ),
    )
    .limit(1);

  let categoryId: number;
  if (existing[0]) {
    categoryId = existing[0].id;
  } else {
    const [row] = await db
      .insert(category)
      .values({
        competitionId,
        format: cat.format,
        ageBand,
        pro: cat.pro,
        division,
        label: cat.label ?? null,
        source: scrape.source,
      })
      .returning({ id: category.id });
    categoryId = row.id;
  }

  await recordSourceRef(
    db,
    scrape.source,
    "category",
    categoryId,
    cat.nativeId,
  );
  return categoryId;
}

/** Idempotent source_ref row (unique on source+entity_type+native_id). */
async function recordSourceRef(
  db: PersistDb,
  source: SourceKind,
  entityType: "competition" | "category" | "participant",
  entityId: number,
  nativeId: string,
): Promise<void> {
  await db
    .insert(sourceRef)
    .values({ source, entityType, entityId, nativeId })
    .onConflictDoUpdate({
      target: [sourceRef.source, sourceRef.entityType, sourceRef.nativeId],
      set: { entityId },
    });
}

function resolvePhase(
  db: PersistDb,
  categoryId: number,
  ref: NormalizedResult["phase"],
  caches: ResolveCaches,
): Promise<number> {
  const key = `${categoryId}:${ref.kind}:${ref.ordinal}`;
  return memoize(caches.phase, key, async () => {
    const [row] = await db
      .insert(phase)
      .values({
        categoryId,
        kind: ref.kind,
        ordinal: ref.ordinal,
        label: ref.label,
        nativeParams: ref.nativeParams ?? null,
      })
      .onConflictDoUpdate({
        target: [phase.categoryId, phase.kind, phase.ordinal],
        set: { label: ref.label, nativeParams: ref.nativeParams ?? null },
      })
      .returning({ id: phase.id });
    return row.id;
  });
}

function resolveHeat(
  db: PersistDb,
  phaseId: number,
  number: number,
  caches: ResolveCaches,
): Promise<number> {
  const key = `${phaseId}:${number}`;
  return memoize(caches.heat, key, async () => {
    const [row] = await db
      .insert(heat)
      .values({ phaseId, number })
      .onConflictDoUpdate({
        target: [heat.phaseId, heat.number],
        set: { number },
      })
      .returning({ id: heat.id });
    return row.id;
  });
}

/** team identity by normalized name (no unique constraint → select-then-insert). */
function resolveTeam(
  db: PersistDb,
  label: string,
  nationId: number | null,
  isClub: boolean,
  caches: ResolveCaches,
): Promise<number> {
  const normalizedName = normalizeKey(label);
  return memoize(caches.team, normalizedName, async () => {
    const existing = await db
      .select({ id: team.id })
      .from(team)
      .where(eq(team.normalizedName, normalizedName))
      .limit(1);
    if (existing[0]) return existing[0].id;
    const [row] = await db
      .insert(team)
      .values({ name: label, normalizedName, nationId, isClub })
      .returning({ id: team.id });
    return row.id;
  });
}

/** athlete identity by normalized name (unique → onConflict). */
function resolveAthlete(
  db: PersistDb,
  member: NormalizedMember,
  nationId: number | null,
  caches: ResolveCaches,
): Promise<number> {
  const normalizedName = normalizeKey(memberDisplayName(member));
  return memoize(caches.athlete, normalizedName, async () => {
    const [row] = await db
      .insert(athlete)
      .values({
        familyName: member.familyName,
        givenName: member.givenName ?? null,
        normalizedName,
        nationId,
      })
      .onConflictDoNothing({ target: athlete.normalizedName })
      .returning({ id: athlete.id });
    if (row) return row.id;
    const [found] = await db
      .select({ id: athlete.id })
      .from(athlete)
      .where(eq(athlete.normalizedName, normalizedName))
      .limit(1);
    return found.id;
  });
}

/** horse identity by normalized name (unique → onConflict). */
function resolveHorse(
  db: PersistDb,
  name: string,
  caches: ResolveCaches,
): Promise<number> {
  const normalizedName = normalizeKey(name);
  return memoize(caches.horse, normalizedName, async () => {
    const [row] = await db
      .insert(horse)
      .values({ name, normalizedName })
      .onConflictDoNothing({ target: horse.normalizedName })
      .returning({ id: horse.id });
    if (row) return row.id;
    const [found] = await db
      .select({ id: horse.id })
      .from(horse)
      .where(eq(horse.normalizedName, normalizedName))
      .limit(1);
    return found.id;
  });
}

async function resolveParticipant(
  db: PersistDb,
  categoryId: number,
  source: SourceKind,
  np: NormalizedParticipant,
  caches: ResolveCaches,
): Promise<number> {
  const normalizedLabel = normalizeKey(np.label);
  const nationId = np.nation
    ? await resolveNation(db, np.nation, caches)
    : null;

  // Fast-path identity links: team for squads/pairs, athlete for individuals.
  let teamId: number | null = null;
  let athleteId: number | null = null;
  if (np.type === "individual" && np.members[0]) {
    athleteId = await resolveAthlete(db, np.members[0], nationId, caches);
  } else if (np.type === "team" || np.type === "pair") {
    teamId = await resolveTeam(
      db,
      np.label,
      nationId,
      source === "pmglivescore",
      caches,
    );
  }

  const [row] = await db
    .insert(participant)
    .values({
      categoryId,
      type: np.type,
      label: np.label,
      normalizedLabel,
      teamId,
      athleteId,
      nationId,
      startNumber: np.startNumber ?? null,
    })
    .onConflictDoUpdate({
      target: [participant.categoryId, participant.normalizedLabel],
      set: {
        label: np.label,
        teamId,
        athleteId,
        nationId,
        startNumber: np.startNumber ?? null,
      },
    })
    .returning({ id: participant.id });
  const participantId = row.id;

  if (np.nativeId) {
    await recordSourceRef(
      db,
      source,
      "participant",
      participantId,
      np.nativeId,
    );
  }

  // Roster members (independent of each other → resolved concurrently).
  // provenance='scraped'; NEVER clobber a crowdsourced/merged row — the
  // setWhere guard restricts the update to scraped rows only.
  await Promise.all(
    np.members.map(async (member) => {
      const [memberAthleteId, horseId] = await Promise.all([
        resolveAthlete(db, member, nationId, caches),
        member.horse ? resolveHorse(db, member.horse, caches) : null,
      ]);
      await db
        .insert(participantMember)
        .values({
          participantId,
          athleteId: memberAthleteId,
          horseId,
          provenance: "scraped",
        })
        .onConflictDoUpdate({
          target: [
            participantMember.participantId,
            participantMember.athleteId,
          ],
          set: { horseId },
          setWhere: eq(participantMember.provenance, "scraped"),
        });
    }),
  );

  return participantId;
}

/** Resolve a raw game name to a canonical game id via game_alias (get-or-create). */
function resolveGame(
  db: PersistDb,
  source: SourceKind,
  rawName: string,
  caches: ResolveCaches,
): Promise<number> {
  const normalizedName = normalizeKey(rawName);
  return memoize(caches.game, normalizedName, async () => {
    // Canonical game (unique on normalized_name, shared across sources).
    await db
      .insert(game)
      .values({ canonicalName: rawName, normalizedName })
      .onConflictDoNothing({ target: game.normalizedName });
    const [g] = await db
      .select({ id: game.id })
      .from(game)
      .where(eq(game.normalizedName, normalizedName))
      .limit(1);
    const gameId = g.id;

    // Per-source alias (unique on source+normalized_name).
    await db
      .insert(gameAlias)
      .values({ gameId, source, rawName, normalizedName })
      .onConflictDoNothing({
        target: [gameAlias.source, gameAlias.normalizedName],
      });

    return gameId;
  });
}

/**
 * result unique is (participant_id, phase_id, heat_id), but Postgres treats NULL
 * heat_id as DISTINCT, so onConflict would NOT dedup heatless results. We
 * therefore resolve by select (heat_id IS NULL aware) then insert/update, which
 * is idempotent for both heated and heatless rows.
 */
async function upsertResult(
  db: PersistDb,
  participantId: number,
  phaseId: number,
  heatId: number | null,
  r: NormalizedResult,
): Promise<number> {
  const existing = await db
    .select({ id: result.id })
    .from(result)
    .where(
      and(
        eq(result.participantId, participantId),
        eq(result.phaseId, phaseId),
        heatId === null ? isNull(result.heatId) : eq(result.heatId, heatId),
      ),
    )
    .limit(1);

  const values = {
    pointsTotal: num(r.pointsTotal),
    penaltyPoints: r.penaltyPoints != null ? num(r.penaltyPoints) : null,
    rank: r.rank ?? null,
    isTie: r.isTie ?? false,
  };

  if (existing[0]) {
    await db.update(result).set(values).where(eq(result.id, existing[0].id));
    return existing[0].id;
  }
  const [row] = await db
    .insert(result)
    .values({ participantId, phaseId, heatId, ...values })
    .returning({ id: result.id });
  return row.id;
}

async function upsertGameResults(
  db: PersistDb,
  source: SourceKind,
  resultId: number,
  r: NormalizedResult,
  caches: ResolveCaches,
): Promise<void> {
  // Each game row is independent → resolve + upsert concurrently.
  await Promise.all(
    r.games.map(async (gs) => {
      const gameId = await resolveGame(db, source, gs.game, caches);
      await db
        .insert(gameResult)
        .values({
          resultId,
          gameId,
          points: num(gs.points),
          ordinal: gs.ordinal,
        })
        .onConflictDoUpdate({
          target: [gameResult.resultId, gameResult.gameId],
          set: { points: num(gs.points), ordinal: gs.ordinal },
        });
    }),
  );
}

/**
 * Persist a normalized scrape idempotently. Resolution order (all keyed to allow
 * re-running a tick with no duplicates):
 *   1. nation (by code) → competition (by source + grouping_key) → category
 *      (by competition + format + age_band + pro + division), recording the
 *      per-source native id in `source_ref`.
 *   2. phase (by category + kind + ordinal) → heat (by phase + number).
 *   3. participant (by category + normalized_label) + team/athlete/horse
 *      identities (by normalized name), then participant_member rows
 *      (provenance = 'scraped'; never clobber 'crowdsourced'/'merged' rows).
 *   4. result (by participant + phase + heat) + game_result (by result + game),
 *      resolving game via game_alias (by source + normalized name).
 *
 * The neon-http driver does NOT support interactive `db.transaction()`, so this
 * is a sequence of idempotent upserts keyed on the schema's unique constraints
 * (with select-then-insert where only a non-unique index exists). Re-running the
 * same scrape converges to the same rows.
 *
 * Performance: because each statement is a separate neon-http round-trip, we
 * (a) memoize every identity resolve per scrape (`ResolveCaches`) so a shared
 * nation/game/athlete/phase is fetched once, and (b) run independent work
 * concurrently (participants, roster members, results, per-game rows). The two
 * stay correct together because the caches memoize the in-flight `Promise`, so
 * concurrent callers for the same key share one resolve instead of racing to
 * create duplicates. Ordering that IS required is preserved: competition →
 * category → participants → results run in sequence.
 *
 * `database` is injectable so the whole pipeline can run against an embedded
 * Postgres (pglite) in tests; it defaults to the shared neon-http client, which
 * is loaded lazily so importing this module never requires a live DATABASE_URL.
 */
export async function persistScrape(
  scrape: NormalizedScrape,
  database?: PersistDb,
): Promise<void> {
  if (!scrape.category.nativeId) {
    throw new Error(
      "persistScrape: scrape.category.nativeId is required for source_ref keying",
    );
  }
  const db = database ?? ((await import("@/db")).db as unknown as PersistDb);
  const caches = createCaches();

  const competitionId = await resolveCompetition(db, scrape, caches);
  const categoryId = await resolveCategory(db, competitionId, scrape);

  // Participants first: results join back to them by normalized label. They are
  // mutually independent, so resolve them concurrently.
  const participantIdByLabel = new Map<string, number>();
  await Promise.all(
    scrape.participants.map(async (np) => {
      const id = await resolveParticipant(
        db,
        categoryId,
        scrape.source,
        np,
        caches,
      );
      participantIdByLabel.set(normalizeKey(np.label), id);
    }),
  );

  await Promise.all(
    scrape.results.map(async (r) => {
      const key = normalizeKey(r.participantLabel);
      let participantId = participantIdByLabel.get(key);
      if (participantId === undefined) {
        // Result references a participant not present in this partial scrape;
        // resolve a thin participant so the score is not lost. Concurrent
        // thin-creations for the same label converge (onConflict on the label).
        participantId = await resolveParticipant(
          db,
          categoryId,
          scrape.source,
          {
            type: scrape.category.format,
            label: r.participantLabel,
            members: [],
          },
          caches,
        );
        participantIdByLabel.set(key, participantId);
      }

      const phaseId = await resolvePhase(db, categoryId, r.phase, caches);
      const heatId =
        r.heatNumber != null
          ? await resolveHeat(db, phaseId, r.heatNumber, caches)
          : null;
      const resultId = await upsertResult(
        db,
        participantId,
        phaseId,
        heatId,
        r,
      );
      await upsertGameResults(db, scrape.source, resultId, r, caches);
    }),
  );
}
