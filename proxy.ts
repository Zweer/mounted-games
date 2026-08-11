import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

/**
 * Next.js 16 renamed the `middleware` convention to `proxy` (same runtime, new
 * file/export names). `next-intl` documents this rename explicitly — its
 * `createMiddleware(routing)` still returns a plain `(NextRequest) =>
 * NextResponse` handler, which we compose here with the Better Auth guard.
 *
 * Flow:
 *  1. If the request targets a localized `/[locale]/contribute` route, run an
 *     edge-safe session-cookie check (full role/status enforcement stays in the
 *     route handlers / server actions). Anonymous visitors are redirected to
 *     the locale home page.
 *  2. Otherwise (or once the guard passes), hand off to the next-intl handler
 *     for locale negotiation, prefixing and redirects.
 *
 * API routes are excluded via the matcher, so `auth.ts` / `app/api/auth`
 * (and the poll/seed handlers) are never rewritten or localized.
 */
const handleI18nRouting = createMiddleware(routing);

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const protectedLocale = routing.locales.find(
    (locale) =>
      pathname === `/${locale}/contribute` ||
      pathname.startsWith(`/${locale}/contribute/`),
  );

  if (protectedLocale) {
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      const redirectUrl = new URL(`/${protectedLocale}`, request.url);
      redirectUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return handleI18nRouting(request);
}

export const config = {
  // Match all pathnames except API routes, Next.js internals and files with a
  // dot (static assets like favicon.ico).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
