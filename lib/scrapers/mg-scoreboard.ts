import { type Cheerio, type CheerioAPI, load } from "cheerio";
import type { AnyNode } from "domhandler";
import { cleanDisplay, parseScore } from "../normalize";
import { fetchHtml } from "./http";
import type {
  CompetitionFormat,
  DiscoveredTarget,
  NationRef,
  NormalizedCategory,
  NormalizedCompetition,
  NormalizedGameScore,
  NormalizedMember,
  NormalizedParticipant,
  NormalizedPhaseRef,
  NormalizedResult,
  NormalizedScrape,
  ScrapeContext,
  Scraper,
} from "./types";

/**
 * mg-scoreboard.de scraper. HTML-only (no JSON feed); the polymorphic
 * participant carries a native `team_id` in every format (exposed only on the
 * Teams tab). See the scraping contract in `docs/sources/mg-scoreboard.md` for
 * URL patterns, selectors, per-format label shapes and the label→team_id join
 * gap.
 */
export const mgScoreboardScraper: Scraper = {
  source: "mg-scoreboard",

  fetch(url: string, signal: AbortSignal): Promise<string> {
    // Pin English UI strings with the `language=en` cookie (see contract).
    return fetchHtml(url, signal, { Cookie: "language=en" });
  },

  parse(html: string, ctx: ScrapeContext): NormalizedScrape {
    const $ = load(html);
    const title = eventTitle($);
    const format = detectFormat(title);
    const eventId = parseEventId(ctx.url);

    const competition = buildCompetition(title);
    const category = buildCategory(title, format, eventId);

    let participants: NormalizedParticipant[] = [];
    let results: NormalizedResult[] = [];

    switch (ctx.kind) {
      case "toplist": {
        const phase: NormalizedPhaseRef = {
          kind: "session",
          ordinal: 0,
          label: "Toplist",
          nativeParams: { view: "points_list" },
        };
        ({ participants, results } = parseToplist($, format, phase));
        break;
      }
      case "session": {
        const n = parseSessionNumber(ctx.url);
        const phase: NormalizedPhaseRef = {
          kind: "session",
          ordinal: n ?? 0,
          label: n != null ? `Session ${n}` : "Session",
          nativeParams: { session: n },
        };
        ({ participants, results } = parseGameTable($, phase, format));
        break;
      }
      case "final": {
        const { tier, heat } = parseFinalParams(ctx.url);
        const phase = buildFinalPhase(tier, heat);
        ({ participants, results } = parseGameTable($, phase, format, heat));
        break;
      }
      case "teams": {
        participants = parseTeams($, format);
        break;
      }
      default:
        throw new Error(
          `mg-scoreboard: unsupported ScrapeContext.kind "${ctx.kind}"`,
        );
    }

    return {
      source: "mg-scoreboard",
      competition,
      category,
      participants,
      results,
    };
  },

  discoverTargets(html: string, ctx: ScrapeContext): DiscoveredTarget[] {
    return discoverMgTargets(html, ctx);
  },
};

// ---------------------------------------------------------------------------
// Target discovery (phase/view enumeration from the event tab bar)
// ---------------------------------------------------------------------------

/** Canonical event-page base (query stripped) from the fetched URL. */
function eventBaseUrl(url: string): string {
  return url.split("?")[0];
}

function eventUrl(base: string, eventId: string, params: string): string {
  return `${base}?seite=show_event&id=${eventId}&${params}`;
}

/**
 * Enumerate the event's phase/view pages from the `ul.nav.nav-tabs` tab bar:
 * `toplist`, `teams`, one `session` per `session=<n>`, `semifinal`
 * (`final=semifinal`) and one `final` per `final=<tier>&heat=<h>` (tier A..Z).
 * URLs are rebuilt canonically from the event base + id (never hard-coded), so
 * the relative tab hrefs are normalized and de-duplicated by URL. Anchors for
 * other events (bottom pager, nav dropdowns) are excluded by scoping to the tab
 * bar and matching the event id in `ctx.url`.
 */
