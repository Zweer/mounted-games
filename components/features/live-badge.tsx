import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

interface LiveBadgeProps {
  /** Whether the category is currently live (drives the pulsing LIVE pill). */
  isLive: boolean;
  /** Seconds since the last successful refresh; `null` hides the freshness label. */
  secondsAgo: number | null;
}

/**
 * The LIVE cue for the scoreboard header: a pulsing red pill (Option C) plus an
 * "updated Xs ago" freshness label. Pure and prop-driven — the polling island
 * owns the timing and passes `secondsAgo` down.
 */
export function LiveBadge({ isLive, secondsAgo }: LiveBadgeProps): ReactNode {
  const t = useTranslations("liveScoreboard");

  return (
    <div className="flex items-center gap-2.5">
      {isLive && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-live px-2.5 py-1 font-bold text-[11px] text-white tracking-[0.1em]">
          <span className="relative flex size-2" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/70" />
            <span className="relative inline-flex size-2 rounded-full bg-white" />
          </span>
          {t("live")}
        </span>
      )}
      {secondsAgo !== null && (
        <span className="text-[11px] text-cream/70" aria-live="polite">
          {t("updated", { seconds: secondsAgo })}
        </span>
      )}
    </div>
  );
}
