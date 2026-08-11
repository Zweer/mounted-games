import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { LiveCategoryRow } from "@/lib/queries/home";

interface HomeLiveCardProps {
  category: LiveCategoryRow;
}

/**
 * A live-category card on the Home page (Option C · Frame 1 ".card" style).
 * Shows competition name, category label, format chip, leader, and active phase.
 * Links to /live/[categoryId].
 */
export function HomeLiveCard({ category }: HomeLiveCardProps): ReactNode {
  const t = useTranslations();

  const formatKey = category.format as "team" | "individual" | "pair";

  return (
    <Link
      href={`/live/${category.categoryId}`}
      className="group relative block overflow-hidden rounded-2xl border border-line bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Left accent edge */}
      <span
        className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-brass-light to-brass"
        aria-hidden
      />

      {/* Format label */}
      <p className="mb-1 font-bold text-[10px] text-brass uppercase tracking-[0.14em]">
        {t(`format.${formatKey}`)}
      </p>

      {/* Competition + category */}
      <h3 className="mb-2.5 font-serif text-base font-semibold leading-tight text-ink">
        {category.competitionName} — {category.categoryLabel}
      </h3>

      {/* Leader row */}
      {category.leaderLabel && (
        <div className="flex items-center gap-2 rounded-[10px] bg-cream px-2.5 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-sm text-green">
              {category.leaderLabel}
            </p>
          </div>
          {category.activePhaseLabel && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-live">
              <span className="relative flex size-2" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-live/50" />
                <span className="relative inline-flex size-2 rounded-full bg-live" />
              </span>
              {category.activePhaseLabel}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
