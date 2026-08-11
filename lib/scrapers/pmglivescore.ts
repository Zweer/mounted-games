import type { Cheerio, CheerioAPI } from "cheerio";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { cleanDisplay, normalizeKey, parseScore } from "../normalize";
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

/** pmg is the Italian national circuit — nation is implicitly Italy. */
const ITALY: NationRef = { code: "IT", name: "Italy" };

/** Shape of one rider inside `window.iscrittiGlobali`. */
interface IscrittoRow {
  cognome: string;
  nome?: string;
  pony?: string;
}
/** `{ "<LABEL>": [ {cognome, nome, pony}, … ] }` */
type IscrittiGlobali = Record<string, IscrittoRow[]>;
/** `{ "s<S>gioco<M>": "<game name>" }` */
type AcfGiocoLabels = Record<string, string>;

type El = Cheerio<AnyNode>;

/**
 * pmglivescore.altervista.org scraper. Static HTML (WordPress). Every `live-*`
 * view embeds `window.iscrittiGlobali` ({ "<label>": [{cognome,nome,pony}] })
 * giving the full roster + horses for all three formats, and
 * `window.acfGiocoLabels` mapping `s<S>gioco<M>` → game name. See the scraping
 * contract in `docs/sources/pmglivescore.md`.
 */
export const pmgLivescoreScraper: Scraper = {
  source: "pmglivescore",

  fetch(url: string, signal: AbortSignal): Promise<string> {
    return fetchHtml(url, signal);
  },

  parse(html: string, ctx: ScrapeContext): NormalizedScrape {
    const $ = cheerio.load(html);
    const roster = extractJsonObject<IscrittiGlobali>(html, "iscrittiGlobali");
    const gameLabels =
      extractJsonObject<AcfGiocoLabels>(html, "acfGiocoLabels") ?? {};

    const participants = buildParticipants($, roster);
    const competition = buildCompetition($);
    const category = buildCategory($, ctx, participants);
    const results = parseResults($, ctx, gameLabels);

    return {
      source: "pmglivescore",
      competition,
      category,
      participants,
      results,
    };
  },

  discoverTargets(html: string, ctx: ScrapeContext): DiscoveredTarget[] {
    return discoverPmgTargets(html, ctx);
  },

  entryKind: "classifica",

  async listEvents(signal: AbortSignal): Promise<DiscoveredTarget[]> {
    // Enumerate every category (post) across the three custom post types via
    // wp-json; each becomes a classifica entry target keyed by its post_id.
    const cpts = ["squadre-cpt", "individuali-cpt", "coppie-cpt"];
    const ids = new Set<number>();
    for (const cpt of cpts) {
      try {
        const json = await fetchHtml(
          `${PMG_BASE}/wp-json/wp/v2/${cpt}?per_page=100&_fields=id`,
          signal,
        );
        for (const row of JSON.parse(json) as Array<{ id?: number }>) {
          if (typeof row.id === "number") ids.add(row.id);
        }
      } catch {
        // A missing/failed post type must not abort the whole seed.
      }
    }
    return [...ids].map((id) => ({
      kind: "classifica",
      url: `${PMG_BASE}/live-classifica-generale/?post_id=${id}`,
    }));
  },

  async listLiveEvents(signal: AbortSignal): Promise<DiscoveredTarget[]> {
    // The competitions running now come straight from the home page cards whose
    // status is `gara-stato--in_corso` (see docs/sources/pmglivescore.md). A
    // card is keyed by a competition NAME, not a post_id, so each in-progress
    // competition is resolved to its category `post_id`s by matching its
    // normalized name against `title.rendered` across the three CPTs via
    // wp-json. Every matched post_id becomes a classifica entry target; the
    // poller discovers its live sub-phases later.
    const home = await fetchHtml(`${PMG_BASE}/`, signal);
    const live = parseInProgressCompetitions(home);
    if (live.length === 0) return [];

    // Index post_ids by normalized competition title, once, across all CPTs.
    const idsByTitle = new Map<string, Set<number>>();
    const cpts = ["squadre-cpt", "individuali-cpt", "coppie-cpt"];
    for (const cpt of cpts) {
      try {
        const json = await fetchHtml(
          `${PMG_BASE}/wp-json/wp/v2/${cpt}?per_page=100&_fields=id,title`,
          signal,
        );
        const rows = JSON.parse(json) as Array<{
          id?: number;
          title?: { rendered?: string };
        }>;
        for (const row of rows) {
          const title = row.title?.rendered;
          if (typeof row.id !== "number" || !title) continue;
          const key = normalizeKey(title);
          const bucket = idsByTitle.get(key) ?? new Set<number>();
          bucket.add(row.id);
          idsByTitle.set(key, bucket);
        }
      } catch {
        // A missing/failed post type must not abort the whole live scan.
      }
    }

    const ids = new Set<number>();
    for (const comp of live) {
      for (const id of idsByTitle.get(normalizeKey(comp.name)) ?? []) {
        ids.add(id);
      }
    }
    return [...ids].map((id) => ({
      kind: "classifica",
      url: `${PMG_BASE}/live-classifica-generale/?post_id=${id}`,
    }));
  },
};

