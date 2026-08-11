"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useRef } from "react";
import { useRouter } from "@/i18n/navigation";

/**
 * Client search input that submits to /search?q=<term>. Used on the Home page
 * and rendered as a form so it works with keyboard submit and accessibility.
 */
export function SearchBox(): ReactNode {
  const t = useTranslations("search");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const term = inputRef.current?.value.trim();
    if (term) {
      router.push(`/search?q=${encodeURIComponent(term)}`);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2.5 rounded-xl border border-line bg-card px-3.5 py-3 transition-colors focus-within:border-brass"
    >
      <Search className="size-[17px] shrink-0 text-brass" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        name="q"
        placeholder={t("placeholder")}
        aria-label={t("placeholder")}
        className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-soft focus:outline-none"
      />
    </form>
  );
}
