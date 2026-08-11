"use client";

import { Archive, House, RadioTower, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", key: "home", icon: House, exact: true },
  { href: "/live", key: "live", icon: RadioTower, exact: false },
  { href: "/competitions", key: "archive", icon: Archive, exact: false },
  { href: "/search", key: "search", icon: Search, exact: false },
] as const;

export function BottomNav(): ReactNode {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-brass border-t-[3px] bg-green">
      <ul className="mx-auto flex w-full max-w-screen-sm items-stretch justify-around px-2 pt-2 pb-5">
        {items.map(({ href, key, icon: Icon, exact }) => {
          const isActive = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-1 font-medium text-[10px] tracking-wide transition-colors",
                  isActive
                    ? "text-brass-light"
                    : "text-cream/60 hover:text-cream",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
