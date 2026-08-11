import { Award, Hash } from "lucide-react";
import type { ReactNode } from "react";

interface StatChipsProps {
  appearances: number;
  appearancesLabel: string;
  bestPlacementRank: number | null;
  bestPlacementLabel: string;
}

/**
 * Compact row of headline stats for an entity page (appearances + best placement).
 * Renders as heritage-style chips.
 */
export function StatChips({
  appearances,
  appearancesLabel,
  bestPlacementRank,
  bestPlacementLabel,
}: StatChipsProps): ReactNode {
  return (
    <div className="mb-6 flex flex-wrap gap-3">
      <div className="inline-flex items-center gap-1.5 rounded-md border border-line bg-cream-deep px-3 py-1.5 text-sm text-ink">
        <Hash className="size-3.5 shrink-0 text-brass" aria-hidden="true" />
        <span className="font-medium">{appearances}</span>
        <span className="text-ink-soft">{appearancesLabel}</span>
      </div>

      {bestPlacementRank !== null && (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-line bg-cream-deep px-3 py-1.5 text-sm text-ink">
          <Award className="size-3.5 shrink-0 text-brass" aria-hidden="true" />
          <span className="font-medium">#{bestPlacementRank}</span>
          <span className="text-ink-soft">{bestPlacementLabel}</span>
        </div>
      )}
    </div>
  );
}
