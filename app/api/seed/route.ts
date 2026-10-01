import { NextResponse } from "next/server";
import { seedAll } from "@/lib/ingest/seed";
import { getSecret } from "@/lib/runtime/workers-env";

// Crawls external list pages + wp-json; never statically optimized.
export const dynamic = "force-dynamic";
// Allow a longer budget than a poll tick (the archive crawl is heavier).
export const maxDuration = 60;

/**
 * Bootstrap the scrape_target table from the sources' event lists. Protected by
 * the shared `CRON_SECRET` bearer token — refuses every request without it.
 * Pass `?live=1` to flag the seeded entry targets as live (use only during a
 * competition window; the default seeds them idle for the archive).
 */
export async function POST(request: Request): Promise<Response> {
  const secret = getSecret("CRON_SECRET");
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isLive = new URL(request.url).searchParams.get("live") === "1";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50_000);
  try {
    const results = await seedAll(controller.signal, { isLive });
    return NextResponse.json({ results });
  } finally {
    clearTimeout(timer);
  }
}
