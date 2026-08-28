import { describe, expect, it } from "vitest";
import {
  selectEnabledWatchOffer,
  watchAvailabilityDetail
} from "../src/main/voice/google-watch-selection";
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
});
