import { and, eq, inArray, isNull } from "drizzle-orm";
import { category, competition, phase } from "@/db/models/competition";
import { scrapeTarget } from "@/db/models/ingestion";
import { participant } from "@/db/models/participant";
import { game, nation } from "@/db/models/reference";
import { gameResult, result } from "@/db/models/result";
import type { PersistDb } from "@/lib/ingest/upsert";
import type {
  StandingsGameScore,
  StandingsPayload,
  StandingsPhaseRef,
  StandingsRow,
} from "./types";

/**
 * Cast a stored integer-cents score to a JS number in whole points (4850 → 48.5).
 * Kept here as the single read-layer conversion point (A8) so scores never leak
 * to the client as raw cents. Non-finite input degrades to 0 rather than NaN.
 */
export function toNumber(value: number | null): number {
  if (value === null) return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n / 100 : 0;
}

/** Advancement order of phase kinds (session → semifinal → final). */
const KIND_RANK: Record<StandingsPhaseRef["kind"], number> = {
  session: 0,
  semifinal: 1,
  final: 2,
};

/** Human label for a category: prefer the raw source label, else band + PRO. */
function categoryLabel(cat: {
  label: string | null;
  ageBand: string | null;
  pro: boolean;
  format: StandingsPayload["category"]["format"];
}): string {
  if (cat.label) return cat.label;
  const parts = [cat.ageBand, cat.pro ? "PRO" : null].filter((p): p is string =>
    Boolean(p),
  );
  return parts.length > 0 ? parts.join(" ") : cat.format;
}

/**
 * Read model for a category's standings, served verbatim by
 * `GET /api/live/[categoryId]` and consumed by the Live scoreboard.
 *
 * Resolution:
 *  - category (+ competition name) and its phases (ordered session→semifinal→
 *    final, then by ordinal);
 *  - `activePhaseId` = `opts.phaseId` when given, else the highest-ordinal phase
 *    present (ties broken toward the more advanced kind), matching the "latest
 *    view" the scoreboard shows;
 *  - standings = every participant of the category LEFT-joined to its phase-total
 *    `result` (heat_id IS NULL) at the active phase, plus the per-game breakdown
 *    (canonical game name), ordered by rank (nulls last) then pointsTotal desc.
 *    Participants not yet scored at the active phase surface at the bottom with 0.
 *
 * `isLive` (best-effort): the poller flags `scrape_target` rows live/idle from
 * each source's own "current competitions" list (spec 01-ingestion). A
 * `scrape_target` links to a category, not a competition, so we derive
 * competition liveness as: ANY scrape_target belonging to ANY category of this
 * category's competition is currently `is_live`. `updatedAt` is the most recent
 * `last_scraped_at` across those same targets, falling back to now.
 *
 * `database` is injectable (defaults to the shared handle from `@/db`, loaded
 * lazily) so this is exercisable against in-memory SQLite in tests — same pattern
 * as `persistScrape`. Returns `null` when the category does not exist.
 */
