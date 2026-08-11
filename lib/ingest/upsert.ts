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

async function resolveNation(db: PersistDb, ref: NationRef): Promise<number> {
  const code = ref.code.trim();
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

  const nationId = c.nation ? await resolveNation(db, c.nation) : null;
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

async function resolvePhase(
  db: PersistDb,
  categoryId: number,
  ref: NormalizedResult["phase"],
): Promise<number> {
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
}

async function resolveHeat(
  db: PersistDb,
  phaseId: number,
  number: number,
): Promise<number> {
  const [row] = await db
    .insert(heat)
    .values({ phaseId, number })
    .onConflictDoUpdate({
      target: [heat.phaseId, heat.number],
      set: { number },
    })
    .returning({ id: heat.id });
  return row.id;
}

/** team identity by normalized name (no unique constraint → select-then-insert). */
async function resolveTeam(
  db: PersistDb,
  label: string,
  nationId: number | null,
  isClub: boolean,
): Promise<number> {
  const normalizedName = normalizeKey(label);
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
}

/** athlete identity by normalized name (unique → onConflict). */
async function resolveAthlete(
  db: PersistDb,
  member: NormalizedMember,
  nationId: number | null,
): Promise<number> {
  const normalizedName = normalizeKey(memberDisplayName(member));
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
}

/** horse identity by normalized name (unique → onConflict). */
async function resolveHorse(db: PersistDb, name: string): Promise<number> {
  const normalizedName = normalizeKey(name);
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
}

async function resolveParticipant(
  db: PersistDb,
  categoryId: number,
  source: SourceKind,
  np: NormalizedParticipant,
): Promise<number> {
  const normalizedLabel = normalizeKey(np.label);
  const nationId = np.nation ? await resolveNation(db, np.nation) : null;

  // Fast-path identity links: team for squads/pairs, athlete for individuals.
  let teamId: number | null = null;
  let athleteId: number | null = null;
  if (np.type === "individual" && np.members[0]) {
    athleteId = await resolveAthlete(db, np.members[0], nationId);
  } else if (np.type === "team" || np.type === "pair") {
    teamId = await resolveTeam(
      db,
      np.label,
      nationId,
      source === "pmglivescore",
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

  // Roster members. provenance='scraped'; NEVER clobber a crowdsourced/merged
  // row — the setWhere guard restricts the update to scraped rows only.
  for (const member of np.members) {
    const memberAthleteId = await resolveAthlete(db, member, nationId);
    const horseId = member.horse ? await resolveHorse(db, member.horse) : null;
    await db
      .insert(participantMember)
      .values({
        participantId,
        athleteId: memberAthleteId,
        horseId,
        provenance: "scraped",
      })
      .onConflictDoUpdate({
        target: [participantMember.participantId, participantMember.athleteId],
        set: { horseId },
        setWhere: eq(participantMember.provenance, "scraped"),
      });
  }

  return participantId;
}

/** Resolve a raw game name to a canonical game id via game_alias (get-or-create). */
async function resolveGame(
  db: PersistDb,
  source: SourceKind,
  rawName: string,
): Promise<number> {
  const normalizedName = normalizeKey(rawName);

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
): Promise<void> {
  for (const gs of r.games) {
    const gameId = await resolveGame(db, source, gs.game);
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
  }
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

  const competitionId = await resolveCompetition(db, scrape);
  const categoryId = await resolveCategory(db, competitionId, scrape);

  // Participants first: results join back to them by normalized label.
  const participantIdByLabel = new Map<string, number>();
  for (const np of scrape.participants) {
    const id = await resolveParticipant(db, categoryId, scrape.source, np);
    participantIdByLabel.set(normalizeKey(np.label), id);
  }

  for (const r of scrape.results) {
    const participantId = participantIdByLabel.get(
      normalizeKey(r.participantLabel),
    );
    if (participantId === undefined) {
      // Result references a participant not present in this partial scrape;
      // resolve a thin participant so the score is not lost.
      const thin = await resolveParticipant(db, categoryId, scrape.source, {
        type: scrape.category.format,
        label: r.participantLabel,
        members: [],
      });
      participantIdByLabel.set(normalizeKey(r.participantLabel), thin);
    }
    const pid =
      participantId ??
      (participantIdByLabel.get(normalizeKey(r.participantLabel)) as number);

    const phaseId = await resolvePhase(db, categoryId, r.phase);
    const heatId =
      r.heatNumber != null
        ? await resolveHeat(db, phaseId, r.heatNumber)
        : null;
    const resultId = await upsertResult(db, pid, phaseId, heatId, r);
    await upsertGameResults(db, scrape.source, resultId, r);
  }
}