function discoverMgTargets(
  html: string,
  ctx: ScrapeContext,
): DiscoveredTarget[] {
  const $ = load(html);
  const eventId = parseEventId(ctx.url);
  if (!eventId) return [];
  const base = eventBaseUrl(ctx.url);

  let hasToplist = false;
  let hasTeams = false;
  let hasSemifinal = false;
  const sessions = new Set<number>();
  const finals = new Set<string>(); // `${tier}\u0000${heat}`

  $("ul.nav.nav-tabs a").each((_, a) => {
    const href = $(a).attr("href");
    if (!href) return;
    // Only this event's tabs (defensive against stray same-selector anchors).
    if ((href.match(/[?&]id=(\d+)/)?.[1] ?? "") !== eventId) return;

    const seite2 = href.match(/[?&]seite2=([a-z_]+)/i)?.[1];
    if (seite2 === "event_points_list_show") hasToplist = true;
    if (seite2 === "event_teams_show") hasTeams = true;

    const finalParam = href.match(/[?&]final=([^&]+)/)?.[1];
    if (finalParam) {
      if (finalParam.toLowerCase() === "semifinal") {
        hasSemifinal = true;
      } else {
        const heat = href.match(/[?&]heat=(\d+)/)?.[1];
        if (heat) finals.add(`${finalParam.toUpperCase()}\u0000${heat}`);
      }
      return;
    }

    const session = href.match(/[?&]session=(\d+)/)?.[1];
    if (session) sessions.add(Number(session));
  });

  const targets: DiscoveredTarget[] = [];
  const seen = new Set<string>();
  const push = (kind: string, params: string): void => {
    const url = eventUrl(base, eventId, params);
    if (seen.has(url)) return;
    seen.add(url);
    targets.push({ kind, url });
  };

  if (hasToplist) push("toplist", "seite2=event_points_list_show");
  if (hasTeams) push("teams", "seite2=event_teams_show");
  for (const n of [...sessions].sort((a, b) => a - b)) {
    push("session", `session=${n}`);
  }
  if (hasSemifinal) push("semifinal", "final=semifinal");
  for (const key of [...finals].sort()) {
    const [tier, heat] = key.split("\u0000");
    push("final", `final=${tier}&heat=${heat}`);
  }

  return targets;
}

// ---------------------------------------------------------------------------
// Cell extraction
// ---------------------------------------------------------------------------

interface Cell {
  text: string;
  img?: string;
}

function rowCells($: CheerioAPI, $row: Cheerio<AnyNode>): Cell[] {
  return $row
    .find("th,td")
    .map((_, c) => {
      const $c = $(c);
      const img = $c.find("img").first().attr("src");
      const cell: Cell = { text: $c.text().replace(/\s+/g, " ").trim() };
      if (img) cell.img = img;
      return cell;
    })
    .get();
}

// ---------------------------------------------------------------------------
// Event header / competition / category
// ---------------------------------------------------------------------------

/** Clean event title from the `<title>` tag (drops the leading `MGS ` prefix). */
function eventTitle($: CheerioAPI): string {
  const raw = $("title").first().text().trim();
  return cleanDisplay(raw.replace(/^MGS\s+/i, ""));
}

/**
 * Format is inferred from the event title. The contract warns that a title word
 * can lie (e.g. "Celtic Pairs … (Individual)"), so this is best-effort; the
 * per-page table structure (empty flag col + heat subtables for Individual,
 * `Penalty Points` column for Pairs) is the more reliable signal when available.
 */
function detectFormat(title: string): CompetitionFormat {
  const t = title.toLowerCase();
  if (/\bindividual\b/.test(t)) return "individual";
  if (/pair|paires/.test(t)) return "pair";
  return "team";
}

function parseEventId(url: string): string {
  return url.match(/[?&]id=(\d+)/)?.[1] ?? "";
}

function buildCompetition(title: string): NormalizedCompetition {
  return {
    name: title,
    groupingKey: groupingKeyFromTitle(title),
    sourceTitleRaw: title,
  };
}

/** Strip a trailing age/category suffix, then normalize to a grouping key. */
function groupingKeyFromTitle(title: string): string {
  const base = title.replace(
    /\s*[-–]?\s*(under\s*\d+\s*[ab]?s?|u\d+\s*[ab]?|open|ok|pro)\s*$/i,
    "",
  );
  return cleanDisplay(base).toLowerCase();
}

