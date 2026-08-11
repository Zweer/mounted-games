import type { ReactNode } from "react";

import { NationBadge } from "@/components/features/nation-badge";

interface EntityHeaderProps {
  name: string;
  typeLabel: string;
  nation?: { code: string; name: string } | null;
}

/**
 * Reusable header for entity pages (athlete, horse, team, nation).
 * Renders the entity name, type badge, and optional nation chip.
 */
export function EntityHeader({
  name,
  typeLabel,
  nation,
}: EntityHeaderProps): ReactNode {
  return (
    <header className="mb-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-brass">
        {typeLabel}
      </p>
      <h1 className="mt-1 font-heading text-2xl font-bold text-ink">{name}</h1>
      {nation && (
        <div className="mt-2">
          <NationBadge nation={nation} />
        </div>
      )}
    </header>
  );
}
