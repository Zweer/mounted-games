import type { ReactNode } from "react";
import type { StandingsNation } from "@/lib/queries/types";
import { cn } from "@/lib/utils";

/** Home-nation tokens map to their conventional 3-letter codes; ISO2 upshifts. */
const HOME_NATION_CODES: Record<string, string> = {
  england: "ENG",
  scotland: "SCO",
  wales: "WAL",
  "northern-ireland": "NIR",
  ireland: "IRL",
};

/**
 * Short display code for a nation badge. Source data uses ISO2 (`IT`, `FR`) or
 * home-nation tokens (`england`, `scotland`, `wales`); everything collapses to a
 * ≤3-char uppercase code that fits the badge.
 */
export function nationShortCode(code: string): string {
  const key = code.toLowerCase();
  return HOME_NATION_CODES[key] ?? code.slice(0, 3).toUpperCase();
}

interface NationBadgeProps {
  nation: StandingsNation;
  className?: string;
}

/**
 * Generic nation chip (Option C `.badge2` style): a brass-ringed green tab with
 * the nation's short code. We render a code badge for every nation rather than
 * per-country flag art — see the read/UI notes; flag graphics are deferred.
 */
export function NationBadge({
  nation,
  className,
}: NationBadgeProps): ReactNode {
  return (
    <span
      role="img"
      title={nation.name}
      aria-label={nation.name}
      className={cn(
        "inline-flex h-[21px] min-w-[30px] shrink-0 items-center justify-center rounded-[3px] bg-green px-1 font-bold text-[10px] text-cream tracking-wide ring-1 ring-ink/10 ring-inset",
        className,
      )}
    >
      {nationShortCode(nation.code)}
    </span>
  );
}