function buildCategory(
  title: string,
  format: CompetitionFormat,
  eventId: string,
): NormalizedCategory {
  const { ageBand, division } = parseAgeBand(title);
  const category: NormalizedCategory = {
    format,
    pro: /\bpro\b/i.test(title),
    nativeId: eventId,
  };
  if (ageBand) category.ageBand = ageBand;
  if (division) category.division = division;
  return category;
}

/** Extract `U12` + optional `a`/`b` division (or `OPEN`) from a title. */
function parseAgeBand(title: string): { ageBand?: string; division?: string } {
  const m = title.match(/\bU(?:nder)?\s*(\d{1,2})\s*([ab])?\b/i);
  if (m) {
    const out: { ageBand: string; division?: string } = { ageBand: `U${m[1]}` };
    if (m[2]) out.division = m[2].toLowerCase();
    return out;
  }
  if (/\bopen\b|\bOK\b/i.test(title)) return { ageBand: "OPEN" };
  return {};
}

// ---------------------------------------------------------------------------
// Nation / label / name helpers
// ---------------------------------------------------------------------------

const AGE_SUFFIX = /\s+(U\d+[ab]?s?|OPEN|OK|PRO)\s*$/i;

/** Nation-name portion of a Team label (`England U12` → `England`). */
function teamNationName(label: string): string {
  return label.replace(AGE_SUFFIX, "").trim();
}

/**
 * Resolve a nation ref from a flag filename. ISO2 codes are upper-cased
 * (`IT`); UK home nations use `_england`/`_scotland`/`_wales` → code `england`.
 */
function nationFromFlagSrc(src: string): NationRef | undefined {
  const file = (src.split(/[\\/]/).pop() ?? "").replace(/\.png$/i, "");
  if (!file) return undefined;
  if (file.startsWith("_")) {
    const code = file.slice(1).toLowerCase();
    return { code, name: code.charAt(0).toUpperCase() + code.slice(1) };
  }
  const code = file.toUpperCase();
  return { code, name: code };
}

/** Split a rider display name into family (last token) + given (the rest). */
function riderMember(label: string): NormalizedMember {
  const parts = cleanDisplay(label).split(" ").filter(Boolean);
  if (parts.length <= 1) return { familyName: parts[0] ?? label };
  return {
    familyName: parts[parts.length - 1],
    givenName: parts.slice(0, -1).join(" "),
  };
}

