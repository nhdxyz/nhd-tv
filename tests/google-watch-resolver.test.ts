import { describe, expect, it } from "vitest";
import {
  googleWatchLookupFromIntent,
  googleWatchOfferFromUrl,
  googleWatchSearchUrl
} from "../src/main/voice/google-watch-resolver";
import type { VoiceMediaIntent } from "../src/main/voice/voice-intent";

function intent(overrides: Partial<VoiceMediaIntent> = {}): VoiceMediaIntent {
  return {
    action: "play",
    creator: null,
    episode: null,
    kind: "media",
    mediaType: "movie",
    providerHint: null,
    recency: null,
    season: null,
    title: "Apollo 13",
    ...overrides
  };
}

describe("Google watch resolver boundary", () => {
  it("destroys timed-out hidden windows without blocking the next lookup", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("../src/main/voice/google-watch-resolver.ts", import.meta.url), "utf8")
    );
    const cancelActive = source.slice(
      source.indexOf("cancelActive(): void"),
      source.indexOf("#createWindow", source.indexOf("cancelActive(): void"))
    );

    expect(cancelActive).toContain("this.destroy()");
    expect(cancelActive).toContain("this.#sequence = Promise.resolve()");
    expect(cancelActive).not.toContain("webContents.stop()");
  });

  it("bounds automatic playback discovery and cancels hidden state on timeout", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("../src/main/index.ts", import.meta.url), "utf8")
    );
    const execution = source.slice(
      source.indexOf("async function executeGoogleWatchPlan"),
      source.indexOf("async function executeVoiceCommandPlanCore")
    );

    expect(source).toContain("VOICE_PLAYBACK_DISCOVERY_TIMEOUT_MS = 10_000");
    expect(execution).toContain('plan.intent.action === "play"');
    expect(execution).toContain("AbortSignal.timeout(VOICE_PLAYBACK_DISCOVERY_TIMEOUT_MS)");
    expect(execution).toContain("signal?.aborted !== true");
    expect(execution).toContain("resolver.cancelActive()");
  });

  it("builds a regional, non-personalized Google query", () => {
    const url = new URL(googleWatchSearchUrl("Apollo 13 movie", "US"));
    expect(url.origin + url.pathname).toBe("https://www.google.com/search");
    expect(url.searchParams.get("q")).toBe("Apollo 13 movie");
    expect(url.searchParams.get("gl")).toBe("us");
    expect(url.searchParams.get("pws")).toBe("0");
  });

  it("keeps exact episode coordinates in the lookup", () => {
    expect(googleWatchLookupFromIntent(intent({
      episode: 3,
      mediaType: "episode",
      season: 1,
      title: "Breaking Bad"
    }), "us")).toEqual({
      countryCode: "US",
      episodeNumber: 3,
      mediaType: "episode",
      queryText: "Breaking Bad season 1 episode 3",
      seasonNumber: 1
    });
  });

  it("allows only known HTTPS provider destinations", () => {
    expect(googleWatchOfferFromUrl(
      "https://www.netflix.com/watch/70196254",
      "Netflix Subscription Watch"
    )).toMatchObject({
      monetizationType: "subscription",
      providerContentId: "70196254",
      providerName: "Netflix"
    });
    expect(googleWatchOfferFromUrl("http://www.netflix.com/watch/70196254", "Netflix"))
      .toBeNull();
    expect(googleWatchOfferFromUrl("https://netflix.com.evil.test/watch/1", "Netflix"))
      .toBeNull();
  });
});
