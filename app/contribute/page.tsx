import type { ReactNode } from "react";

export default function ContributePage(): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-semibold text-2xl tracking-tight">Contribute</h1>
      <p className="text-muted-foreground text-sm">
        This area is reserved for approved contributors. The crowdsourcing flow
        — filling the gaps the source portals hide — arrives in a later
        milestone.
      </p>
    </div>
  );
}