/** Sentence-case a game name so casing is consistent across heats/events. */
function normalizeGameName(raw: string): string {
  const s = cleanDisplay(raw).toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Toplist (standings)
// ---------------------------------------------------------------------------

function parseToplist(
  $: CheerioAPI,
  format: CompetitionFormat,
  phase: NormalizedPhaseRef,
): { participants: NormalizedParticipant[]; results: NormalizedResult[] } {
  const rows = $("table").first().find("tr").toArray();
  if (rows.length === 0) return { participants: [], results: [] };

  const header = rowCells($, $(rows[0]));
  const lower = header.map((h) => h.text.toLowerCase());
  const rankIdx = lower.indexOf("#");
  const labelIdx = Math.max(lower.indexOf("team"), 0) || 1;
  let overallIdx = -1;
  lower.forEach((t, i) => {
    if (t === "points overall") overallIdx = i;
  });
  // Per-session / per-heat point columns → treated as "games" per the spec.
  const pointIdxs: number[] = [];
  header.forEach((h, i) => {
    if (/^points (session|heat)\s*\d+$/i.test(h.text)) pointIdxs.push(i);
  });

  const participants: NormalizedParticipant[] = [];
  const results: NormalizedResult[] = [];
  const seen = new Set<string>();

  for (const tr of rows.slice(1)) {
    const cells = rowCells($, $(tr));
    if (cells.length < 2) continue;
    const labelCell = cells[labelIdx];
    const rawLabel = labelCell?.text ?? "";
    if (!rawLabel) continue;
    const label = cleanDisplay(rawLabel);

    const nation = resolveNation(format, labelCell?.img, label);
    if (!seen.has(label)) {
      seen.add(label);
      participants.push(makeParticipant(format, label, nation));
    }

    const games: NormalizedGameScore[] = [];
    pointIdxs.forEach((idx, i) => {
      const pts = parseScore(cells[idx]?.text ?? "");
      if (pts !== null) {
        games.push({
          game: normalizeGameName(header[idx].text.replace(/^points\s+/i, "")),
          points: pts,
          ordinal: i + 1,
        });
      }
    });

    const result: NormalizedResult = {
      participantLabel: label,
      phase,
      pointsTotal:
        overallIdx >= 0 ? (parseScore(cells[overallIdx]?.text ?? "") ?? 0) : 0,
      games,
    };
    const rank = rankIdx >= 0 ? parseScore(cells[rankIdx]?.text ?? "") : null;
    if (rank !== null) result.rank = rank;
    results.push(result);
  }

  return { participants, results };
}

// ---------------------------------------------------------------------------
// Session / Final (per-game score grid)
// ---------------------------------------------------------------------------

interface ColMeta {
  flagIdx: number;
  labelIdx: number;
  heatIdx: number;
  penaltyIdx: number;
  sumIdx: number;
  overallIdx: number;
  gameIdxs: number[];
}

const NON_GAME_HEADERS = new Set([
  "",
  "#",
  "team",
  "teams",
  "heat",
  "sum",
  "points overall",
  "penalty points",
  "ø",
]);

function isGameHeader(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  if (NON_GAME_HEADERS.has(t)) return false;
  if (/^points (session|heat)\s*\d+$/.test(t)) return false;
  if (/^session\s*\d+$/.test(t)) return false;
  if (/^ø/.test(t)) return false;
  return true;
}

function buildColMeta(header: Cell[]): ColMeta {
  const lower = header.map((h) => h.text.toLowerCase());
  let labelIdx = lower.findIndex((t, i) => i > 0 && t === "");
  if (labelIdx === -1) labelIdx = 1;
  let overallIdx = -1;
  lower.forEach((t, i) => {
    if (t === "points overall") overallIdx = i;
  });
  const gameIdxs: number[] = [];
  header.forEach((h, i) => {
    if (i !== 0 && i !== labelIdx && isGameHeader(h.text)) gameIdxs.push(i);
  });
  return {
    flagIdx: 0,
    labelIdx,
    heatIdx: lower.indexOf("heat"),
    penaltyIdx: lower.indexOf("penalty points"),
    sumIdx: lower.indexOf("sum"),
    overallIdx,
    gameIdxs,
  };
}

function parseGameTable(
  $: CheerioAPI,
  phase: NormalizedPhaseRef,
  format: CompetitionFormat,
  heatFromUrl?: number,
): { participants: NormalizedParticipant[]; results: NormalizedResult[] } {
  const rows = $("table").first().find("tr").toArray();
  const results: NormalizedResult[] = [];
  const partMap = new Map<string, NormalizedParticipant>();
  let header: Cell[] | null = null;
  let meta: ColMeta | null = null;
  let currentHeat = heatFromUrl;

  for (const tr of rows) {
    const cells = rowCells($, $(tr));
    if (cells.length === 0) continue;
    // A full-width "Heat N" separator row.
    if (cells.length === 1) {
      const m = cells[0].text.match(/heat\s+(\d+)/i);
      if (m) currentHeat = Number(m[1]);
      continue;
    }
    const first = cells[0].text.toLowerCase();
    if (first === "teams" || first === "team") {
      header = cells;
      meta = buildColMeta(cells);
      continue;
    }
    if (!header || !meta) continue;

    const rawLabel = cells[meta.labelIdx]?.text ?? "";
    if (!rawLabel) continue;
    const label = cleanDisplay(rawLabel);
    const nation = resolveNation(format, cells[meta.flagIdx]?.img, label);
    if (!partMap.has(label)) {
      partMap.set(label, makeParticipant(format, label, nation));
    }

    const games: NormalizedGameScore[] = [];
    meta.gameIdxs.forEach((idx, i) => {
      const pts = parseScore(cells[idx]?.text ?? "");
      if (pts !== null) {
        games.push({
          game: normalizeGameName(header?.[idx].text ?? ""),
          points: pts,
          ordinal: i + 1,
        });
      }
    });

    const sum =
      meta.sumIdx >= 0 ? parseScore(cells[meta.sumIdx]?.text ?? "") : null;
    const overall =
      meta.overallIdx >= 0
        ? parseScore(cells[meta.overallIdx]?.text ?? "")
        : null;
    const heatNo =
      meta.heatIdx >= 0
        ? (parseScore(cells[meta.heatIdx]?.text ?? "") ?? currentHeat)
        : currentHeat;

    const result: NormalizedResult = {
      participantLabel: label,
      phase,
      pointsTotal: sum ?? overall ?? 0,
      games,
    };
    if (heatNo != null) result.heatNumber = heatNo;
    if (meta.penaltyIdx >= 0) {
      const pen = parseScore(cells[meta.penaltyIdx]?.text ?? "");
      if (pen !== null) result.penaltyPoints = pen;
    }
    results.push(result);
  }

  return { participants: [...partMap.values()], results };
}

// ---------------------------------------------------------------------------
// Teams tab (participant list — the only source of team_id + start number)
// ---------------------------------------------------------------------------

function parseTeams(
  $: CheerioAPI,
  format: CompetitionFormat,
): NormalizedParticipant[] {
  const participants: NormalizedParticipant[] = [];
  const seen = new Set<string>();

  $(".thumbnail").each((_, c) => {
    const $c = $(c);
    const rawLabel = $c.find("h4").first().text().trim();
    if (!rawLabel) return;
    const label = cleanDisplay(rawLabel);

    const href = $c.find('a[href*="team_id="]').first().attr("href") ?? "";
    const nativeId = href.match(/team_id=(\d+)/)?.[1];
    // Cards are duplicated for responsive layout → dedupe by team_id (or label).
    const key = nativeId ?? label;
    if (seen.has(key)) return;
    seen.add(key);

    const nation = resolveNation(
      format,
      $c.find("img").first().attr("src"),
      label,
    );
    const startNumber = $c
      .find("h6")
      .text()
      .match(/startnumber\s*:?\s*(\d+)/i)?.[1];

    const participant = makeParticipant(format, label, nation);
    if (nativeId) participant.nativeId = nativeId;
    if (startNumber) participant.startNumber = Number(startNumber);
    participants.push(participant);
  });

  return participants;
}

// ---------------------------------------------------------------------------
// Shared participant/nation/phase builders
// ---------------------------------------------------------------------------

function resolveNation(
  format: CompetitionFormat,
  flagSrc: string | undefined,
  label: string,
): NationRef | undefined {
  if (!flagSrc) return undefined;
  const nation = nationFromFlagSrc(flagSrc);
  if (nation && format === "team") {
    return { code: nation.code, name: teamNationName(label) };
  }
  return nation;
}

function makeParticipant(
  format: CompetitionFormat,
  label: string,
  nation: NationRef | undefined,
): NormalizedParticipant {
  const participant: NormalizedParticipant = {
    type: format,
    label,
    members: [],
  };
  if (nation) participant.nation = nation;
  // Individual events name the single rider; Team/Pairs rosters stay opaque.
  if (format === "individual") participant.members = [riderMember(label)];
  return participant;
}

function parseSessionNumber(url: string): number | null {
  const m = url.match(/[?&]session=(\d+)/);
  return m ? Number(m[1]) : null;
}

function parseFinalParams(url: string): { tier: string | null; heat?: number } {
  const tier = url.match(/[?&]final=([^&]+)/)?.[1] ?? null;
  const heatMatch = url.match(/[?&]heat=(\d+)/);
  const out: { tier: string | null; heat?: number } = {
    tier: tier ? decodeURIComponent(tier) : null,
  };
  if (heatMatch) out.heat = Number(heatMatch[1]);
  return out;
}

function buildFinalPhase(
  tier: string | null,
  heat: number | undefined,
): NormalizedPhaseRef {
  if (tier && tier.toLowerCase() === "semifinal") {
    return {
      kind: "semifinal",
      ordinal: 1,
      label: "Semifinal",
      nativeParams: { final: "semifinal", heat },
    };
  }
  const t = (tier ?? "A").toUpperCase();
  const ordinal = t.length === 1 ? t.charCodeAt(0) - 64 : 1;
  return {
    kind: "final",
    ordinal: ordinal > 0 ? ordinal : 1,
    label: heat != null ? `Final ${t} Heat ${heat}` : `Final ${t}`,
    nativeParams: { final: t, heat },
  };
}
