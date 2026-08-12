import { NextResponse } from "next/server";
import { type PollMode, runArchiveTick, runPollTick } from "@/lib/ingest/poll";

// The poller does per-request DB + network work; never statically optimized.
export const dynamic = "force-dynamic";

/** Allowed mode values. Default: "live". */
const MODES: Set<PollMode> = new Set(["live", "archive"]);

/**
 * Ingestion entry point, pinged by external schedulers (cron-job.org).
 * Protected by a shared bearer token (`CRON_SECRET`) — the route is
 * network-exposed, so this auth check is mandatory; without a configured secret
 * it refuses every request.
 *
 * Query parameter `mode`:
 *  - `live` (default): refresh the live window + scrape the stalest live targets.
 *  - `archive`: scrape 1 idle target (incremental historical backfill).
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const modeParam = url.searchParams.get("mode") ?? "live";
  const mode: PollMode = MODES.has(modeParam as PollMode)
    ? (modeParam as PollMode)
    : "live";

  const summary =
    mode === "archive" ? await runArchiveTick() : await runPollTick();

  return NextResponse.json(summary);
}
