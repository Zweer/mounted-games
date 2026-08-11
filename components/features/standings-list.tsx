import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { StandingsRow } from "@/lib/queries/types";
import type { CompetitionFormat } from "@/lib/scrapers/types";
import { cn } from "@/lib/utils";
import { NationBadge } from "./nation-badge";
import { formatPoints, ParticipantDetail } from "./participant-detail";

interface StandingsListProps {
  rows: StandingsRow[];
  format: CompetitionFormat;
  /** Currently expanded participant, or `null` when the list is collapsed. */
  selectedId: number | null;
  onSelect: (participantId: number) => void;
  /** Active phase label, forwarded to the drill-in detail. */
  phaseLabel: string;
}

const MEDALS: Record<number, { fill: string; stroke: string; ribbon: string }> =
  {
    1: {
      fill: "var(--podium-gold)",
      stroke: "var(--podium-gold-deep)",
      ribbon: "var(--green)",
    },
    2: {
      fill: "var(--podium-silver)",
      stroke: "var(--podium-silver-deep)",
      ribbon: "var(--podium-silver-deep)",
    },
    3: {
      fill: "var(--podium-bronze)",
      stroke: "var(--podium-bronze-deep)",
      ribbon: "var(--podium-bronze-deep)",
    },
  };

/** Rosette + ribbon badge for a top-3 rank (Option C podium motif). */
function PodiumRosette({ rank }: { rank: number }): ReactNode {
  const medal = MEDALS[rank] ?? MEDALS[3];
  return (
    <span
      className="flex h-8 w-[26px] shrink-0 items-center justify-center"
      aria-hidden
    >
      <svg width="24" height="32" viewBox="0 0 24 32" fill="none">
        <title>{`Rank ${rank}`}</title>
        <path d="M7 19l-3 12 8-5 8 5-3-12" fill={medal.ribbon} />
        <circle
          cx="12"
          cy="11"
          r="9"
          fill={medal.fill}
          stroke={medal.stroke}
          strokeWidth="1.5"
        />
        <circle cx="12" cy="11" r="4.5" fill="var(--white)" />
        <text
          x="12"
          y="14.5"
          fontSize="7"
          fontWeight="700"
          textAnchor="middle"
          fill="var(--green)"
          fontFamily="var(--font-sans), Inter, sans-serif"
        >
          {rank}
        </text>
      </svg>
    </span>
  );
}

/**
 * Ranked standings list with the Option C drill-in: top-3 get a rosette, the
 * rest a serif rank number; tapping a row expands its per-game breakdown inline.
 * Pure and prop-driven — selection state lives in the polling island.
 */
export function StandingsList({
  rows,
  format,
  selectedId,
  onSelect,
  phaseLabel,
}: StandingsListProps): ReactNode {
  const t = useTranslations("liveScoreboard");
  const tf = useTranslations("format");

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="font-semibold text-[11px] text-ink-soft uppercase tracking-[0.14em]">
          {t("standings")}
        </span>
        <span className="rounded-full bg-cream-deep px-2.5 py-1 text-[11px] text-green tracking-[0.06em]">
          {tf(format)}
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((row, index) => {
          const displayRank = row.rank ?? index + 1;
          const isPodium = displayRank <= 3;
          const isOpen = row.participantId === selectedId;

          return (
            <li key={row.participantId}>
              <button
                type="button"
                onClick={() => onSelect(row.participantId)}
                aria-expanded={isOpen}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[13px] border bg-white px-3 py-2.5 text-left transition-colors",
                  isPodium ? "border-brass/45" : "border-line",
                  isOpen && "border-brass ring-2 ring-brass/20",
                )}
              >
                {isPodium ? (
                  <PodiumRosette rank={displayRank} />
                ) : (
                  <span className="w-[26px] shrink-0 text-center font-bold font-serif text-ink-soft text-lg">
                    {displayRank}
                  </span>
                )}

                {row.nation && <NationBadge nation={row.nation} />}

                <span className="min-w-0 flex-1 truncate font-semibold text-ink text-sm">
                  {row.label}
                  {row.isTie && (
                    <span className="ml-1 text-ink-soft" title="Tie">
                      =
                    </span>
                  )}
                </span>

                <span className="ml-auto font-bold font-serif text-green text-lg tabular-nums">
                  {formatPoints(row.pointsTotal)}
                </span>

                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-ink-soft transition-transform",
                    isOpen && "rotate-180 text-brass",
                  )}
                  aria-hidden
                />
              </button>

              {isOpen && (
                <ParticipantDetail row={row} phaseLabel={phaseLabel} />
              )}
            </li>
          );
        })}
      </ul>

      <p className="pt-1 text-center text-[11px] text-ink-soft italic">
        {t("tapHint")}
      </p>
    </section>
  );
}
