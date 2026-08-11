import { Trophy } from "lucide-react";
import type { ReactNode } from "react";

import type { ParticipationHistoryRow } from "@/lib/queries/entities";

interface ParticipationListProps {
  rows: ParticipationHistoryRow[];
  emptyMessage: string;
}

/**
 * A compact list of participation history rows for an entity page.
 * Renders competition name, category, phase, rank/points in Option C style.
 */
export function ParticipationList({
  rows,
  emptyMessage,
}: ParticipationListProps): ReactNode {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-soft">{emptyMessage}</p>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => (
        <li
          key={`${row.competitionName}-${row.categoryLabel}-${row.phaseLabel ?? ""}-${row.rank ?? ""}`}
          className="flex items-start gap-3 py-3"
        >
          <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-green-soft/10">
            <Trophy className="size-3.5 text-green-soft" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {row.competitionName}
            </p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {row.categoryLabel}
              {row.phaseLabel ? ` · ${row.phaseLabel}` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {row.rank !== null && (
              <span className="text-sm font-semibold text-green">
                #{row.rank}
              </span>
            )}
            {row.points !== null && (
              <p className="text-xs text-ink-soft">{row.points} pts</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
