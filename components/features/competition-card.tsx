import { Calendar, Layers } from "lucide-react";
import type { ReactNode } from "react";

import { NationBadge } from "@/components/features/nation-badge";
import { Link } from "@/i18n/navigation";

interface CompetitionCardProps {
  id: number;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  nation: string | null;
  categoryCountLabel: string;
}

/**
 * A single competition card for the archive listing (Option C heritage style).
 * Uses theme tokens exclusively — no hardcoded colours.
 */
export function CompetitionCard({
  id,
  name,
  startsOn,
  endsOn,
  nation,
  categoryCountLabel,
}: CompetitionCardProps): ReactNode {
  const dateRange = formatDateRange(startsOn, endsOn);

  return (
    <Link
      href={`/competitions/${id}`}
      className="group block rounded-lg border border-line bg-card p-4 transition-shadow hover:shadow-md"
    >
      <h3 className="font-heading text-base font-semibold text-ink group-hover:text-green-soft">
        {name}
      </h3>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-soft">
        {dateRange && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
            {dateRange}
          </span>
        )}

        <span className="inline-flex items-center gap-1">
          <Layers className="size-3.5 shrink-0" aria-hidden="true" />
          {categoryCountLabel}
        </span>
      </div>

      {nation && (
        <div className="mt-2">
          <NationBadge nation={{ code: nation, name: nation }} />
        </div>
      )}
    </Link>
  );
}

/** Format a start/end date pair for display (ISO → locale-neutral short). */
function formatDateRange(
  startsOn: string | null,
  endsOn: string | null,
): string | null {
  if (!startsOn) return null;
  const start = startsOn.slice(0, 10);
  const end = endsOn?.slice(0, 10);
  if (!end || start === end) return start;
  return `${start} — ${end}`;
}
