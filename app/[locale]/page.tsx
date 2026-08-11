import { Award, Clock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { HomeLiveCard } from "@/components/features/home-live-card";
import { RecentResultItem } from "@/components/features/recent-result-item";
import { SearchBox } from "@/components/features/search-box";
import { getLiveCategories, getRecentResults } from "@/lib/queries/home";

export const dynamic = "force-dynamic";

export default async function HomePage(): Promise<ReactNode> {
  const t = await getTranslations();
  const [liveCategories, recentResults] = await Promise.all([
    getLiveCategories(),
    getRecentResults(10),
  ]);

  const hasLive = liveCategories.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ── LIVE section or off-season empty state ── */}
      {hasLive ? (
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-serif text-[13px] font-semibold uppercase tracking-[0.16em] text-green">
            <span className="relative flex size-[9px]" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-live/50" />
              <span className="relative inline-flex size-[9px] rounded-full bg-live" />
            </span>
            {t("live.now")}
          </h2>
          <div className="flex flex-col gap-3">
            {liveCategories.map((cat) => (
              <HomeLiveCard key={cat.categoryId} category={cat} />
            ))}
          </div>
        </section>
      ) : (
        <section className="flex flex-col items-center gap-2 pt-8 pb-2 text-center">
          <span className="mb-2 flex size-16 items-center justify-center rounded-full border-2 border-cream-deep text-brass">
            <Award className="size-8" aria-hidden />
          </span>
          <h2 className="font-serif text-xl font-semibold text-green">
            {t("home.empty.title")}
          </h2>
          <p className="max-w-xs text-sm text-ink-soft">
            {t("home.empty.body")}
          </p>
        </section>
      )}

      {/* ── Recent results ── */}
      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 font-serif text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
          <Clock className="size-4" aria-hidden />
          {t("home.recentResults")}
        </h3>
        {recentResults.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {recentResults.map((r) => (
              <RecentResultItem key={r.categoryId} result={r} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-card px-4 py-4 text-sm text-ink-soft">
            {t("home.recentEmpty")}
          </div>
        )}
      </section>

      {/* ── Search box ── */}
      <SearchBox />
    </div>
  );
}
