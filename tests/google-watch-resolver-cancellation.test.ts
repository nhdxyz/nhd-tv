import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GoogleWatchCache,
  GoogleWatchResult
} from "../src/main/voice/google-watch-cache";

const electron = vi.hoisted(() => {
  const behavior = {
    extractionResult: undefined as unknown | ((script: string) => unknown)
  };
  const fetch = vi.fn();
  const windows: FakeBrowserWindow[] = [];

  class FakeWebContents {
    destroyed = false;
    executeJavaScript = vi.fn((script: string) => {
      const configured = typeof behavior.extractionResult === "function"
        ? behavior.extractionResult(script)
        : behavior.extractionResult;
      return configured === undefined
        ? new Promise<never>(() => undefined)
        : Promise.resolve(configured);
    });
    isDestroyed = vi.fn(() => this.destroyed);
    on = vi.fn();
    removeListener = vi.fn();
    setWindowOpenHandler = vi.fn();
    stop = vi.fn();
  }

  class FakeBrowserWindow {
    destroyed = false;
    webContents = new FakeWebContents();

    constructor() {
      windows.push(this);
    }

    destroy(): void {
      this.destroyed = true;
      this.webContents.destroyed = true;
    }

    isDestroyed(): boolean {
      return this.destroyed;
    }

    loadURL = vi.fn(() => Promise.resolve());
  }

  return {
    BrowserWindow: FakeBrowserWindow,
    behavior,
    fetch,
    fromPartition: vi.fn(() => ({
      fetch,
      preconnect: vi.fn()
    })),
    windows
  };
});

vi.mock("electron", () => ({
  BrowserWindow: electron.BrowserWindow,
  session: { fromPartition: electron.fromPartition }
}));

import { GoogleWatchResolver } from "../src/main/voice/google-watch-resolver";

const lookup = {
  countryCode: "US",
  episodeNumber: null,
  mediaType: "show",
  queryText: "Breaking Bad",
  requestedTitle: "Breaking Bad",
  seasonNumber: null
};

function cache(): GoogleWatchCache {
  return {
    getFresh: vi.fn(() => null),
    invalidate: vi.fn(),
    save: vi.fn()
  } as unknown as GoogleWatchCache;
}

function cachedResult(overrides: Partial<GoogleWatchResult> = {}): GoogleWatchResult {
  return {
    countryCode: "US",
    episodeNumber: null,
    expiresAt: "2026-08-29T00:00:00.000Z",
    fetchedAt: "2026-08-28T00:00:00.000Z",
    mediaType: "show",
    offers: [{
      monetizationType: "subscription",
      priceText: null,
      providerContentId: "70196252",
      providerHost: "www.netflix.com",
      providerName: "Netflix",
      rawLabel: "Netflix Subscription",
      watchUrl: "https://www.netflix.com/watch/70196252"
    }],
    offersComplete: true,
    queryText: "Breaking Bad",
    renderMs: null,
    requestAfterRenderHasData: false,
    requestBeforeRenderHasData: true,
    resolvedSubtitle: null,
    resolvedTitle: "Breaking Bad",
    retrievalMode: "warmed-session-request",
    seasonNumber: null,
    source: "google-search",
    sourceUrl: "https://www.google.com/search?q=Breaking+Bad",
    warmMs: 25,
    ...overrides
  };
}

beforeEach(() => {
  electron.behavior.extractionResult = undefined;
  electron.fetch.mockReset();
  electron.fetch.mockImplementation(async () => new Response(
    "<div>Where to watch https://www.netflix.com</div>",
    { status: 200 }
  ));
  electron.fromPartition.mockClear();
  electron.windows.splice(0);
});

