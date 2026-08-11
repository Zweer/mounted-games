import { Filter, X } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { CompetitionCard } from "@/components/features/competition-card";
import { Link } from "@/i18n/navigation";
import { listCompetitions } from "@/lib/queries/competitions";
import type { CompetitionFormat } from "@/lib/scrapers/types";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("archive");
  return { title: t("title") };
}

export default async function ArchivePage({
  searchParams,
}: Props): Promise<ReactNode> {
  const t = await getTranslations("archive");
  const tFormat = await getTranslations("format");

  const params = await searchParams;
  const nationFilter =
    typeof params.nation === "string" ? params.nation : undefined;
  const formatFilter =
    typeof params.format === "string"
      ? (params.format as CompetitionFormat)
      : undefined;

  const competitions = await listCompetitions({
    nationCode: nationFilter,
    format: formatFilter,
  });

  const hasFilters = !!(nationFilter || formatFilter);

  return (
    <section>
      <h1 className="font-heading text-xl font-bold text-ink">{t("title")}</h1>

      {/* Filter controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Filter className="size-4 text-ink-soft" aria-hidden="true" />

        <FilterPill
          label={tFormat("team")}
          active={formatFilter === "team"}
          href={
            formatFilter === "team"
              ? "/competitions"
              : "/competitions?format=team"
          }
        />
        <FilterPill
          label={tFormat("individual")}
          active={formatFilter === "individual"}
          href={
            formatFilter === "individual"
              ? "/competitions"
              : "/competitions?format=individual"
          }
        />
        <FilterPill
          label={tFormat("pair")}
          active={formatFilter === "pair"}
          href={
            formatFilter === "pair"
              ? "/competitions"
              : "/competitions?format=pair"
          }
        />

        {hasFilters && (
          <Link
            href="/competitions"
            className="ml-1 inline-flex items-center gap-1 text-xs text-brass hover:underline"
          >
            <X className="size-3" aria-hidden="true" />
            {t("filters.clear")}
          </Link>
        )}
      </div>

      {/* Listing */}
      {competitions.length === 0 ? (
        <p className="mt-8 text-center text-sm text-ink-soft">{t("empty")}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {competitions.map((c) => (
            <CompetitionCard
              key={c.id}
              id={c.id}
              name={c.name}
              startsOn={c.startsOn}
              endsOn={c.endsOn}
              nation={c.nation}
              categoryCountLabel={t("categoryCount", {
                count: c.categoryCount,
              })}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Filter pill (link-based, no client JS) ──

function FilterPill({
  label,
  active,
  href,
}: {
  label: string;
  active: boolean;
  href: string;
}): ReactNode {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-green bg-green text-cream"
          : "border-line bg-card text-ink-soft hover:border-brass hover:text-brass"
      }`}
    >
      {label}
    </Link>
  );
}
