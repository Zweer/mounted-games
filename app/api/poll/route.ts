import { NextResponse } from "next/server";
import { acquirePollLease, releasePollLease } from "@/lib/ingest/lease";
import {
  type PollMode,
  runArchiveTick,
  runDispatcherTick,
  runPollTick,
} from "@/lib/ingest/poll";
import { getSecret } from "@/lib/runtime/workers-env";

// The poller does per-request DB + network work; never statically optimized.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
async function handle(request: Request): Promise<Response> {
  const secret = getSecret("CRON_SECRET");
  const authorization = request.headers.get("authorization");

  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestedMode = url.searchParams.get("mode");
  const modeParam = requestedMode ?? "live";
  const mode: PollMode = MODES.has(modeParam as PollMode)
    ? (modeParam as PollMode)
    : "live";

  if (!(await acquirePollLease())) {
    return NextResponse.json(
      { skipped: true, reason: "dispatcher_locked" },
      { status: 200 },
    );
  }

  try {
    const summary =
      mode === "archive"
        ? await runArchiveTick()
        : requestedMode === null
          ? await runDispatcherTick()
          : await runPollTick();
    return NextResponse.json(summary);
  } finally {
    await releasePollLease();
  }
}

export const GET = handle;
export const POST = handle;
