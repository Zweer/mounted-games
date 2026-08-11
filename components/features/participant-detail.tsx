import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { StandingsRow } from "@/lib/queries/types";
import { NationBadge } from "./nation-badge";

/** Render a numeric score, dropping a trailing `.00` on whole numbers. */
export function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

interface ParticipantDetailProps {
  row: StandingsRow;
  /** Label of the phase the breakdown belongs to (drives the sum row caption). */
  phaseLabel: string;
}

/**
 * Drill-in detail card (Option C): a participant's per-game breakdown for the
 * active phase, closing with the phase total. Rendered inline beneath the
 * selected standings row.
 */
export function ParticipantDetail({
  row,
  phaseLabel,
}: ParticipantDetailProps): ReactNode {
  const t = useTranslations("liveScoreboard");

  return (
    <div className="mt-0.5 rounded-[13px] border border-brass bg-gradient-to-b from-white to-cream px-3.5 pt-3.5 pb-3.5 shadow-md">
      <div className="mb-2.5 flex items-center gap-2.5 border-line border-b border-dashed pb-2.5">
        {row.nation && <NationBadge nation={row.nation} />}
        <span className="font-bold font-serif text-green text-sm">
          {row.label}
        </span>
        {phaseLabel && (
          <span className="ml-auto font-bold text-[10px] text-brass uppercase tracking-[0.12em]">
            {phaseLabel}
          </span>
        )}
      </div>

      {row.games.length === 0 ? (
        <p className="py-1.5 text-ink-soft text-sm italic">{t("noGames")}</p>
      ) : (
        <>
          {row.games.map((gameScore) => (
            <div
              key={gameScore.name}
              className="flex items-center justify-between py-1.5 text-sm"
            >
              <span className="flex items-center gap-2 text-ink-soft">
                <span className="size-[5px] shrink-0 rounded-full bg-brass" />
                {gameScore.name}
              </span>
              <span className="font-semibold text-ink tabular-nums">
                {formatPoints(gameScore.points)}
              </span>
            </div>
          ))}
          <div className="mt-1.5 flex items-center justify-between border-green border-t-[1.5px] pt-2.5">
            <span className="font-bold font-serif text-green text-sm">
              {t("phaseSum", { phase: phaseLabel })}
            </span>
            <span className="font-bold font-serif text-[17px] text-green tabular-nums">
              {formatPoints(row.pointsTotal)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
