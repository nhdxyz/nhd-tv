import { describe, expect, it } from "vitest";
import {
  googleWatchResultMatchesIntent,
  selectEnabledWatchOffer,
  watchAvailabilityDetail,
  watchOffersShouldExpand,
  watchOffersShouldBeComplete
} from "../src/main/voice/google-watch-selection";
import type { VoiceMediaIntent } from "../src/main/voice/voice-intent";
import type { GoogleWatchResult } from "../src/main/voice/google-watch-cache";

const result: GoogleWatchResult = {
  countryCode: "US",
  episodeNumber: null,
  expiresAt: "2026-08-29T00:00:00.000Z",
  fetchedAt: "2026-08-28T00:00:00.000Z",
  mediaType: "movie",
  offers: [{
    monetizationType: "purchase_or_rental",
    priceText: "$3.99",
    providerContentId: "apple-id",
    providerHost: "tv.apple.com",
    providerName: "Apple TV",
    rawLabel: "Apple TV $3.99",
    watchUrl: "https://tv.apple.com/us/movie/example/apple-id"
  }, {
    monetizationType: "subscription",
    priceText: null,
    providerContentId: "123",
    providerHost: "www.netflix.com",
    providerName: "Netflix",
    rawLabel: "Netflix Subscription",
    watchUrl: "https://www.netflix.com/watch/123"
  }],
  offersComplete: true,
  queryText: "Apollo 13 movie",
  renderMs: 500,
  requestAfterRenderHasData: true,
  requestBeforeRenderHasData: false,
  resolvedSubtitle: null,
  resolvedTitle: "Apollo 13",
  retrievalMode: "hidden-render",
  seasonNumber: null,
  source: "google-search",
  sourceUrl: "https://www.google.com/search?q=Apollo+13",
  warmMs: 200
};

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

