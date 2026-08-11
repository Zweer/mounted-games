import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { category, competition, phase } from "@/db/models/competition";
import { scrapeTarget } from "@/db/models/ingestion";
import { participant } from "@/db/models/participant";
import { result } from "@/db/models/result";
import type { PersistDb } from "@/lib/ingest/upsert";
import type { CompetitionFormat } from "@/lib/scrapers/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiveCategoryRow {
  categoryId: number;
  competitionName: string;
  categoryLabel: string;
  format: CompetitionFormat;
  /** Leader participant label (first rank 1 at the most advanced phase). */
  leaderLabel?: string;
  /** Label of the most advanced phase currently scored. */
  activePhaseLabel?: string;
}

export interface RecentResultRow {
  categoryId: number;
  competitionName: string;
  categoryLabel: string;
  format: CompetitionFormat;
  /** Winner (rank 1) label at the most advanced phase. */
  winnerLabel: string | null;
  /** Competition end date (ISO string) or last-scraped-at. */
  date: string;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Categories whose competition currently has a live scrape_target — the "Live
 * Now" section on the Home page. Returns one row per live category, enriched
 * with the leader label and active phase label.
 */
export async function getLiveCategories(
  database?: PersistDb,
): Promise<LiveCategoryRow[]> {
  const db = database ?? ((await import("@/db")).db as unknown as PersistDb);

  // Categories that have at least one live scrape_target.
  const liveCategories = await db
    .selectDistinct({
      categoryId: category.id,
      competitionName: competition.name,
      format: category.format,
      label: category.label,
      ageBand: category.ageBand,
      pro: category.pro,
    })
    .from(scrapeTarget)
    .innerJoin(category, eq(category.id, scrapeTarget.categoryId))
    .innerJoin(competition, eq(competition.id, category.competitionId))
    .where(eq(scrapeTarget.isLive, true));

  if (liveCategories.length === 0) return [];

  const rows: LiveCategoryRow[] = [];

  for (const cat of liveCategories) {
    // Most advanced phase (highest ordinal, break ties by kind rank).
    const [latestPhase] = await db
      .select({ id: phase.id, label: phase.label })
      .from(phase)
      .where(eq(phase.categoryId, cat.categoryId))
      .orderBy(desc(phase.ordinal))
      .limit(1);

    let leaderLabel: string | undefined;
    if (latestPhase) {
      // Leader: rank 1 at the latest phase (phase-total = heat_id IS NULL).
      const [leader] = await db
        .select({ label: participant.label })
        .from(result)
        .innerJoin(participant, eq(participant.id, result.participantId))
        .where(
          and(
            eq(result.phaseId, latestPhase.id),
            isNull(result.heatId),
            eq(result.rank, 1),
          ),
        )
        .limit(1);
      leaderLabel = leader?.label;
    }

    const categoryLabel =
      cat.label ??
      ([cat.ageBand, cat.pro ? "PRO" : null].filter(Boolean).join(" ") ||
        cat.format);

    rows.push({
      categoryId: cat.categoryId,
      competitionName: cat.competitionName,
      categoryLabel,
      format: cat.format,
      leaderLabel,
      activePhaseLabel: latestPhase?.label,
    });
  }

  return rows;
}

/**
 * Recently concluded categories: categories with results whose competition has
 * NO live scrape_target — sorted by competition end date (or last_scraped_at)
 * descending. Returns the winner (rank 1) label.
 */
export async function getRecentResults(
  limit = 10,
  database?: PersistDb,
): Promise<RecentResultRow[]> {
  const db = database ?? ((await import("@/db")).db as unknown as PersistDb);

  // Categories that have results but are NOT currently live.
  // We use a subquery approach: categories that have at least one result,
  // excluding those that have a live scrape_target.
  const rows = await db
    .select({
      categoryId: category.id,
      competitionName: competition.name,
      format: category.format,
      label: category.label,
      ageBand: category.ageBand,
      pro: category.pro,
      endsOn: competition.endsOn,
      lastScraped: sql<Date | null>`max(${scrapeTarget.lastScrapedAt})`.as(
        "last_scraped",
      ),
    })
    .from(category)
    .innerJoin(competition, eq(competition.id, category.competitionId))
    .innerJoin(
      result,
      eq(
        result.participantId,
        sql`(
      SELECT p.id FROM participant p WHERE p.category_id = ${category.id} LIMIT 1
    )`,
      ),
    )
    .leftJoin(scrapeTarget, eq(scrapeTarget.categoryId, category.id))
    .where(
      sql`NOT EXISTS (
        SELECT 1 FROM scrape_target st
        WHERE st.category_id = ${category.id} AND st.is_live = true
      )`,
    )
    .groupBy(
      category.id,
      competition.name,
      category.format,
      category.label,
      category.ageBand,
      category.pro,
      competition.endsOn,
    )
    .orderBy(desc(competition.endsOn))
    .limit(limit);

  // For each category, resolve the winner (rank 1 at most advanced phase).
  const results: RecentResultRow[] = [];

  for (const row of rows) {
    const [latestPhase] = await db
      .select({ id: phase.id })
      .from(phase)
      .where(eq(phase.categoryId, row.categoryId))
      .orderBy(desc(phase.ordinal))
      .limit(1);

    let winnerLabel: string | null = null;
    if (latestPhase) {
      const [winner] = await db
        .select({ label: participant.label })
        .from(result)
        .innerJoin(participant, eq(participant.id, result.participantId))
        .where(
          and(
            eq(result.phaseId, latestPhase.id),
            isNull(result.heatId),
            eq(result.rank, 1),
          ),
        )
        .limit(1);
      winnerLabel = winner?.label ?? null;
    }

    const categoryLabel =
      row.label ??
      ([row.ageBand, row.pro ? "PRO" : null].filter(Boolean).join(" ") ||
        row.format);
    const date =
      row.endsOn ?? row.lastScraped?.toISOString() ?? new Date().toISOString();

    results.push({
      categoryId: row.categoryId,
      competitionName: row.competitionName,
      categoryLabel,
      format: row.format,
      winnerLabel,
      date: typeof date === "string" ? date : date,
    });
  }

  return results;
}
