import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware wrappers around Next.js navigation APIs. Components import
 * `Link`, `usePathname`, `useRouter`, etc. from here so locale prefixing is
 * handled automatically (`usePathname` returns the pathname without the locale
 * prefix; `router.replace(pathname, { locale })` switches language in place).
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
