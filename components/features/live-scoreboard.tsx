"use client";

import { ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { StandingsPayload } from "@/lib/queries/types";
import { LiveBadge } from "./live-badge";
import { PhaseTabs } from "./phase-tabs";
import { StandingsList } from "./standings-list";

/** Poll cadence for the live standings JSON (~12s, matching the read notes). */
const POLL_INTERVAL_MS = 12_000;

interface LiveScoreboardProps {
  /** Initial standings from the server (real page) or the sample fixture (demo). */
  initial: StandingsPayload;
}

/**
 * The Live scoreboard island (Option C). Renders the header + phase tabs +
 * ranked standings with inline drill-in, and — while the category is live —
 * polls `GET /api/live/[categoryId]` every ~12s (paused while the tab is
 * hidden), refreshing the standings and the "updated Xs ago" cue. Fetch
 * failures are swallowed: the last good snapshot stays on screen with a
 * non-blocking retry notice.
 *
 * Note: the public poll endpoint currently serves only the latest/active phase,
 * so `phaseId` is sent (forward-compatible — the read layer already supports it)
 * but selection re-syncs to whatever `activePhaseId` the server returns.
 */
export function LiveScoreboard({ initial }: LiveScoreboardProps): ReactNode {
  const t = useTranslations("liveScoreboard");
  const tNav = useTranslations("nav");

  const [payload, setPayload] = useState<StandingsPayload>(initial);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [hasError, setHasError] = useState(false);
  const lastUpdateRef = useRef<number>(Date.now());

  const categoryId = payload.category.id;
  // A DB-backed, live category is pollable; the id<=0 sample fixture is static.
  const pollable = payload.isLive && categoryId > 0;

  const applyPayload = useCallback((data: StandingsPayload) => {
    setPayload(data);
    lastUpdateRef.current = Date.now();
    setSecondsAgo(0);
    setHasError(false);
  }, []);

  const fetchStandings = useCallback(
    async (phaseId: number): Promise<void> => {
      try {
        const res = await fetch(`/api/live/${categoryId}?phaseId=${phaseId}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        applyPayload((await res.json()) as StandingsPayload);
      } catch {
        setHasError(true);
      }
    },
    [categoryId, applyPayload],
  );

  // Keep the latest fetch closure reachable from the interval without resubscribing.
  const refreshRef = useRef(fetchStandings);
  useEffect(() => {
    refreshRef.current = fetchStandings;
  }, [fetchStandings]);

  const activePhaseIdRef = useRef(payload.activePhaseId);
  useEffect(() => {
    activePhaseIdRef.current = payload.activePhaseId;
  }, [payload.activePhaseId]);

  // "updated Xs ago" ticker (client clock, reset on each successful refresh).
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsAgo(
        Math.max(0, Math.round((Date.now() - lastUpdateRef.current) / 1000)),
      );
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Polling loop: only while live, paused when the tab is hidden.
  useEffect(() => {
    if (!pollable) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = (): void => {
      if (timer) return;
      timer = setInterval(() => {
        void refreshRef.current(activePhaseIdRef.current);
      }, POLL_INTERVAL_MS);
    };
    const stop = (): void => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = (): void => {
      if (document.hidden) {
        stop();
      } else {
        void refreshRef.current(activePhaseIdRef.current);
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pollable]);

  const handleSelectPhase = useCallback(
    (phaseId: number): void => {
      if (categoryId <= 0 || phaseId === payload.activePhaseId) return;
      setSelectedId(null);
      void fetchStandings(phaseId);
    },
    [categoryId, payload.activePhaseId, fetchStandings],
  );

  const phaseLabel = useMemo(
    () =>
      payload.phases.find((phase) => phase.id === payload.activePhaseId)
        ?.label ?? "",
    [payload.phases, payload.activePhaseId],
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="relative overflow-hidden rounded-2xl bg-green px-4 py-4 text-cream">
        <span
          className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-brass via-brass-light to-brass"
          aria-hidden
        />
        <Link
          href="/live"
          className="mb-2.5 inline-flex items-center gap-1.5 text-[12px] text-cream/70 transition-colors hover:text-cream"
        >
          <ChevronLeft className="size-3.5" aria-hidden />
          {tNav("live")}
        </Link>
        <h1 className="font-semibold font-serif text-lg leading-snug">
          {payload.category.competitionName}
        </h1>
        <p className="mt-0.5 text-[12px] text-brass-light uppercase tracking-[0.08em]">
          {payload.category.label}
        </p>
        <div className="mt-3">
          <LiveBadge
            isLive={payload.isLive}
            secondsAgo={payload.isLive ? secondsAgo : null}
          />
        </div>
        {hasError && (
          <p className="mt-2 text-[11px] text-cream/70" role="status">
            {t("error")}
          </p>
        )}
      </header>

      {payload.phases.length > 0 && (
        <PhaseTabs
          phases={payload.phases}
          activePhaseId={payload.activePhaseId}
          onSelect={handleSelectPhase}
        />
      )}

      {payload.standings.length === 0 ? (
        <p className="rounded-xl border border-line bg-card px-4 py-6 text-center text-ink-soft text-sm">
          {t("empty")}
        </p>
      ) : (
        <StandingsList
          rows={payload.standings}
          format={payload.category.format}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
          phaseLabel={phaseLabel}
        />
      )}
    </div>
  );
}
