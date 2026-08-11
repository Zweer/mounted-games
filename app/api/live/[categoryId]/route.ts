import { NextResponse } from "next/server";
import { z } from "zod";
import { getCategoryStandings } from "@/lib/queries/standings";

// Reads the live DB per request and must never be statically cached at build.
export const dynamic = "force-dynamic";

/** Route param: a positive integer category id. */
const paramsSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
});

/**
 * `GET /api/live/[categoryId]` — the standings JSON the Live scoreboard polls
 * (~10s). Not localized (stays under app/api). Public read endpoint: no auth,
 * no secrets, only already-public scraped results. A short shared-cache window
 * (`s-maxage=10`) collapses polling bursts at the CDN while keeping data fresh;
 * `stale-while-revalidate=30` serves the last snapshot during a refresh.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ categoryId: string }> },
): Promise<Response> {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid category id" }, { status: 400 });
  }

  const payload = await getCategoryStandings(parsed.data.categoryId);
  if (!payload) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "s-maxage=10, stale-while-revalidate=30" },
  });
}