/**
 * Pure helper: select the home-page competition cards that are IN PROGRESS right
 * now. Cards are `.gara-item` elements carrying `data-competizione` (the
 * competition name — the join key back to wp-json `title.rendered`) and
 * `data-url` (its `/competizione/?competizione=<NAME>` link). A card's state
 * lives in its `.gara-stato` element as the modifier class
 * `gara-stato--in_corso` (vs `--programmata` / `--conclusa`); only in-progress
 * cards are returned. Names/urls are de-duplicated by normalized name.
 */
export function parseInProgressCompetitions(
  html: string,
): { name: string; url: string }[] {
  const $ = cheerio.load(html);
  const out: { name: string; url: string }[] = [];
  const seen = new Set<string>();

  $(".gara-item").each((_, el) => {
    const card = $(el);
    if (card.find(".gara-stato--in_corso").length === 0) return;
    const name = cleanDisplay(card.attr("data-competizione") ?? "");
    if (!name) return;
    const key = normalizeKey(name);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, url: card.attr("data-url") ?? "" });
  });

  return out;
}

const PMG_BASE = (
  process.env.PMG_LIVESCORE_BASE_URL ?? "https://pmglivescore.altervista.org"
).replace(/\/$/, "");

/* -------------------------------------------------------------------------- */
/* Target discovery (phase-view enumeration from the live nav bar)             */
/* -------------------------------------------------------------------------- */

/**
 * Enumerate a category's phase views from the `live-*` nav bar
 * (`a.aux-item-content`): `classifica` (`live-classifica-generale`), one
 * `batteria` per `live-sessione<S>-batteria<B>`, `semifinale`
 * (`live-semifinale-*`) and `finale` (`live-finale-*`). Each URL is rebuilt
 * canonically as `<origin>/<slug>/?post_id=<id>` carrying the `post_id` from
 * `ctx.url` (nav hrefs are inconsistent about carrying it), then de-duplicated
 * by URL. Non-result views (Iscritti, Giochi, Info Gara, Home) are skipped.
 */
function discoverPmgTargets(
  html: string,
  ctx: ScrapeContext,
): DiscoveredTarget[] {
  const postId = extractPostId(ctx.url);
  if (!postId) return [];
  const origin = new URL(ctx.url).origin;
  const $ = cheerio.load(html);

  const targets: DiscoveredTarget[] = [];
  const seen = new Set<string>();
  const push = (kind: string, slug: string): void => {
    const url = `${origin}/${slug}/?post_id=${postId}`;
    if (seen.has(url)) return;
    seen.add(url);
    targets.push({ kind, url });
  };

  $("a.aux-item-content").each((_, a) => {
    const href = $(a).attr("href");
    if (!href) return;
    const slug = href.match(/\/(live-[a-z0-9-]+)\/?/i)?.[1]?.toLowerCase();
    if (!slug) return;

    if (slug === "live-classifica-generale") {
      push("classifica", slug);
    } else if (/^live-sessione\d+-batteria\d+$/.test(slug)) {
      push("batteria", slug);
    } else if (slug.startsWith("live-semifinale-")) {
      push("semifinale", slug);
    } else if (slug.startsWith("live-finale-")) {
      push("finale", slug);
    }
  });

  return targets;
}

