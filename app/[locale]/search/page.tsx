import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { SearchBox } from "@/components/features/search-box";
import { Link } from "@/i18n/navigation";
import { search } from "@/lib/queries/search";

export const dynamic = "force-dynamic";

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({
  searchParams,
}: SearchPageProps): Promise<ReactNode> {
  const t = await getTranslations();
  const { q } = await searchParams;
  const term = q?.trim() ?? "";

  const results = term ? await search(term) : null;

  const hasResults =
    results &&
    (results.athletes.length > 0 ||
      results.horses.length > 0 ||
      results.teams.length > 0 ||
      results.competitions.length > 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Search input (always visible at top) */}
      <SearchBox />

      {/* No query submitted yet */}
      {!term && (
        <p className="px-1 text-sm text-ink-soft">
          {t("searchResults.prompt")}
        </p>
      )}

      {/* Query submitted but no results */}
      {term && !hasResults && (
        <p className="px-1 text-sm text-ink-soft">
          {t("searchResults.empty", { q: term })}
        </p>
      )}

      {/* Grouped results */}
      {term && hasResults && (
        <div className="flex flex-col gap-5">
          <p className="px-1 font-serif text-sm font-semibold text-ink">
            {t("searchResults.resultsFor", { q: term })}
          </p>

          {results.athletes.length > 0 && (
            <ResultGroup
              title={t("searchResults.groups.athletes")}
              items={results.athletes}
              hrefPrefix="/athletes"
            />
          )}

          {results.horses.length > 0 && (
            <ResultGroup
              title={t("searchResults.groups.horses")}
              items={results.horses}
              hrefPrefix="/horses"
            />
          )}

          {results.teams.length > 0 && (
            <ResultGroup
              title={t("searchResults.groups.teams")}
              items={results.teams}
              hrefPrefix="/teams"
            />
          )}

          {results.competitions.length > 0 && (
            <ResultGroup
              title={t("searchResults.groups.competitions")}
              items={results.competitions}
              hrefPrefix="/competitions"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal: grouped results section
// ---------------------------------------------------------------------------

interface ResultGroupProps {
  title: string;
  items: Array<{ id: number | string; label: string; subtitle?: string }>;
  hrefPrefix: string;
}

function ResultGroup({
  title,
  items,
  hrefPrefix,
}: ResultGroupProps): ReactNode {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 font-serif text-xs font-semibold uppercase tracking-[0.14em] text-green">
        <Search className="size-3.5" aria-hidden />
        {title}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`${hrefPrefix}/${item.id}`}
              className="flex items-center gap-2 rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm transition-colors hover:border-brass"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">
                  {item.label}
                </span>
                {item.subtitle && (
                  <span className="block text-xs text-ink-soft">
                    {item.subtitle}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
