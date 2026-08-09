import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Next.js 16 renamed the `middleware` convention to `proxy` (same runtime, new
 * file/export names). This guards contributor/admin areas: an edge-safe cookie
 * check that redirects anonymous visitors to the home page. Full role/status
 * enforcement happens in the route handlers / server actions, not here.
 */
export function proxy(request: NextRequest): NextResponse {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    const redirectUrl = new URL("/", request.url);
    redirectUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/contribute/:path*"],
};
