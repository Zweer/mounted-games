import { defineRouting } from "next-intl/routing";

/**
 * Central routing configuration for the localized portal.
 *
 * Ships IT + EN; adding a new locale (e.g. "fr", "de") is a catalog-only change:
 * add the code here and drop a matching `messages/<code>.json`. No other code
 * needs to change.
 */
export const routing = defineRouting({
  locales: ["it", "en"],
  defaultLocale: "it",
});

export type Locale = (typeof routing.locales)[number];