describe("Google watch resolver cancellation", () => {
  it("resolves complete warmed-session provider redirects concurrently", async () => {
    const locations = new Map([
      ["netflix", "https://www.netflix.com/watch/70196252"],
      ["youtube", "https://www.youtube.com/watch?v=abcdefghijk"],
      ["prime", "https://www.primevideo.com/detail/example-id"],
      ["hulu", "https://www.hulu.com/movie/example-id"]
    ]);
    const panel = {
      candidateLinks: [...locations.keys()].map((id) => ({
        href: `https://www.google.com/goto?id=${id}`,
        label: `${id} Subscription`
      })),
      episodeMetadataCandidates: [],
      resolvedSubtitle: null,
      resolvedTitle: "Breaking Bad"
    };
    electron.behavior.extractionResult = (script: string) => {
      if (script.includes("captcha:")) return { captcha: false, watch: true };
      if (script.includes("const button =")) return false;
      return panel;
    };
    let activeRedirects = 0;
    let maxActiveRedirects = 0;
    let redirectRequestCount = 0;
    electron.fetch.mockImplementation(async (input: string) => {
      const url = new URL(String(input));
      if (url.pathname === "/goto") {
        redirectRequestCount += 1;
        activeRedirects += 1;
        maxActiveRedirects = Math.max(maxActiveRedirects, activeRedirects);
        await new Promise((resolve) => setTimeout(resolve, 10));
        activeRedirects -= 1;
        return new Response(null, {
          headers: { location: locations.get(url.searchParams.get("id") ?? "") ?? "" },
          status: 302
        });
      }
      return new Response("<div>Where to watch netflix.com</div>", { status: 200 });
    });
    const save = vi.fn();
    const resolver = new GoogleWatchResolver({
      cache: {
        getFresh: vi.fn(() => null),
        invalidate: vi.fn(),
        save
      } as unknown as GoogleWatchCache
    });

    await expect(resolver.resolve(lookup, { completeOffers: true })).resolves.toMatchObject({
      offers: expect.arrayContaining([
        expect.objectContaining({ providerName: "Netflix" }),
        expect.objectContaining({ providerName: "YouTube" }),
        expect.objectContaining({ providerName: "Amazon Prime Video" }),
        expect.objectContaining({ providerName: "Hulu" })
      ]),
      offersComplete: true
    });
    expect(maxActiveRedirects).toBe(4);
    expect(redirectRequestCount).toBe(4);
    expect(save).toHaveBeenCalledOnce();
  });

  it("invalidates a fresh cache row whose resolved title does not match", async () => {
    electron.fetch.mockResolvedValue(new Response("", { status: 429 }));
    const invalidate = vi.fn();
    const resolver = new GoogleWatchResolver({
      cache: {
        getFresh: vi.fn()
          .mockReturnValueOnce(cachedResult({ resolvedTitle: "Better Call Saul" }))
          .mockReturnValue(null),
        invalidate,
        save: vi.fn()
      } as unknown as GoogleWatchCache
    });

    await expect(resolver.resolve(lookup)).rejects.toThrow(
      "Google discovery needs a cooldown before retrying."
    );
    expect(invalidate).toHaveBeenCalledWith("Breaking Bad", "US");
  });

  it("does not save an uncached panel with an unverified title", async () => {
    electron.behavior.extractionResult = {
      candidateLinks: [{
        href: "https://www.netflix.com/watch/70196252",
        label: "Netflix Subscription"
      }],
      episodeMetadataCandidates: [],
      resolvedSubtitle: null,
      resolvedTitle: "Better Call Saul"
    };
    const save = vi.fn();
    const resolver = new GoogleWatchResolver({
      cache: {
        getFresh: vi.fn(() => null),
        invalidate: vi.fn(),
        save
      } as unknown as GoogleWatchCache
    });

    await expect(resolver.resolve(lookup)).rejects.toThrow(
      "Google discovery returned unverified title or episode metadata."
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("uses a cooldown after Google rate limits the warmed session", async () => {
    electron.fetch.mockResolvedValue(new Response("", { status: 429 }));
    const resolver = new GoogleWatchResolver({ cache: cache() });

    await expect(resolver.resolve(lookup)).rejects.toThrow(
      "Google discovery needs a cooldown before retrying."
    );
    const requestCount = electron.fetch.mock.calls.length;
    await expect(resolver.resolve(lookup)).rejects.toThrow(
      "Google discovery is cooling down before retrying."
    );
    expect(electron.fetch).toHaveBeenCalledTimes(requestCount);
    expect(electron.windows.every((window) => window.destroyed)).toBe(true);
  });

  it("settles immediately when an Electron renderer call ignores the deadline", async () => {
    const resolver = new GoogleWatchResolver({ cache: cache() });
    const controller = new AbortController();
    const resolution = resolver.resolve(lookup, { signal: controller.signal });

    await vi.waitFor(() => {
      expect(electron.windows[0]?.webContents.executeJavaScript).toHaveBeenCalled();
    });
    const timeout = new DOMException("Discovery timed out.", "TimeoutError");
    controller.abort(timeout);

    await expect(resolution).rejects.toBe(timeout);
    expect(electron.windows).toHaveLength(2);
    expect(electron.windows.every((window) => window.destroyed)).toBe(true);
  });

  it("does not cancel active browser work when only a queued lookup is aborted", async () => {
    const resolver = new GoogleWatchResolver({ cache: cache() });
    const activeController = new AbortController();
    const queuedController = new AbortController();
    const active = resolver.resolve(lookup, { signal: activeController.signal });

    await vi.waitFor(() => {
      expect(electron.windows[0]?.webContents.executeJavaScript).toHaveBeenCalled();
    });
    const queued = resolver.resolve(
      { ...lookup, queryText: "Apollo 13 movie" },
      { signal: queuedController.signal }
    );
    const queuedTimeout = new DOMException("Queued lookup timed out.", "TimeoutError");
    queuedController.abort(queuedTimeout);

    await expect(queued).rejects.toBe(queuedTimeout);
    expect(electron.windows.every((window) => !window.destroyed)).toBe(true);

    const activeTimeout = new DOMException("Active lookup timed out.", "TimeoutError");
    activeController.abort(activeTimeout);
    await expect(active).rejects.toBe(activeTimeout);
    expect(electron.windows.every((window) => window.destroyed)).toBe(true);
  });
});
