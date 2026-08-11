import { Award, CalendarDays, Clock, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

export default function HomePage(): ReactNode {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-6">
      {/* Off-season empty state (Option C · Frame 2). Real live/recent data
          arrives with the read layer in a later slice. */}
      <section className="flex flex-col items-center gap-2 pt-8 pb-2 text-center">
        <span className="mb-2 flex size-16 items-center justify-center rounded-full border-2 border-cream-deep text-brass">
          <Award className="size-8" aria-hidden />
        </span>
        <h2 className="font-semibold font-serif text-green text-xl">
          {t("home.empty.title")}
        </h2>
        <p className="max-w-xs text-ink-soft text-sm">{t("home.empty.body")}</p>
      </section>

      {/* Next competition banner */}
      <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl bg-green px-4 py-4 text-cream">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-brass-light text-brass-light">
          <CalendarDays className="size-5" aria-hidden />
        </div>
        <div>
          <div className="font-bold text-[10px] text-brass-light uppercase tracking-[0.16em]">
            {t("home.next.label")}
          </div>
          <div className="text-cream/80 text-sm">{t("home.next.none")}</div>
        </div>
      </div>

      {/* Recent results */}
      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 font-semibold font-serif text-ink-soft text-xs uppercase tracking-[0.16em]">
          <Clock className="size-4" aria-hidden />
          {t("home.recentResults")}
        </h3>
        <div className="rounded-xl border border-line bg-card px-4 py-4 text-ink-soft text-sm">
          {t("home.recentEmpty")}
        </div>
      </section>

      {/* Search entry */}
      <Link
        href="/search"
        className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-3 text-ink-soft text-sm transition-colors hover:border-brass"
      >
        <Search className="size-4 shrink-0 text-brass" aria-hidden />
        {t("search.placeholder")}
      </Link>
    </div>
  );
}
