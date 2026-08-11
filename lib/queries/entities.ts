import { and, eq, isNull } from "drizzle-orm";
import { category, competition, phase } from "@/db/models/competition";
import {
  athlete,
  horse,
  participant,
  participantMember,
  team,
} from "@/db/models/participant";
import { nation } from "@/db/models/reference";
import { result } from "@/db/models/result";
import type { PersistDb } from "@/lib/ingest/upsert";
import { toNumber } from "./standings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParticipationHistoryRow {
  competitionName: string;
  categoryLabel: string;
  phaseLabel: string | null;
  rank: number | null;
  points: number | null;
}

export interface HeadlineStats {
  appearances: number;
  bestPlacementRank: number | null;
}

export interface AthleteProfile {
  id: number;
  familyName: string;
  givenName: string | null;
  nation: { code: string; name: string } | null;
  participationHistory: ParticipationHistoryRow[];
  headlineStats: HeadlineStats;
}

export interface HorseProfile {
  id: number;
  name: string;
  participationHistory: ParticipationHistoryRow[];
  headlineStats: HeadlineStats;
}

export interface TeamProfile {
  id: number;
  name: string;
  isClub: boolean;
  nation: { code: string; name: string } | null;
  participationHistory: ParticipationHistoryRow[];
  headlineStats: HeadlineStats;
}

