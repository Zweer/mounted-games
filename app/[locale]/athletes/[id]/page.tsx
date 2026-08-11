import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { EntityHeader } from "@/components/features/entity-header";
import { ParticipationList } from "@/components/features/participation-list";
import { StatChips } from "@/components/features/stat-chips";
import { getAthlete } from "@/lib/queries/entities";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const ath = await getAthlete(Number(id));
  if (!ath) return { title: "Not found" };
  const name = [ath.givenName, ath.familyName].filter(Boolean).join(" ");
  return { title: name };
}

export default async function AthletePage({
  params,
}: Props): Promise<ReactNode> {
  const { id } = await params;
  const t = await getTranslations("entity");
  const tStats = await getTranslations("entity.stats");

  const athlete = await getAthlete(Number(id));
  if (!athlete) notFound();

  const displayName = [athlete.givenName, athlete.familyName]
    .filter(Boolean)
    .join(" ");

  return (
    <section>
      <EntityHeader
        name={displayName}
        typeLabel={t("athlete")}
        nation={athlete.nation}
      />

      <StatChips
        appearances={athlete.headlineStats.appearances}
        appearancesLabel={tStats("appearances")}
        bestPlacementRank={athlete.headlineStats.bestPlacementRank}
        bestPlacementLabel={tStats("bestPlacement")}
      />

      <h2 className="mb-2 font-heading text-base font-semibold text-ink">
        {t("participation")}
      </h2>
      <ParticipationList
        rows={athlete.participationHistory}
        emptyMessage={t("empty")}
      />
    </section>
  );
}
