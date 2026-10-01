import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHtml } from "./http";

/** Build a minimal Response-like object for the fetch stub. */
function res(status: number, body = ""): Response {
  return new Response(body, { status });
}

describe("fetchHtml — transient 503 retry (Altervista/Varnish)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("retries a 503 with backoff and returns the body once it succeeds", async () => {
    // Arrange — first call 503, second call 200.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(503, "unavailable"))
      .mockResolvedValueOnce(res(200, "<html>ok</html>"));
    vi.stubGlobal("fetch", fetchMock);

    // Act — tiny backoff keeps the test fast.
    const html = await fetchHtml(
      "https://example.test/",
      new AbortController().signal,
      {
        backoffMs: 1,
      },
    );

    // Assert
    expect(html).toBe("<html>ok</html>");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting retries and throws with the status", async () => {
    // Arrange — always 503.
    const fetchMock = vi.fn().mockResolvedValue(res(503, "unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    // Act / Assert — 1 initial + maxRetries attempts, then throws.
    await expect(
      fetchHtml("https://example.test/", new AbortController().signal, {
        maxRetries: 2,
        backoffMs: 1,
      }),
    ).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-retryable status (404)", async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue(res(404, "nope"));
    vi.stubGlobal("fetch", fetchMock);

    // Act / Assert
    await expect(
      fetchHtml("https://example.test/", new AbortController().signal, {
        backoffMs: 1,
      }),
    ).rejects.toThrow(/404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still accepts a bare header record as the third argument (back-compat)", async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue(res(200, "<html>ok</html>"));
    vi.stubGlobal("fetch", fetchMock);

    // Act
    const html = await fetchHtml(
      "https://example.test/",
      new AbortController().signal,
      { Cookie: "language=en" },
    );

    // Assert — header forwarded, no retry logic tripped.
    expect(html).toBe("<html>ok</html>");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Cookie).toBe("language=en");
  });
});