describe("Google watch selection", () => {
  it("launches only an enabled mapped provider", () => {
    expect(selectEnabledWatchOffer(result, ["netflix"])).toMatchObject({
      offer: { providerName: "Netflix" },
      serviceId: "netflix"
    });
    expect(selectEnabledWatchOffer(result, ["spotify"])).toBeNull();
  });

  it("reports purchase providers without treating them as subscriptions", () => {
    expect(watchAvailabilityDetail(result, ["spotify"]))
      .toBe("Apollo 13 is available on Apple TV $3.99, Netflix, but none are enabled in this profile.");
    expect(watchAvailabilityDetail(result, ["netflix"]))
      .toContain("Netflix (subscribed)");
  });

  it("marks enabled display-only subscription apps without making them launchable", () => {
    const huluResult: GoogleWatchResult = {
      ...result,
      offers: [{
        monetizationType: "subscription",
        priceText: null,
        providerContentId: "hulu-id",
        providerHost: "www.hulu.com",
        providerName: "Hulu",
        rawLabel: "Hulu Subscription",
        watchUrl: "https://www.hulu.com/movie/hulu-id"
      }]
    };
    expect(watchAvailabilityDetail(huluResult, ["hulu"]))
      .toBe("Apollo 13 is available on Hulu (subscribed).");
    expect(selectEnabledWatchOffer(huluResult, ["netflix", "youtube"]))
      .toBeNull();
  });

  it("never launches a rent-or-buy offer just because its app is enabled", () => {
    const youtubeFirst: GoogleWatchResult = {
      ...result,
      offers: [{
        monetizationType: "purchase_or_rental",
        priceText: "$3.99",
        providerContentId: "video-id",
        providerHost: "www.youtube.com",
        providerName: "YouTube",
        rawLabel: "YouTube $3.99",
        watchUrl: "https://www.youtube.com/watch?v=video-id"
      }, ...result.offers]
    };
    expect(selectEnabledWatchOffer(youtubeFirst, ["youtube", "netflix"])).toMatchObject({
      offer: { providerName: "Netflix" },
      serviceId: "netflix"
    });
    expect(selectEnabledWatchOffer(youtubeFirst, ["youtube"])).toBeNull();
  });

  it("uses lineup order to break ties between subscribed providers", () => {
    const multiSubscription: GoogleWatchResult = {
      ...result,
      offers: [...result.offers, {
        monetizationType: "subscription",
        priceText: null,
        providerContentId: "video-id",
        providerHost: "www.youtube.com",
        providerName: "YouTube",
        rawLabel: "YouTube Subscription",
        watchUrl: "https://www.youtube.com/watch?v=video-id"
      }]
    };
    expect(selectEnabledWatchOffer(multiSubscription, ["youtube", "netflix"])).toMatchObject({
      serviceId: "youtube"
    });
    expect(selectEnabledWatchOffer(multiSubscription, ["netflix", "youtube"])).toMatchObject({
      serviceId: "netflix"
    });
  });

  it("starts playback with partial offers while lookups request the complete list", () => {
    expect(watchOffersShouldBeComplete(intent(), ["netflix", "disney-plus"]))
      .toBe(false);
    expect(watchOffersShouldBeComplete(intent(), ["netflix", "spotify"]))
      .toBe(false);
    expect(watchOffersShouldBeComplete(intent({ providerHint: "netflix" }), [
      "netflix",
      "disney-plus"
    ])).toBe(false);
    expect(watchOffersShouldBeComplete(intent({ action: "lookup" }), ["netflix"]))
      .toBe(true);
  });

  it("expands an incomplete result when it has no launchable enabled offer", () => {
    expect(watchOffersShouldExpand(
      { offersComplete: false },
      null,
      ["netflix", "disney-plus"]
    )).toBe(true);
  });

  it("keeps an incomplete result when it already selected the preferred provider", () => {
    const partialResult: GoogleWatchResult = {
      ...result,
      offers: [result.offers[1]!],
      offersComplete: false
    };
    const selected = selectEnabledWatchOffer(
      partialResult,
      ["spotify", "netflix", "disney-plus"]
    );
    expect(selected).toMatchObject({ serviceId: "netflix" });
    expect(watchOffersShouldExpand(
      partialResult,
      selected,
      ["spotify", "netflix", "disney-plus"]
    )).toBe(false);
  });

  it("expands an incomplete result when a higher-priority provider could be missing", () => {
    const partialResult: GoogleWatchResult = {
      ...result,
      offers: [{
        monetizationType: "subscription",
        priceText: null,
        providerContentId: "movie-id",
        providerHost: "www.disneyplus.com",
        providerName: "Disney+",
        rawLabel: "Disney+ Subscription",
        watchUrl: "https://www.disneyplus.com/video/movie-id"
      }],
      offersComplete: false
    };
    const selected = selectEnabledWatchOffer(partialResult, ["netflix", "disney-plus"]);
    expect(selected).toMatchObject({ serviceId: "disney-plus" });
    expect(watchOffersShouldExpand(
      partialResult,
      selected,
      ["netflix", "disney-plus"]
    )).toBe(true);
  });

  it("never re-expands a result Google already marked complete", () => {
    expect(watchOffersShouldExpand(
      result,
      selectEnabledWatchOffer(result, ["disney-plus", "netflix"]),
      ["disney-plus", "netflix"]
    )).toBe(false);
    expect(watchOffersShouldExpand(result, null, ["netflix"]))
      .toBe(false);
  });

  it("maps a subscribed Disney Plus offer into the app-owned service", () => {
    const disneyResult: GoogleWatchResult = {
      ...result,
      offers: [{
        monetizationType: "subscription",
        priceText: null,
        providerContentId: "movie-id",
        providerHost: "www.disneyplus.com",
        providerName: "Disney+",
        rawLabel: "Disney+ Subscription",
        watchUrl: "https://www.disneyplus.com/video/movie-id"
      }]
    };
    expect(selectEnabledWatchOffer(disneyResult, ["disney-plus", "netflix"]))
      .toMatchObject({ serviceId: "disney-plus" });
  });

  it("accepts price-free subscription-only providers with sparse Google labels", () => {
    expect(selectEnabledWatchOffer({
      ...result,
      offers: [{
        ...result.offers[1]!,
        monetizationType: null,
        rawLabel: "Netflix"
      }]
    }, ["netflix"])).toMatchObject({ serviceId: "netflix" });
  });

  it("verifies title identity before using a direct provider URL", () => {
    expect(googleWatchResultMatchesIntent(result, intent())).toBe(true);
    expect(googleWatchResultMatchesIntent({
      ...result,
      resolvedTitle: "Apollo 18"
    }, intent())).toBe(false);
    expect(googleWatchResultMatchesIntent({
      ...result,
      resolvedTitle: "Dune: Prophecy"
    }, intent({ title: "Dune" }))).toBe(false);
    expect(googleWatchResultMatchesIntent({
      ...result,
      resolvedTitle: "Apollo 13 movie"
    }, intent())).toBe(true);
  });

  it("requires exact visible episode coordinates before direct playback", () => {
    const episodeIntent = intent({
      episode: 3,
      mediaType: "episode",
      season: 1,
      title: "Breaking Bad"
    });
    expect(googleWatchResultMatchesIntent({
      ...result,
      resolvedSubtitle: "Season 1, Episode 3 — And the Bag's in the River",
      resolvedTitle: "Breaking Bad"
    }, episodeIntent)).toBe(true);
    expect(googleWatchResultMatchesIntent({
      ...result,
      resolvedSubtitle: "S1 E4 — Cancer Man",
      resolvedTitle: "Breaking Bad"
    }, episodeIntent)).toBe(false);
    expect(googleWatchResultMatchesIntent({
      ...result,
      resolvedSubtitle: null,
      resolvedTitle: "Breaking Bad"
    }, episodeIntent)).toBe(false);
  });
});
