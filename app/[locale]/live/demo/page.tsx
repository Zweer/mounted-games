import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { LiveScoreboard } from "@/components/features/live-scoreboard";
import { SAMPLE_STANDINGS } from "@/lib/queries/sample";

/**
 * Dev-only preview of the Live scoreboard, rendered from the sample fixture so
 * it is viewable WITHOUT a database at `/{locale}/live/demo`. The static `demo`
 * segment takes precedence over the sibling `[categoryId]` dynamic route in
 * Next.js routing, so there is no clash. 404s in production.
 */
export default function LiveDemoPage(): ReactNode {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <LiveScoreboard initial={SAMPLE_STANDINGS} />;
}
