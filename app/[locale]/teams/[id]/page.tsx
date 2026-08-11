import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { EntityHeader } from "@/components/features/entity-header";
import { ParticipationList } from "@/components/features/participation-list";
import { StatChips } from "@/components/features/stat-chips";
import { getTeam } from "@/lib/queries/entities";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const team = await getTeam(Number(id));
  if (!team) return { title: "Not found" };
  return { title: team.name };
}

export default async function TeamPage({ params }: Props): Promise<ReactNode> {
  const { id } = await params;
  const t = await getTranslations("entity");
  const tStats = await getTranslations("entity.stats");

  const teamProfile = await getTeam(Number(id));
  if (!teamProfile) notFound();

  return (
    <section>
      <EntityHeader
        name={teamProfile.name}
        typeLabel={t("team")}
        nation={teamProfile.nation}
      />

      <StatChips
        appearances={teamProfile.headlineStats.appearances}
        appearancesLabel={tStats("appearances")}
        bestPlacementRank={teamProfile.headlineStats.bestPlacementRank}
        bestPlacementLabel={tStats("bestPlacement")}
      />

      <h2 className="mb-2 font-heading text-base font-semibold text-ink">
        {t("participation")}
      </h2>
      <ParticipationList
        rows={teamProfile.participationHistory}
        emptyMessage={t("empty")}
      />
    </section>
  );
}
