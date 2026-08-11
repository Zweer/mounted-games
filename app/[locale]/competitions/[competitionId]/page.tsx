import { Calendar, Layers, Play } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { NationBadge } from "@/components/features/nation-badge";
import { Link } from "@/i18n/navigation";
import { getCompetition } from "@/lib/queries/competitions";

interface Props {
  params: Promise<{ competitionId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competitionId } = await params;
  const comp = await getCompetition(Number(competitionId));
  if (!comp) return { title: "Not found" };
  return { title: comp.name };
}

export default async function CompetitionDetailPage({
  params,
}: Props): Promise<ReactNode> {
  const { competitionId } = await params;
  const t = await getTranslations("competition");
  const tFormat = await getTranslations("format");

  const comp = await getCompetition(Number(competitionId));
  if (!comp) notFound();

  const dateRange = formatDateRange(comp.startsOn, comp.endsOn);

  return (
    <section>
      {/* Header */}
      <header className="mb-6">
        <h1 className="font-heading text-xl font-bold text-ink">{comp.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-soft">
          {dateRange && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
              {dateRange}
            </span>
          )}
          {comp.nation && (
            <NationBadge nation={{ code: comp.nation, name: comp.nation }} />
          )}
        </div>
        {comp.organizer && (
          <p className="mt-1 text-xs text-ink-soft">{comp.organizer}</p>
        )}
      </header>

      {/* Categories */}
      <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
        <Layers className="size-4 text-brass" aria-hidden="true" />
        {t("categories")}
      </h2>

      <ul className="mt-3 flex flex-col gap-3">
        {comp.categories.map((cat) => (
          <li
            key={cat.id}
            className="rounded-lg border border-line bg-card p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ink">{cat.label}</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {tFormat(cat.format)}
                  {cat.ageBand ? ` · ${cat.ageBand}` : ""}
                  {cat.pro ? " · PRO" : ""}
                </p>
              </div>
              <Link
                href={`/live/${cat.id}`}
                className="inline-flex items-center gap-1 rounded-md bg-green px-3 py-1.5 text-xs font-medium text-cream transition-colors hover:bg-green-soft"
              >
                <Play className="size-3" aria-hidden="true" />
                {t("viewLive")}
              </Link>
            </div>

            {/* Phases */}
            {cat.phases.length > 0 && (
              <div className="mt-3 border-t border-line pt-2">
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-brass">
                  {t("phases")}
                </p>
                <ul className="flex flex-wrap gap-2">
                  {cat.phases.map((ph) => (
                    <li
                      key={ph.id}
                      className="rounded-full border border-line bg-cream-deep px-2.5 py-0.5 text-xs text-ink-soft"
                    >
                      {ph.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

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
