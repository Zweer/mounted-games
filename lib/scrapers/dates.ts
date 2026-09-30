/**
 * Date parsing for the source list pages. Neither source exposes a machine date
 * on the event/competition page itself — it lives on the *list* pages (mg
 * archive month panels + day badge, mg upcoming inline, pmg home cards) — so
 * these helpers turn those human strings into ISO `YYYY-MM-DD`, returning `null`
 * on anything unrecognized (dates degrade gracefully; they never throw).
 *
 * Month names are matched across English, German AND Italian because mg archive
 * headings are a mix of English/German (e.g. `August 2026`, `Juli 2026`) and pmg
 * cards are Italian (`20 Giugno 2026`).
 */

/** Full + common-abbreviation month names (EN / DE / IT) → 1..12. */
const MONTHS: Record<string, number> = {
  // January
  january: 1,
  jan: 1,
  januar: 1,
  gennaio: 1,
  gen: 1,
  // February
  february: 2,
  feb: 2,
  februar: 2,
  febbraio: 2,
  // March
  march: 3,
  mar: 3,
  märz: 3,
  maerz: 3,
  mär: 3,
  marzo: 3,
  // April
  april: 4,
  apr: 4,
  aprile: 4,
  // May
  may: 5,
  mai: 5,
  maggio: 5,
  mag: 5,
  // June
  june: 6,
  jun: 6,
  juni: 6,
  giugno: 6,
  giu: 6,
  // July
  july: 7,
  jul: 7,
  juli: 7,
  luglio: 7,
  lug: 7,
  // August
  august: 8,
  aug: 8,
  agosto: 8,
  ago: 8,
  // September
  september: 9,
  sep: 9,
  sept: 9,
  settembre: 9,
  set: 9,
  // October
  october: 10,
  oct: 10,
  okt: 10,
  oktober: 10,
  ottobre: 10,
  ott: 10,
  // November
  november: 11,
  nov: 11,
  novembre: 11,
  // December
  december: 12,
  dec: 12,
  dez: 12,
  dezember: 12,
  dicembre: 12,
  dic: 12,
};

function monthNumber(name: string): number | null {
  const key = name.trim().toLowerCase().replace(/\.$/, "");
  return MONTHS[key] ?? null;
}

function toIso(year: number, month: number, day: number): string | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const y = year < 100 ? year + 2000 : year;
  return `${String(y).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * mg archive: a month-panel heading (`August 2026`, `Juli 2026`) + a day taken
 * from the event link's `span.badge` (`03`). → `2026-08-03`.
 */
export function parseListDate(
  monthYearHeading: string,
  day: string | number,
): string | null {
  const m = monthYearHeading.trim().match(/^(\p{L}+)\.?\s+(\d{4})$/u);
  if (!m) return null;
  const month = monthNumber(m[1]);
  if (month === null) return null;
  return toIso(Number(m[2]), month, Number(day));
}

/**
 * mg archive/upcoming month panels, in the design's explicit
 * `(monthName, day, year)` shape: a GERMAN (or English) month name — the
 * headings stay German under `language=en` — a day-of-month, and the panel's
 * 4-digit year, → ISO `YYYY-MM-DD`. Thin wrapper over {@link parseListDate}
 * (which takes the `"<month> <year>"` heading verbatim), provided so callers
 * that have the three parts separately (spec 04 R1) do not have to re-concatenate.
 */
export function parseGermanListDate(
  month: string,
  day: string | number,
  year: string | number,
): string | null {
  return parseListDate(`${month.trim()} ${year}`, day);
}

/**
 * mg upcoming list inline date: `19. Aug 26` → `2026-08-19` (2-digit year is
 * treated as 20xx).
 */
export function parseUpcomingDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\.\s*(\p{L}+)\.?\s*(\d{2,4})/u);
  if (!m) return null;
  const month = monthNumber(m[2]);
  if (month === null) return null;
  return toIso(Number(m[3]), month, Number(m[1]));
}

/**
 * A single Italian month-name text date: `21 Maggio 2026` → `2026-05-21`.
 * Pure over an already-extracted string (Phase C: extraction may move from
 * cheerio to HTMLRewriter, this logic does not). Month names are matched via
 * the shared EN/DE/IT table, so it also accepts the mixed-locale mg strings.
 * Returns `null` on anything unrecognized (dates degrade gracefully).
 */
export function parseItalianMonthDate(text: string): string | null {
  const m = text.trim().match(/(\d{1,2})\s+(\p{L}+)\.?\s+(\d{4})/u);
  if (!m) return null;
  const month = monthNumber(m[2]);
  if (month === null) return null;
  return toIso(Number(m[3]), month, Number(m[1]));
}

/**
 * A single Italian numeric date: `21/06/2026` → `2026-06-21` (the `DD/MM/YYYY`
 * form on pmg's `live-info-gara` `Inizio`/`Fine` fields). Also tolerates `-`
 * or `.` separators and a 2-digit year (treated as 20xx). Pure over an
 * already-extracted string. Returns `null` on anything unrecognized.
 */
export function parseItalianNumericDate(text: string): string | null {
  const m = text.trim().match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!m) return null;
  return toIso(Number(m[3]), Number(m[2]), Number(m[1]));
}

/**
 * A single Italian/EU text date: `20 Giugno 2026` → `2026-06-20`. Retained name
 * for existing callers; delegates to {@link parseItalianMonthDate}.
 */
export function parseTextDate(text: string): string | null {
  return parseItalianMonthDate(text);
}

/**
 * pmg card / header date, possibly a range, in EITHER the capitalized
 * Italian-month form (`20 Giugno 2026 - 21 Giugno 2026`, home `.gara-date` and
 * the `.pmg-competition-dates` header) OR the numeric `DD/MM/YYYY` form
 * (`live-info-gara` `Inizio` - `Fine`) →
 * `{ startsOn: "2026-06-20", endsOn: "2026-06-21" }`. A single date yields only
 * `startsOn`. Unparseable input yields an empty object.
 */
export function parseDateRange(text: string): {
  startsOn?: string;
  endsOn?: string;
} {
  const parts = text.split(/\s[-–—]\s/).map((p) => p.trim());
  const parseOne = (s: string): string | undefined =>
    parseItalianMonthDate(s) ?? parseItalianNumericDate(s) ?? undefined;
  const startsOn = parseOne(parts[0] ?? "");
  const endsOn = parts.length > 1 ? parseOne(parts[1]) : undefined;
  const out: { startsOn?: string; endsOn?: string } = {};
  if (startsOn) out.startsOn = startsOn;
  if (endsOn) out.endsOn = endsOn;
  return out;
}
