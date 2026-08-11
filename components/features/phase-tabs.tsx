import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { StandingsPhaseRef } from "@/lib/queries/types";
import { cn } from "@/lib/utils";

interface PhaseTabsProps {
  phases: StandingsPhaseRef[];
  /** The phase currently shown (highlighted tab). */
  activePhaseId: number;
  onSelect: (phaseId: number) => void;
}

/**
 * Horizontally-scrollable phase pills (session → semifinal → final), Option C.
 * Presentational: the polling island decides what happens on select. Rendered
 * as an ARIA tablist so the active phase is announced.
 */
export function PhaseTabs({
  phases,
  activePhaseId,
  onSelect,
}: PhaseTabsProps): ReactNode {
  const t = useTranslations("liveScoreboard");

  return (
    <div
      role="tablist"
      aria-label={t("phases")}
      className="flex gap-1.5 overflow-x-auto rounded-xl bg-cream-deep px-3.5 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {phases.map((phase) => {
        const isActive = phase.id === activePhaseId;
        return (
          <button
            key={phase.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(phase.id)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 font-semibold text-xs transition-colors",
              isActive
                ? "border-green bg-green text-cream"
                : "border-line bg-white text-ink-soft hover:border-brass",
            )}
          >
            {phase.label}
          </button>
        );
      })}
    </div>
  );
}
