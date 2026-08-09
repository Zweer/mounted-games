import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage(): ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl tracking-tight">Mounted Games</h1>
        <p className="text-muted-foreground text-sm">
          Live scoring, results archive and statistics for the Mounted Games
          equestrian discipline — Italian and European level.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>
            Live scoreboards, historical results and cross-entity statistics are
            on the way.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          The portal is being built. Check back during the next competition.
        </CardContent>
      </Card>
    </div>
  );
}
