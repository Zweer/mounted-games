import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

export default function NotFound(): ReactNode {
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
