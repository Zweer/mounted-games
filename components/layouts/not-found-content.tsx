"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

/**
 * The styled "404 + Home button" mark, shared between the in-`[locale]`
 * `not-found.tsx` (thrown via `notFound()` inside a matched locale) and the
 * root `global-not-found.tsx` (unmatched / invalid-locale URLs). Keeping the
 * markup in one place guarantees the two 404 surfaces stay visually and
 * content-identical (same 404 glyph, same Home target).
 *
 * Relies on the surrounding `NextIntlClientProvider` for the `nav` namespace
 * and locale-aware `Link`.
 */
export function NotFoundContent(): ReactNode {
  const t = useTranslations("nav");

  return (
    <div className="flex flex-col items-center gap-3 pt-16 text-center">
      <p className="font-semibold font-serif text-6xl text-green">404</p>
      <Link
        href="/"
        className="rounded-full bg-green px-4 py-2 font-medium text-cream text-sm transition-colors hover:bg-green-soft"
      >
        {t("home")}
      </Link>
    </div>
  );
}
