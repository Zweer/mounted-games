import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { LiveScoreboard } from "@/components/features/live-scoreboard";
import { getCategoryStandings } from "@/lib/queries/standings";

// Reads live DB per request — never statically cached at build.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string; categoryId: string }>;
};

/**
 * Live scoreboard for one category. Fetches the initial standings server-side
 * from the read layer, then hands off to the client polling island. Unknown or
 * unscored categories 404.
 */
export default async function LiveCategoryPage({
  params,
}: Props): Promise<ReactNode> {
  const { categoryId } = await params;
  const id = Number(categoryId);
  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }

  const payload = await getCategoryStandings(id);
  if (!payload) {
    notFound();
  }

  return <LiveScoreboard initial={payload} />;
}