export interface NationProfile {
  code: string;
  name: string;
  participationHistory: ParticipationHistoryRow[];
  headlineStats: HeadlineStats;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve participation history for a set of participant ids: join result →
 * phase → category → competition. Returns only phase-total results (heat IS
 * NULL), ordered by competition name, then phase ordinal.
 */
async function participationForParticipants(
  participantIds: number[],
  db: PersistDb,
): Promise<ParticipationHistoryRow[]> {
  if (participantIds.length === 0) return [];

  const { inArray } = await import("drizzle-orm");

  const rows = await db
    .select({
      competitionName: competition.name,
      categoryLabel: category.label,
      ageBand: category.ageBand,
      pro: category.pro,
      format: category.format,
      phaseLabel: phase.label,
      rank: result.rank,
      pointsTotal: result.pointsTotal,
    })
    .from(result)
    .innerJoin(participant, eq(participant.id, result.participantId))
    .innerJoin(phase, eq(phase.id, result.phaseId))
    .innerJoin(category, eq(category.id, participant.categoryId))
    .innerJoin(competition, eq(competition.id, category.competitionId))
    .where(
      and(inArray(result.participantId, participantIds), isNull(result.heatId)),
    )
    .orderBy(competition.name, phase.ordinal);

  return rows.map((r) => ({
    competitionName: r.competitionName,
    categoryLabel:
      r.categoryLabel ??
      ([r.ageBand, r.pro ? "PRO" : null].filter(Boolean).join(" ") || r.format),
    phaseLabel: r.phaseLabel,
    rank: r.rank,
    points: r.pointsTotal !== null ? toNumber(r.pointsTotal) : null,
  }));
}

function computeStats(history: ParticipationHistoryRow[]): HeadlineStats {
  const appearances = history.length;
  const ranks = history
    .map((h) => h.rank)
    .filter((r): r is number => r !== null);
  const bestPlacementRank = ranks.length > 0 ? Math.min(...ranks) : null;
  return { appearances, bestPlacementRank };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Athlete profile with participation history resolved via participant_member →
 * participant → result. Returns null if athlete not found.
 */
export async function getAthlete(
  id: number,
  database?: PersistDb,
): Promise<AthleteProfile | null> {
  const db = database ?? ((await import("@/db")).db as unknown as PersistDb);

  const [ath] = await db
    .select({
      id: athlete.id,
      familyName: athlete.familyName,
      givenName: athlete.givenName,
      nationCode: nation.code,
      nationName: nation.name,
    })
    .from(athlete)
    .leftJoin(nation, eq(nation.id, athlete.nationId))
    .where(eq(athlete.id, id))
    .limit(1);

  if (!ath) return null;

  // Find all participants this athlete is a member of.
  const memberships = await db
    .select({ participantId: participantMember.participantId })
    .from(participantMember)
    .where(eq(participantMember.athleteId, id));

  const participantIds = memberships.map((m) => m.participantId);
  const participationHistory = await participationForParticipants(
    participantIds,
    db,
  );
  const headlineStats = computeStats(participationHistory);

  return {
    id: ath.id,
    familyName: ath.familyName,
    givenName: ath.givenName,
    nation:
      ath.nationCode !== null
        ? { code: ath.nationCode, name: ath.nationName ?? ath.nationCode }
        : null,
    participationHistory,
    headlineStats,
  };
}

/**
 * Horse profile with participation history resolved via participant_member →
 * participant → result. Returns null if horse not found.
 */
export async function getHorse(
  id: number,
  database?: PersistDb,
): Promise<HorseProfile | null> {
  const db = database ?? ((await import("@/db")).db as unknown as PersistDb);

  const [h] = await db
    .select({ id: horse.id, name: horse.name })
    .from(horse)
    .where(eq(horse.id, id))
    .limit(1);

  if (!h) return null;

  // Find all participants this horse is a member of.
  const memberships = await db
    .select({ participantId: participantMember.participantId })
    .from(participantMember)
    .where(eq(participantMember.horseId, id));

  const participantIds = memberships.map((m) => m.participantId);
  const participationHistory = await participationForParticipants(
    participantIds,
    db,
  );
  const headlineStats = computeStats(participationHistory);

  return {
    id: h.id,
    name: h.name,
    participationHistory,
    headlineStats,
  };
}

/**
 * Team profile with participation history resolved via participant.teamId →
 * result. Returns null if team not found.
 */
export async function getTeam(
  id: number,
  database?: PersistDb,
): Promise<TeamProfile | null> {
  const db = database ?? ((await import("@/db")).db as unknown as PersistDb);

  const [t] = await db
    .select({
      id: team.id,
      name: team.name,
      isClub: team.isClub,
      nationCode: nation.code,
      nationName: nation.name,
    })
    .from(team)
    .leftJoin(nation, eq(nation.id, team.nationId))
    .where(eq(team.id, id))
    .limit(1);

  if (!t) return null;

  // Find all participants linked to this team.
  const parts = await db
    .select({ id: participant.id })
    .from(participant)
    .where(eq(participant.teamId, id));

  const participantIds = parts.map((p) => p.id);
  const participationHistory = await participationForParticipants(
    participantIds,
    db,
  );
  const headlineStats = computeStats(participationHistory);

  return {
    id: t.id,
    name: t.name,
    isClub: t.isClub,
    nation:
      t.nationCode !== null
        ? { code: t.nationCode, name: t.nationName ?? t.nationCode }
        : null,
    participationHistory,
    headlineStats,
  };
}

/**
 * Nation profile with participation history resolved via participant.nationId →
 * result. Returns null if nation not found.
 */
export async function getNation(
  code: string,
  database?: PersistDb,
): Promise<NationProfile | null> {
  const db = database ?? ((await import("@/db")).db as unknown as PersistDb);

  const [n] = await db
    .select({ id: nation.id, code: nation.code, name: nation.name })
    .from(nation)
    .where(eq(nation.code, code))
    .limit(1);

  if (!n) return null;

  // Find all participants with this nation.
  const parts = await db
    .select({ id: participant.id })
    .from(participant)
    .where(eq(participant.nationId, n.id));

  const participantIds = parts.map((p) => p.id);
  const participationHistory = await participationForParticipants(
    participantIds,
    db,
  );
  const headlineStats = computeStats(participationHistory);

  return {
    code: n.code,
    name: n.name,
    participationHistory,
    headlineStats,
  };
}