export async function getCategoryStandings(
  categoryId: number,
  opts?: { phaseId?: number },
  database?: PersistDb,
): Promise<StandingsPayload | null> {
  const db = database ?? ((await import("@/db")).db as unknown as PersistDb);

  const [cat] = await db
    .select({
      id: category.id,
      competitionId: category.competitionId,
      competitionName: competition.name,
      format: category.format,
      ageBand: category.ageBand,
      pro: category.pro,
      label: category.label,
    })
    .from(category)
    .innerJoin(competition, eq(competition.id, category.competitionId))
    .where(eq(category.id, categoryId))
    .limit(1);

  if (!cat) return null;

  // Phases, ordered by kind (enum declaration order) then ordinal.
  const phases: StandingsPhaseRef[] = await db
    .select({
      id: phase.id,
      kind: phase.kind,
      ordinal: phase.ordinal,
      label: phase.label,
    })
    .from(phase)
    .where(eq(phase.categoryId, categoryId))
    .orderBy(phase.kind, phase.ordinal);

  // Active phase: explicit override, else highest-ordinal (most advanced) phase.
  const mostAdvanced = [...phases].sort((a, b) => {
    if (b.ordinal !== a.ordinal) return b.ordinal - a.ordinal;
    return KIND_RANK[b.kind] - KIND_RANK[a.kind];
  })[0];
  const activePhaseId = opts?.phaseId ?? mostAdvanced?.id ?? 0;

  // Participants + their phase-total result (heat_id IS NULL) + nation.
  const rows = await db
    .select({
      participantId: participant.id,
      type: participant.type,
      label: participant.label,
      nationCode: nation.code,
      nationName: nation.name,
      resultId: result.id,
      pointsTotal: result.pointsTotalCents,
      penaltyPoints: result.penaltyPointsCents,
      rank: result.rank,
      isTie: result.isTie,
    })
    .from(participant)
    .leftJoin(
      result,
      and(
        eq(result.participantId, participant.id),
        eq(result.phaseId, activePhaseId),
        isNull(result.heatId),
      ),
    )
    .leftJoin(nation, eq(nation.id, participant.nationId))
    .where(eq(participant.categoryId, categoryId));

  // Per-game breakdown for the results present, grouped by result id.
  const resultIds = rows
    .map((r) => r.resultId)
    .filter((id): id is number => id !== null);
  const gamesByResult = new Map<number, StandingsGameScore[]>();
  if (resultIds.length > 0) {
    const gameRows = await db
      .select({
        resultId: gameResult.resultId,
        name: game.canonicalName,
        points: gameResult.pointsCents,
        ordinal: gameResult.ordinal,
      })
      .from(gameResult)
      .innerJoin(game, eq(game.id, gameResult.gameId))
      .where(inArray(gameResult.resultId, resultIds))
      .orderBy(gameResult.ordinal);
    for (const g of gameRows) {
      const list = gamesByResult.get(g.resultId) ?? [];
      list.push({ name: g.name, points: toNumber(g.points) });
      gamesByResult.set(g.resultId, list);
    }
  }

  const standings: StandingsRow[] = rows
    .map((r) => ({
      participantId: r.participantId,
      type: r.type,
      label: r.label,
      nation:
        r.nationCode !== null
          ? { code: r.nationCode, name: r.nationName ?? r.nationCode }
          : undefined,
      rank: r.rank ?? null,
      pointsTotal: r.pointsTotal !== null ? toNumber(r.pointsTotal) : 0,
      penaltyPoints:
        r.penaltyPoints !== null ? toNumber(r.penaltyPoints) : null,
      isTie: r.isTie ?? false,
      games: r.resultId !== null ? (gamesByResult.get(r.resultId) ?? []) : [],
    }))
    .sort((a, b) => {
      const ra = a.rank ?? Number.POSITIVE_INFINITY;
      const rb = b.rank ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return b.pointsTotal - a.pointsTotal;
    });

  // Live-window + freshness: aggregate the competition's scrape targets.
  const targets = await db
    .select({
      isLive: scrapeTarget.isLive,
      lastScrapedAt: scrapeTarget.lastScrapedAt,
    })
    .from(scrapeTarget)
    .innerJoin(category, eq(category.id, scrapeTarget.categoryId))
    .where(eq(category.competitionId, cat.competitionId));

  const isLive = targets.some((t) => t.isLive);
  const lastScraped = targets.reduce<Date | null>((acc, t) => {
    if (!t.lastScrapedAt) return acc;
    return acc === null || t.lastScrapedAt > acc ? t.lastScrapedAt : acc;
  }, null);

  return {
    category: {
      id: cat.id,
      competitionName: cat.competitionName,
      label: categoryLabel(cat),
      format: cat.format,
      ageBand: cat.ageBand,
      pro: cat.pro,
    },
    phases,
    activePhaseId,
    standings,
    updatedAt: (lastScraped ?? new Date()).toISOString(),
    isLive,
  };
}
