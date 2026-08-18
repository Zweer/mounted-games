import type { CompetitionLevel, SourceKind } from "./types";

/**
 * Neither source exposes a competition level, so we infer it from the title with
 * an ordered, first-match-wins keyword table. It is deliberately CONSERVATIVE:
 * it assigns a level only on a confident marker and returns `null` otherwise
 * (the UI simply omits the level badge). The residual `null`s are a future
 * crowdsourcing target — never a wrong guess.
 */
const RULES: [RegExp, CompetitionLevel][] = [
  // International: IMGA / World / European championships, WPC/WTC, home
  // internationals, Nations, Nordic/Scandinavian.
  [
    /\b(imga|world (?:team|individual|pairs?|championship)|world championships?|europ(?:e|ean|äische?r?)|wpc|wtc|home international|nations? (?:cup|championship|team)|nordic|scandinav\w*)\b/i,
    "international",
  ],
  // National: a country/federation championship.
  [
    /\b(deutsche (?:einzel|paar)?meisterschaft|einzelmeisterschaft|paarmeisterschaft|deutsche meisterschaft|championnat de france|british championships?|england championships?|scottish championships?|welsh championships?|irish (?:team |individual )?championships?|australian .*championships?|swiss championship|schweizer meisterschaft|österreichischer? \w+meisterschaft|national championships?|campionati italiani)\b/i,
    "national",
  ],
  // Regional: state / county / regional series and leagues.
  [
    /\b(rlt|mgawa|mgansw|mgavic|amga ?vic|amga ?nsw|state (?:teams?|pairs?|individuals?|championships?)|counties|intercounties|midlands series|southern series|winter series|autumn series|spring series|summer series|celtic league|snowbird series|winter league)\b/i,
    "regional",
  ],
];

/** Infer a competition level from its title; `null` when not confident. */
export function inferLevel(
  title: string,
  _source: SourceKind,
): CompetitionLevel | null {
  for (const [re, level] of RULES) {
    if (re.test(title)) return level;
  }
  return null;
}