/* -------------------------------------------------------------------------- */
/* Inline script globals                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Extract `window.<name> = { … };` from an inline script and `JSON.parse` it.
 * Scans balanced braces (string-aware) so nested objects are captured. Returns
 * `null` when the global is absent or not valid JSON.
 */
function extractJsonObject<T>(html: string, name: string): T | null {
  const anchor = html.indexOf(`window.${name}`);
  if (anchor === -1) return null;
  const eq = html.indexOf("=", anchor);
  if (eq === -1) return null;
  const start = html.indexOf("{", eq);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Participants / competition / category                                       */
/* -------------------------------------------------------------------------- */

function buildParticipants(
  $: CheerioAPI,
  roster: IscrittiGlobali | null,
): NormalizedParticipant[] {
  if (!roster) return [];
  const fallbackFormat = detectFormat($, roster);
  return Object.entries(roster).map(([label, riders]) => {
    const members: NormalizedMember[] = riders.map((r) => {
      const member: NormalizedMember = { familyName: cleanDisplay(r.cognome) };
      const given = r.nome ? cleanDisplay(r.nome) : "";
      if (given) member.givenName = given;
      const horse = r.pony ? cleanDisplay(r.pony) : "";
      if (horse) member.horse = horse;
      return member;
    });
    return {
      type: rosterArityFormat(members.length) ?? fallbackFormat,
      label: cleanDisplay(label),
      nation: ITALY,
      members,
    };
  });
}

/** Modality badge → format, falling back to the modal roster arity. */
function detectFormat(
  $: CheerioAPI,
  roster: IscrittiGlobali | null,
): CompetitionFormat {
  const modalita = acfValue($, "modalita").toLowerCase();
  if (modalita.includes("coppie")) return "pair";
  if (modalita.includes("squadre")) return "team";
  if (modalita.includes("individ")) return "individual";
  if (roster) {
    const sizes = Object.values(roster).map((r) => r.length);
    return rosterArityFormat(sizes.length ? mode(sizes) : 0) ?? "individual";
  }
  return "individual";
}

function rosterArityFormat(arity: number): CompetitionFormat | null {
  if (arity === 1) return "individual";
  if (arity === 2) return "pair";
  if (arity >= 3) return "team";
  return null;
}

function mode(values: number[]): number {
  const counts = new Map<number, number>();
  let best = values[0];
  let bestCount = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      bestCount = c;
      best = v;
    }
  }
  return best;
}

function buildCompetition($: CheerioAPI): NormalizedCompetition {
  const raw = acfValue($, "fea_post_title");
  return {
    name: cleanDisplay(raw),
    groupingKey: normalizeKey(raw),
    nation: ITALY,
    sourceTitleRaw: raw,
  };
}

function buildCategory(
  $: CheerioAPI,
  ctx: ScrapeContext,
  participants: NormalizedParticipant[],
): NormalizedCategory {
  const badge = acfValue($, "categoria");
  const category: NormalizedCategory = {
    format: detectFormat($, null),
    pro: /\bpro\b/i.test(badge),
    nativeId: extractPostId(ctx.url),
  };
  // detectFormat with no roster defaults to individual; prefer the participant
  // arity when the modality badge was missing.
  if (!hasModality($) && participants[0])
    category.format = participants[0].type;
  const ageBand = parseAgeBand(badge);
  if (ageBand) category.ageBand = ageBand;
  if (badge) category.label = cleanDisplay(badge);
  return category;
}

function hasModality($: CheerioAPI): boolean {
  return acfValue($, "modalita").trim().length > 0;
}

function parseAgeBand(badge: string): string | undefined {
  const b = badge.toUpperCase();
  if (/\bU\s?18\b|UNDER\s?18/.test(b)) return "U18";
  if (/\bU\s?15\b|UNDER\s?15/.test(b)) return "U15";
  if (/\bU\s?12\b|UNDER\s?12/.test(b)) return "U12";
  if (/\bOPEN\b/.test(b)) return "OPEN";
  return undefined;
}

