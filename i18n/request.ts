import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

/**
 * Per-request i18n configuration. The locale is read from the `[locale]` root
 * param (available by default in Next.js 16.3+ via `next/root-params`), then
 * the matching message catalog is loaded. Messages are provided to both Server
 * and Client Components (the latter via `NextIntlClientProvider`).
 */
export default getRequestConfig(async ({ locale }) => {
  if (!locale) {
    const paramValue = await rootParams.locale();
    if (paramValue && hasLocale(routing.locales, paramValue)) {
      locale = paramValue;
    } else {
      notFound();
    }
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
