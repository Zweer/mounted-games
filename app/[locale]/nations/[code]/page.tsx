import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { EntityHeader } from "@/components/features/entity-header";
import { ParticipationList } from "@/components/features/participation-list";
import { StatChips } from "@/components/features/stat-chips";
import { getNation } from "@/lib/queries/entities";

interface Props {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const n = await getNation(code);
  if (!n) return { title: "Not found" };
  return { title: n.name };
}

export default async function NationPage({
  params,
}: Props): Promise<ReactNode> {
  const { code } = await params;
  const t = await getTranslations("entity");
  const tStats = await getTranslations("entity.stats");

  const nationProfile = await getNation(code);
  if (!nationProfile) notFound();

  return (
    <section>
      <EntityHeader
        name={nationProfile.name}
        typeLabel={t("nation")}
        nation={{ code: nationProfile.code, name: nationProfile.name }}
      />

      <StatChips
        appearances={nationProfile.headlineStats.appearances}
        appearancesLabel={tStats("appearances")}
        bestPlacementRank={nationProfile.headlineStats.bestPlacementRank}
        bestPlacementLabel={tStats("bestPlacement")}
      />

      <h2 className="mb-2 font-heading text-base font-semibold text-ink">
        {t("participation")}
      </h2>
      <ParticipationList
        rows={nationProfile.participationHistory}
        emptyMessage={t("empty")}
      />
    </section>
  );
}
