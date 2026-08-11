/**
 * Shared normalization helpers. Both sources expose no stable ids for people,
 * horses or teams, so identity is resolved by a normalized name key. Keep this
 * the single source of truth for how a raw label becomes a lookup key.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  oslash: "ø",
  Oslash: "Ø",
};

/** Decode the HTML entities that appear in scraped labels / JSON blobs. */
export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(
      /&([a-zA-Z]+);/g,
      (whole, name: string) => NAMED_ENTITIES[name] ?? whole,
    );
}

/**
 * Compute an identity key from a raw display string: decode entities, NFC
 * normalize, straighten curly quotes/apostrophes, collapse whitespace, trim and
 * case-fold. Use this for `normalized_name` / `normalized_label` columns.
 */
export function normalizeKey(raw: string): string {
  return decodeEntities(raw)
    .normalize("NFC")
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Human-facing cleanup (decode + straighten + collapse) without case-folding. */
export function cleanDisplay(raw: string): string {
  return decodeEntities(raw)
    .normalize("NFC")
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a score cell into a number. Scores can be decimal (`48.5`, `27.5`).
 * Returns `null` for empty / not-yet-scored cells (`-`, ``).
 */
export function parseScore(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.,-]/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "-") return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}