/** Read an ACF read-only field value by its `data-name`. */
function acfValue($: CheerioAPI, dataName: string): string {
  return $(`[data-name="${dataName}"] .read-only-value`).first().text().trim();
}

function extractPostId(url: string): string {
  const m = url.match(/[?&]post_id=(\d+)/);
  return m ? m[1] : "";
}

/* -------------------------------------------------------------------------- */
/* Results — dispatch on ctx.kind                                              */
/* -------------------------------------------------------------------------- */

function parseResults(
  $: CheerioAPI,
  ctx: ScrapeContext,
  gameLabels: AcfGiocoLabels,
): NormalizedResult[] {
  switch (ctx.kind) {
    case "classifica":
      return parseClassifica($);
    case "batteria":
      return parseHeatTable($, gameLabels, batteriaPhase(ctx.url));
    case "finale":
      return parseHeatTable($, gameLabels, finalePhase(ctx.url));
    case "semifinale":
      return parseHeatTable($, gameLabels, semifinalePhase(ctx.url));
    default:
      throw new Error(`pmglivescore: unsupported ctx.kind "${ctx.kind}"`);
  }
}

/* ---- Standings (classifica generale) ------------------------------------- */

function parseClassifica($: CheerioAPI): NormalizedResult[] {
  const generale = $("table.pmg-classifica-generale-table").first();
  const table = generale.length
    ? generale
    : $("table.pmg-classifica-table").first();
  if (!table.length) return [];

  const results: NormalizedResult[] = [];

  table.find("tbody tr").each((_i, tr) => {
    const row = $(tr);
    const label = cleanDisplay(row.find("td.col-riders").first().text());
    if (!label) return;
    const rank = intOrUndefined(row.find("td.col-pos").first().text());

    const rowResults: NormalizedResult[] = [];
    const push = (cell: El, phase: NormalizedPhaseRef): void => {
      if (!cell.length) return;
      const clone = cell.clone();
      clone
        .find(".batteria-label, .pareggio-marker, .finale-tipo-label")
        .remove();
      const points = parseScore(clone.text());
      if (points === null) return;
      const result: NormalizedResult = {
        participantLabel: label,
        phase,
        pointsTotal: points,
        games: [],
      };
      const heat = parseHeatLabel(cell.find(".batteria-label").first().text());
      if (heat !== undefined) result.heatNumber = heat;
      if (cell.find(".pareggio-marker").length > 0) result.isTie = true;
      rowResults.push(result);
    };

    for (const ordinal of [1, 2, 3]) {
      push(row.find(`td.col-s${ordinal}`).first(), {
        kind: "session",
        ordinal,
        label: `Sessione ${ordinal}`,
        nativeParams: { session: ordinal },
      });
    }
    push(row.find("td.col-semifinale").first(), {
      kind: "semifinal",
      ordinal: 1,
      label: "Semifinale",
    });

    const fin = row.find("td.col-finale").first();
    if (fin.length) {
      const type = cleanDisplay(fin.find(".finale-tipo-label").first().text())
        .replace(/[()]/g, "")
        .toUpperCase();
      push(fin, {
        kind: "final",
        ordinal: type ? Math.max(1, type.charCodeAt(0) - 64) : 1,
        label: type ? `Finale ${type}` : "Finale",
        nativeParams: type ? { final: type } : undefined,
      });
    }

    if (rank !== undefined && rowResults.length) {
      rowResults[rowResults.length - 1].rank = rank;
    }
    results.push(...rowResults);
  });

  return results;
}

/** `(B1)` → 1. */
function parseHeatLabel(text: string): number | undefined {
  const m = text.match(/B\s?(\d+)/i);
  return m ? Number.parseInt(m[1], 10) : undefined;
}

/* ---- Heat / phase tables (batteria / semifinale / finale) ---------------- */

