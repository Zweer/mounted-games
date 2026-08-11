/** Polite HTML GET shared by scrapers: descriptive UA, abort signal, follow redirects. */
const USER_AGENT =
  "mounted-games-bot/0.1 (+https://mounted-games; ingestion, contact site owner)";

export async function fetchHtml(
  url: string,
  signal: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  const response = await fetch(url, {
    signal,
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT, ...extraHeaders },
  });
  if (!response.ok) {
    throw new Error(
      `GET ${url} failed: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}
