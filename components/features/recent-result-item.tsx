import { Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { RecentResultRow } from "@/lib/queries/home";

interface RecentResultItemProps {
  result: RecentResultRow;
}

/**
 * A single recent-result row on the Home page (Option C · Frame 1 ".result-card"
 * style). Shows a trophy icon, competition + category, winner, and a "Conclusa"
 * chip. Links to the category page (archive detail).
 */
export function RecentResultItem({ result }: RecentResultItemProps): ReactNode {
  const formatLabel =
    result.format === "team"
      ? "Squadre"
      : result.format === "individual"
        ? "Individuale"
        : "Coppie";

  return (
    <Link
      href={`/competitions/${result.categoryId}`}
      className="flex items-center gap-3 rounded-[14px] border border-line bg-card px-3.5 py-3 transition-shadow hover:shadow-sm"
    >
      {/* Trophy icon */}
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-brass-light to-brass text-[#3a2a00]">
        <Trophy className="size-[18px]" aria-hidden />
      </span>

      {/* Body */}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-ink leading-tight">
          {result.competitionName} — {result.categoryLabel}
        </span>
        {result.winnerLabel && (
          <span className="mt-0.5 block truncate font-serif text-sm font-bold text-green">
            {result.winnerLabel}
          </span>
        )}
      </span>

      {/* Format chip */}
      <span className="shrink-0 self-start rounded-full bg-cream-deep px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-ink-soft">
        {formatLabel}
      </span>
    </Link>
  );
}
