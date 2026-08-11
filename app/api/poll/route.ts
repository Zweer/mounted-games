import { NextResponse } from "next/server";
import { runPollTick } from "@/lib/ingest/poll";

// The poller does per-request DB + network work; never statically optimized.
export const dynamic = "force-dynamic";

/**
 * Ingestion entry point, pinged by an external scheduler (cron-job.org).
 * Protected by a shared bearer token (`CRON_SECRET`) — the route is
 * network-exposed, so this auth check is mandatory; without a configured secret
 * it refuses every request.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await runPollTick();
  return NextResponse.json(summary);
}
