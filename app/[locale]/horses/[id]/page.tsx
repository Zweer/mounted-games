import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { EntityHeader } from "@/components/features/entity-header";
import { ParticipationList } from "@/components/features/participation-list";
import { StatChips } from "@/components/features/stat-chips";
import { getHorse } from "@/lib/queries/entities";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const h = await getHorse(Number(id));
  if (!h) return { title: "Not found" };
  return { title: h.name };
}

export default async function HorsePage({ params }: Props): Promise<ReactNode> {
  const { id } = await params;
  const t = await getTranslations("entity");
  const tStats = await getTranslations("entity.stats");

  const horseProfile = await getHorse(Number(id));
  if (!horseProfile) notFound();

  return (
    <section>
      <EntityHeader name={horseProfile.name} typeLabel={t("horse")} />

      <StatChips
        appearances={horseProfile.headlineStats.appearances}
        appearancesLabel={tStats("appearances")}
        bestPlacementRank={horseProfile.headlineStats.bestPlacementRank}
        bestPlacementLabel={tStats("bestPlacement")}
      />

      <h2 className="mb-2 font-heading text-base font-semibold text-ink">
        {t("participation")}
      </h2>
      <ParticipationList
        rows={horseProfile.participationHistory}
        emptyMessage={t("empty")}
      />
    </section>
  );
}
