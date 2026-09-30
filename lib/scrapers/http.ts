/** Polite HTML GET shared by scrapers: descriptive UA, abort signal, follow redirects. */
const USER_AGENT =
  "mounted-games-bot/0.1 (+https://mounted-games; ingestion, contact site owner)";

/**
 * Retryable transient statuses. pmglivescore is on Altervista shared hosting
 * behind Varnish and intermittently answers 503 (re-verified 2026-09-30); a
 * single polite retry clears it. 429/502/504 are treated the same way.
 */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const DEFAULT_MAX_RETRIES = 2;
/** Base backoff (ms); grows linearly per attempt. Small so tests stay fast. */
const DEFAULT_BACKOFF_MS = 500;

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason ?? new Error("aborted"));
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error("aborted"));
      },
      { once: true },
    );
  });

export interface FetchHtmlOptions {
  extraHeaders?: Record<string, string>;
  /** Max additional attempts on a retryable status (default 2). */
  maxRetries?: number;
  /** Base backoff in ms between retries (default 500, linear). */
  backoffMs?: number;
}

export async function fetchHtml(
  url: string,
  signal: AbortSignal,
  options?: Record<string, string> | FetchHtmlOptions,
): Promise<string> {
  // Back-compat: callers historically passed a bare `extraHeaders` record.
  const opts: FetchHtmlOptions =
    options &&
    ("extraHeaders" in options ||
      "maxRetries" in options ||
      "backoffMs" in options)
      ? (options as FetchHtmlOptions)
      : { extraHeaders: options as Record<string, string> | undefined };
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, ...opts.extraHeaders },
    });
    if (response.ok) return response.text();

    if (RETRYABLE_STATUS.has(response.status) && attempt < maxRetries) {
      // Drain the body so the connection can be reused, then back off politely.
      await response.text().catch(() => {});
      await sleep(backoffMs * (attempt + 1), signal);
      continue;
    }
    throw new Error(
      `GET ${url} failed: ${response.status} ${response.statusText}`,
    );
  }
}
