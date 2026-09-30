import type { Metadata } from "next";
import { Geist_Mono, Inter, Spectral } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/layouts/bottom-nav";
import { NotFoundContent } from "@/components/layouts/not-found-content";
import { TopBar } from "@/components/layouts/top-bar";
import { ThemeProvider } from "@/components/theme-provider";
import { routing } from "@/i18n/routing";
import "./globals.css";

/**
 * Global 404 (Next.js 16 `global-not-found`, enabled via
 * `experimental.globalNotFound` in `next.config.ts`). Next renders this for any
 * URL that matches no route at all — including paths where the `[locale]`
 * segment is invalid, so `notFound()` fires from the root `[locale]/layout.tsx`
 * before that layout's `<html>/<body>` and providers exist.
 *
 * Because `global-not-found` renders OUTSIDE every layout and provider
 * (docs: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`,
 * "global-not-found.js (experimental)"), this file owns the full HTML document
 * and must re-establish everything the chrome needs: global styles, fonts, the
 * theme provider, and a next-intl client provider. There is no request locale
 * here (no matched `[locale]`), so we statically load `routing.defaultLocale`
 * messages and hand them to the provider — the shared chrome then reads the
 * same `nav`/`app`/`lang` keys it does everywhere else.
 */

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const spectral = Spectral({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "404 — Mounted Games",
  description: "The page you are looking for does not exist.",
};

export default async function GlobalNotFound(): Promise<ReactNode> {
  const locale = routing.defaultLocale;
  const messages = await getMessages({ locale });

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${spectral.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem={false}
            disableTransitionOnChange
          >
            <TopBar />
            <main className="mx-auto w-full max-w-screen-sm flex-1 px-4 pt-4 pb-24">
              <NotFoundContent />
            </main>
            <BottomNav />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
