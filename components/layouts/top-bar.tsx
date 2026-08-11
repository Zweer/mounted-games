"use client";

import { ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function TopBar(): ReactNode {
  const t = useTranslations();
  const activeLocale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-20 border-brass border-b-[3px] bg-green text-cream">
      <div className="mx-auto flex h-16 w-full max-w-screen-sm items-center justify-between px-4 pt-2">
        <Link href="/" className="flex items-center gap-2">
          <ShieldCheck className="size-6 text-brass-light" aria-hidden />
          <span className="font-semibold font-serif text-lg tracking-tight">
            {t("app.name")}
          </span>
        </Link>

        <div className="flex items-center gap-0.5 rounded-full bg-black/20 p-1">
          {routing.locales.map((locale) => {
            const isActive = locale === activeLocale;
            return (
              <button
                key={locale}
                type="button"
                onClick={() => router.replace(pathname, { locale })}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "rounded-full px-2.5 py-1 font-semibold text-xs transition-colors",
                  isActive
                    ? "bg-brass text-green-deep"
                    : "text-cream/60 hover:text-cream",
                )}
              >
                {t(`lang.${locale}`)}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
