import type { ReactNode } from "react";
import { NotFoundContent } from "@/components/layouts/not-found-content";

/**
 * Rendered when `notFound()` is thrown inside a matched `[locale]` segment.
 * Composes within the locale layout, so the app chrome (TopBar/BottomNav,
 * i18n provider, theme) is already in place around it.
 */
export default function NotFound(): ReactNode {
  return <NotFoundContent />;
}
