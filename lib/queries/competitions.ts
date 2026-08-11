import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { category, competition, phase } from "@/db/models/competition";
import { nation } from "@/db/models/reference";
import type { PersistDb } from "@/lib/ingest/upsert";
import type { CompetitionFormat, PhaseKind } from "@/lib/scrapers/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompetitionListFilter {
  nationCode?: string;
  format?: CompetitionFormat;
  from?: string;
  to?: string;
}

export interface CompetitionListRow {
  id: number;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  nation: string | null;
  level: string | null;
  categoryCount: number;
}

export interface CompetitionCategoryRef {
  id: number;
  format: CompetitionFormat;
  ageBand: string | null;
  pro: boolean;
  label: string;
  phases: CompetitionPhaseRef[];
}

export interface CompetitionPhaseRef {
  id: number;
  kind: PhaseKind;
  ordinal: number;
  label: string;
}

export interface CompetitionDetail {
  id: number;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  nation: string | null;
  level: string | null;
  organizer: string | null;
  categories: CompetitionCategoryRef[];
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Archive listing: competitions ordered by date desc with category count.
 * Supports optional filtering by nation, format, and date range.
 */
export async function listCompetitions(
  filter?: CompetitionListFilter,
  database?: PersistDb,
): Promise<CompetitionListRow[]> {
  const db = database ?? ((await import("@/db")).db as unknown as PersistDb);

  const conditions = [];

  if (filter?.nationCode) {
    conditions.push(eq(nation.code, filter.nationCode));
  }
  if (filter?.format) {
    conditions.push(eq(category.format, filter.format));
  }
  if (filter?.from) {
    conditions.push(gte(competition.startsOn, filter.from));
  }
  if (filter?.to) {
    conditions.push(lte(competition.startsOn, filter.to));
  }

  const rows = await db
    .select({
      id: competition.id,
      name: competition.name,
      startsOn: competition.startsOn,
      endsOn: competition.endsOn,
      nationName: nation.name,
      level: competition.level,
      categoryCount: sql<number>`count(distinct ${category.id})::int`.as(
        "category_count",
      ),
    })
    .from(competition)
    .leftJoin(nation, eq(nation.id, competition.nationId))
    .innerJoin(category, eq(category.competitionId, competition.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(
      competition.id,
      competition.name,
      competition.startsOn,
      competition.endsOn,
      nation.name,
      competition.level,
    )
    .orderBy(desc(competition.startsOn), desc(competition.id));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    startsOn: r.startsOn,
    endsOn: r.endsOn,
    nation: r.nationName,
    level: r.level,
    categoryCount: r.categoryCount,
  }));
}

/**
 * Competition drill-in: full competition with its categories, each enriched
 * with their phases (ordered by kind → ordinal). Returns null if not found.
 */
export async function getCompetition(
  id: number,
  database?: PersistDb,
): Promise<CompetitionDetail | null> {
  const db = database ?? ((await import("@/db")).db as unknown as PersistDb);

  const [comp] = await db
    .select({
      id: competition.id,
      name: competition.name,
      startsOn: competition.startsOn,
      endsOn: competition.endsOn,
      nationName: nation.name,
      level: competition.level,
      organizer: competition.organizer,
    })
    .from(competition)
    .leftJoin(nation, eq(nation.id, competition.nationId))
    .where(eq(competition.id, id))
    .limit(1);

  if (!comp) return null;

  // Categories of this competition.
  const cats = await db
    .select({
      id: category.id,
      format: category.format,
      ageBand: category.ageBand,
      pro: category.pro,
      label: category.label,
    })
    .from(category)
    .where(eq(category.competitionId, id));

  // Phases for all categories in one query.
  const catIds = cats.map((c) => c.id);
  let phasesAll: {
    id: number;
    categoryId: number;
    kind: PhaseKind;
    ordinal: number;
    label: string;
  }[] = [];
  if (catIds.length > 0) {
    const { inArray } = await import("drizzle-orm");
    phasesAll = await db
      .select({
        id: phase.id,
        categoryId: phase.categoryId,
        kind: phase.kind,
        ordinal: phase.ordinal,
        label: phase.label,
      })
      .from(phase)
      .where(inArray(phase.categoryId, catIds))
      .orderBy(phase.kind, phase.ordinal);
  }

  // Group phases by category.
  const phasesByCategory = new Map<number, CompetitionPhaseRef[]>();
  for (const p of phasesAll) {
    const list = phasesByCategory.get(p.categoryId) ?? [];
    list.push({ id: p.id, kind: p.kind, ordinal: p.ordinal, label: p.label });
    phasesByCategory.set(p.categoryId, list);
  }

  const categories: CompetitionCategoryRef[] = cats.map((c) => ({
    id: c.id,
    format: c.format,
    ageBand: c.ageBand,
    pro: c.pro,
    label:
      c.label ??
      ([c.ageBand, c.pro ? "PRO" : null].filter(Boolean).join(" ") || c.format),
    phases: phasesByCategory.get(c.id) ?? [],
  }));

  return {
    id: comp.id,
    name: comp.name,
    startsOn: comp.startsOn,
    endsOn: comp.endsOn,
    nation: comp.nationName,
    level: comp.level,
    organizer: comp.organizer,
    categories,
  };
}
