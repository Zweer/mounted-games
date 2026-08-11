import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export default function ContributePage(): ReactNode {
  const t = useTranslations("contribute");

  return (
    <div className="flex flex-col gap-3 pt-2">
      <h1 className="font-semibold font-serif text-2xl text-green tracking-tight">
        {t("title")}
      </h1>
      <p className="text-ink-soft text-sm leading-relaxed">{t("body")}</p>
    </div>
  );
}
