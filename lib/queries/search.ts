import { like } from "drizzle-orm";
import { competition } from "@/db/models/competition";
import { athlete, horse, team } from "@/db/models/participant";
import type { PersistDb } from "@/lib/ingest/upsert";
import { normalizeKey } from "@/lib/normalize";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResultItem {
  id: number | string;
  label: string;
  subtitle?: string;
}

export interface SearchResults {
  athletes: SearchResultItem[];
  horses: SearchResultItem[];
  teams: SearchResultItem[];
  competitions: SearchResultItem[];
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/** Maximum results returned per group. */
const PER_GROUP_CAP = 10;

/**
 * Search across athlete, horse, team and competition by normalized name.
 * Uses a LIKE on normalized_name for each entity type (case-insensitive via
 * normalizeKey). Returns grouped results capped per group.
 */
export async function search(
  term: string,
  database?: PersistDb,
): Promise<SearchResults> {
  const db = database ?? ((await import("@/db")).db as unknown as PersistDb);

  const normalized = normalizeKey(term);
  if (normalized.length === 0) {
    return { athletes: [], horses: [], teams: [], competitions: [] };
  }

  const pattern = `%${normalized}%`;

  // Athletes.
  const athletes = await db
    .select({
      id: athlete.id,
      familyName: athlete.familyName,
      givenName: athlete.givenName,
    })
    .from(athlete)
    .where(like(athlete.normalizedName, pattern))
    .limit(PER_GROUP_CAP);

  // Horses.
  const horses = await db
    .select({ id: horse.id, name: horse.name })
    .from(horse)
    .where(like(horse.normalizedName, pattern))
    .limit(PER_GROUP_CAP);

  // Teams.
  const teams = await db
    .select({ id: team.id, name: team.name, isClub: team.isClub })
    .from(team)
    .where(like(team.normalizedName, pattern))
    .limit(PER_GROUP_CAP);

  // Competitions.
  const competitions = await db
    .select({ id: competition.id, name: competition.name })
    .from(competition)
    .where(like(competition.normalizedName, pattern))
    .limit(PER_GROUP_CAP);

  return {
    athletes: athletes.map((a) => ({
      id: a.id,
      label: [a.familyName, a.givenName].filter(Boolean).join(" "),
    })),
    horses: horses.map((h) => ({
      id: h.id,
      label: h.name,
    })),
    teams: teams.map((t) => ({
      id: t.id,
      label: t.name,
      subtitle: t.isClub ? "Club" : "Nation team",
    })),
    competitions: competitions.map((c) => ({
      id: c.id,
      label: c.name,
    })),
  };
}
