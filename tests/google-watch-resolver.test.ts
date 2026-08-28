import { describe, expect, it } from "vitest";
import {
  googleWatchCachedIdentityNeedsRefresh,
  googleWatchLookupFromIntent,
  googleWatchMetadataForLookup,
  googleWatchOfferFromUrl,
  prioritizeGoogleWatchCandidates,
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

  it("bounds playback and availability discovery and cancels hidden state", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("../src/main/index.ts", import.meta.url), "utf8")
    );
    const execution = source.slice(
      source.indexOf("async function executeGoogleWatchPlan"),
      source.indexOf("async function executeVoiceCommandPlanCore")
    );

    expect(source).toContain("VOICE_PLAYBACK_DISCOVERY_TIMEOUT_MS = 10_000");
    expect(source).toContain("VOICE_AVAILABILITY_DISCOVERY_TIMEOUT_MS = 15_000");
    expect(execution).toContain('plan.intent.action === "play"');
    expect(execution).toContain("runVoiceStageWithDeadline(");
    expect(execution).toContain("timeoutMs: Math.max(1, discoveryDeadlineAt - Date.now())");
    expect(execution).toContain("signal,");
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
      requestedTitle: "Breaking Bad",
      seasonNumber: 1
    });
  });

  it("never treats a generated episode query as verified result metadata", () => {
    const lookup = googleWatchLookupFromIntent(intent({
      episode: 4,
      mediaType: "episode",
      season: 1,
      title: "Breaking Bad"
    }), "US");
    expect(googleWatchMetadataForLookup(lookup, {
      episodeMetadataCandidates: [
        "Breaking Bad season 1 episode 4",
        "Breaking Bad: Season 1, Episode 4"
      ],
      resolvedSubtitle: "Breaking Bad season 1 episode 4",
      resolvedTitle: "Cancer Man"
    })).toEqual({
      resolvedSubtitle: "Breaking Bad: Season 1, Episode 4",
      resolvedTitle: "Breaking Bad"
    });
    expect(googleWatchMetadataForLookup(lookup, {
      resolvedSubtitle: "Breaking Bad season 1 episode 4",
      resolvedTitle: "Breaking Bad season 1 episode 4"
    })).toEqual({ resolvedSubtitle: null, resolvedTitle: null });
    expect(googleWatchMetadataForLookup(lookup, {
      resolvedSubtitle: "S1 E4 — Cancer Man",
      resolvedTitle: "Breaking Bad"
    })).toEqual({
      resolvedSubtitle: "S1 E4 — Cancer Man",
      resolvedTitle: "Breaking Bad"
    });
  });

  it("keeps a plain show title that legitimately matches its query", () => {
    const lookup = googleWatchLookupFromIntent(intent({
      mediaType: "show",
      title: "Breaking Bad"
    }), "US");
    expect(googleWatchMetadataForLookup(lookup, {
      resolvedSubtitle: null,
      resolvedTitle: "Breaking Bad"
    })).toEqual({ resolvedSubtitle: null, resolvedTitle: "Breaking Bad" });
  });

  it("refreshes legacy generated-query identity rows but keeps ordinary title rows", () => {
    const episodeLookup = googleWatchLookupFromIntent(intent({
      episode: 4,
      mediaType: "episode",
      season: 1,
      title: "Breaking Bad"
    }), "US");
    expect(googleWatchCachedIdentityNeedsRefresh(episodeLookup, {
      resolvedSubtitle: "Breaking Bad season 1 episode 4",
      resolvedTitle: "Breaking Bad season 1 episode 4"
    })).toBe(true);
    expect(googleWatchCachedIdentityNeedsRefresh(episodeLookup, {
      resolvedSubtitle: "Season 1, Episode 4",
      resolvedTitle: "Breaking Bad"
    })).toBe(false);
    expect(googleWatchCachedIdentityNeedsRefresh(
      googleWatchLookupFromIntent(intent({ mediaType: "show", title: "Breaking Bad" }), "US"),
      { resolvedSubtitle: null, resolvedTitle: "Breaking Bad" }
    )).toBe(false);
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
    expect(googleWatchOfferFromUrl(
      "https://www.primevideo.com/detail/example-id",
      "Amazon Prime Video Subscription"
    )).toMatchObject({
      providerContentId: "example-id",
      providerName: "Amazon Prime Video"
    });
    expect(googleWatchOfferFromUrl("https://play.max.com/video/watch/example-id", "Max"))
      .toMatchObject({ providerName: "Max" });
    expect(googleWatchOfferFromUrl(
      "https://play.hbomax.com/show/example-id",
      "HBO MAX Subscription"
    )).toMatchObject({
      monetizationType: "subscription",
      providerName: "Max"
    });
    expect(googleWatchOfferFromUrl(
      "https://www.youtube.com/watch?v=example12345",
      "YouTube Primetime subscription Requires add-on"
    )).toMatchObject({ monetizationType: "add_on", providerName: "YouTube" });
    expect(googleWatchOfferFromUrl(
      "https://watch.sling.com/1/program/example-id",
      "Sling TV Subscription"
    )).toMatchObject({ providerName: "Sling TV" });
  });

  it("resolves the user's preferred provider before slower redirect candidates", () => {
    const candidates = [
      { href: "https://google.com/goto/1", label: "Apple TV $3.99 Watch" },
      { href: "https://google.com/goto/2", label: "Netflix Subscription Watch" },
      { href: "https://google.com/goto/3", label: "Disney+ Subscription Watch" }
    ];
    expect(prioritizeGoogleWatchCandidates(candidates, ["Disney+", "Netflix"]))
      .toEqual([candidates[2], candidates[1], candidates[0]]);
  });
});