function parseHeatTable(
  $: CheerioAPI,
  gameLabels: AcfGiocoLabels,
  phase: NormalizedPhaseRef,
): NormalizedResult[] {
  const table = $("table.pmg-batteria-table").first();
  if (!table.length) return [];

  // Header game columns, in order, resolved via acfGiocoLabels (fallback: <label>).
  const gameCols: Array<{ game: string; ordinal: number }> = [];
  let heatFromData: number | undefined;
  table.find("thead th.col-gioco").each((_i, th) => {
    const dataName = $(th).attr("data-name") ?? "";
    const m = dataName.match(/s(\d+)b(\d+)_gioco_(\d+)/);
    if (m && heatFromData === undefined)
      heatFromData = Number.parseInt(m[2], 10);
    const ordinal = m ? Number.parseInt(m[3], 10) : gameCols.length + 1;
    const key = m ? `s${m[1]}gioco${m[3]}` : "";
    const fallback = cleanDisplay($(th).find("label").first().text());
    gameCols.push({ game: gameLabels[key] || fallback, ordinal });
  });

  const results: NormalizedResult[] = [];
  table.find("tbody tr.corsia-row").each((_i, tr) => {
    const row = $(tr);
    const riderCell = row.find("td.col-riders").first().clone();
    const rank = intOrUndefined(
      riderCell.find(".posizione-rider").first().text(),
    );
    riderCell
      .find(".posizione-rider, button, .live-formazione-button")
      .remove();
    const label = cleanDisplay(riderCell.text());
    if (!label) return;

    const games: NormalizedGameScore[] = [];
    row.find("td.col-gioco").each((idx, td) => {
      const col = gameCols[idx];
      if (!col) return;
      const points = parseScore($(td).find(".read-only-value").first().text());
      if (points === null) return;
      games.push({ game: col.game, points, ordinal: col.ordinal });
    });

    const totalCell = row.find("td.col-totale").first();
    const totalClone = totalCell.clone();
    totalClone.find(".pareggio-marker").remove();
    const pointsTotal = parseScore(totalClone.text()) ?? 0;

    const result: NormalizedResult = {
      participantLabel: label,
      phase,
      pointsTotal,
      games,
    };
    const heat =
      typeof phase.nativeParams?.heat === "number"
        ? phase.nativeParams.heat
        : heatFromData;
    if (typeof heat === "number") result.heatNumber = heat;
    if (rank !== undefined) result.rank = rank;
    if (
      totalCell.find(".pareggio-marker").length > 0 ||
      /\*/.test(totalCell.text())
    ) {
      result.isTie = true;
    }
    results.push(result);
  });

  return results;
}

/* ---- Phase refs from URL slug -------------------------------------------- */

function batteriaPhase(url: string): NormalizedPhaseRef {
  const m = url.match(/live-sessione(\d+)-batteria(\d+)/);
  const session = m ? Number.parseInt(m[1], 10) : 1;
  const heat = m ? Number.parseInt(m[2], 10) : 1;
  return {
    kind: "session",
    ordinal: session,
    label: `Sessione ${session} - Batteria ${heat}`,
    nativeParams: { session, heat },
  };
}

function finalePhase(url: string): NormalizedPhaseRef {
  const m = url.match(/live-finale-([a-z])/i);
  const type = (m ? m[1] : "a").toUpperCase();
  return {
    kind: "final",
    ordinal: Math.max(1, type.charCodeAt(0) - 64),
    label: `Finale ${type}`,
    nativeParams: { final: type },
  };
}

function semifinalePhase(url: string): NormalizedPhaseRef {
  const m = url.match(/live-semifinale-([a-z]+)/i);
  const type = m ? m[1].toLowerCase() : "";
  const label = type
    ? `Semifinale ${type.charAt(0).toUpperCase()}${type.slice(1)}`
    : "Semifinale";
  return {
    kind: "semifinal",
    ordinal: 1,
    label,
    nativeParams: type ? { type } : undefined,
  };
}

function intOrUndefined(text: string): number | undefined {
  const digits = text.replace(/[^0-9]/g, "");
  if (!digits) return undefined;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : undefined;
}
