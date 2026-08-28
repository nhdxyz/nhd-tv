import { describe, expect, it } from "vitest";
import type {
  GoogleWatchOffer,
  GoogleWatchResult
} from "../src/main/voice/google-watch-cache";
import type { VoiceMediaIntent } from "../src/main/voice/voice-intent";
import { buildVoiceWatchClarification } from "../src/main/voice/voice-watch-clarification";

function offer(
  providerName: string,
  providerHost: string,
  monetizationType: string | null = "subscription"
): GoogleWatchOffer {
  return {
    monetizationType,
    priceText: monetizationType === "rent" ? "$3.99" : null,
    providerContentId: null,
    providerHost,
    providerName,
    rawLabel: null,
    watchUrl: `https://${providerHost}/watch/example`
  };
}

function result(offers: GoogleWatchOffer[]): GoogleWatchResult {
  return {
    countryCode: "US",
    episodeNumber: null,
    expiresAt: "2026-08-29T00:00:00.000Z",
    fetchedAt: "2026-08-28T00:00:00.000Z",
    mediaType: "movie",
    offers,
    offersComplete: true,
    queryText: "Apollo 13 movie",
    renderMs: 10,
    requestAfterRenderHasData: true,
    requestBeforeRenderHasData: false,
    resolvedSubtitle: null,
    resolvedTitle: "Apollo 13",
    retrievalMode: "browser-request",
    seasonNumber: null,
    source: "google-search",
    sourceUrl: "https://www.google.com/search",
    warmMs: 1
  };
}

function intent(overrides: Partial<VoiceMediaIntent> = {}): VoiceMediaIntent {
  return {
    action: "lookup",
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

describe("watch-provider voice clarification", () => {
  it("preserves enabled service order in numbered choices", () => {
    const clarification = buildVoiceWatchClarification(result([
      offer("Netflix", "www.netflix.com"),
      offer("Disney+", "www.disneyplus.com")
    ]), intent(), ["disney-plus", "netflix"]);

    expect(clarification?.choices).toEqual([{
      id: "watch-provider-disney-plus",
      ordinal: 1,
      primaryLabel: "Disney+",
      secondaryLabel: "Enabled subscription"
    }, {
      id: "watch-provider-netflix",
      ordinal: 2,
      primaryLabel: "Netflix",
      secondaryLabel: "Enabled subscription"
    }]);
    expect(clarification?.candidates).toMatchObject([{
      identity: { title: "Apollo 13" },
      mediaType: "movie",
      provider: { id: "disney-plus" }
    }, {
      provider: { id: "netflix" }
    }]);
  });

  it("does not turn rentals or unenabled providers into playback choices", () => {
    expect(buildVoiceWatchClarification(result([
      offer("Netflix", "www.netflix.com"),
      offer("YouTube", "www.youtube.com", "rent"),
      offer("Disney+", "www.disneyplus.com")
    ]), intent(), ["netflix", "youtube"])).toBeNull();
  });

  it("requires at least two safe choices and caps the list at three", () => {
    expect(buildVoiceWatchClarification(result([
      offer("Netflix", "www.netflix.com")
    ]), intent(), ["netflix"])).toBeNull();

    const clarification = buildVoiceWatchClarification(result([
      offer("Netflix", "www.netflix.com"),
      offer("Disney+", "www.disneyplus.com"),
      offer("YouTube", "www.youtube.com", "free")
    ]), intent(), ["youtube", "netflix", "disney-plus", "netflix"]);
    expect(clarification?.choices).toHaveLength(3);
    expect(clarification?.choices.map((choice) => choice.ordinal)).toEqual([1, 2, 3]);
  });

  it("keeps exact episode coordinates in every candidate", () => {
    const episodeResult = {
      ...result([
        offer("Netflix", "www.netflix.com"),
        offer("Disney+", "www.disneyplus.com")
      ]),
      episodeNumber: 3,
      mediaType: "episode",
      resolvedSubtitle: "Season 1, Episode 3",
      resolvedTitle: "Breaking Bad",
      seasonNumber: 1
    };
    const clarification = buildVoiceWatchClarification(episodeResult, intent({
      episode: 3,
      mediaType: "episode",
      season: 1,
      title: "Breaking Bad"
    }), ["netflix", "disney-plus"]);

    expect(clarification?.candidates[0]).toMatchObject({
      identity: {
        episodeNumber: 3,
        seasonNumber: 1,
        seriesTitle: "Breaking Bad",
        subtitle: "Season 1, Episode 3",
        title: "Breaking Bad"
      },
      mediaType: "episode"
    });
  });
});
