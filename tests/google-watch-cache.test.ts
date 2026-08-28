import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  GoogleWatchCache,
  normalizeGoogleWatchQuery,
  type GoogleWatchResult
} from "../src/main/voice/google-watch-cache";

const directories: string[] = [];

function result(overrides: Partial<GoogleWatchResult> = {}): GoogleWatchResult {
  return {
    countryCode: "US",
    episodeNumber: 3,
    expiresAt: "2026-08-29T00:00:00.000Z",
    fetchedAt: "2026-08-28T00:00:00.000Z",
    mediaType: "episode",
    offers: [{
      monetizationType: "subscription",
      priceText: null,
      providerContentId: "70196254",
      providerHost: "www.netflix.com",
      providerName: "Netflix",
      rawLabel: "Netflix Subscription Watch",
      watchUrl: "https://www.netflix.com/watch/70196254"
    }],
    offersComplete: true,
    queryText: "Breaking Bad season 1 episode 3",
    renderMs: 620,
    requestAfterRenderHasData: true,
    requestBeforeRenderHasData: false,
    resolvedSubtitle: "Season 1, Episode 3",
    resolvedTitle: "...And the Bag's in the River",
    retrievalMode: "hidden-render",
    seasonNumber: 1,
    source: "google-search",
    sourceUrl: "https://www.google.com/search?q=Breaking+Bad",
    warmMs: 300,
    ...overrides
  };
}

function cache(): GoogleWatchCache {
  const directory = mkdtempSync(path.join(tmpdir(), "nhd-google-watch-cache-"));
  directories.push(directory);
  return new GoogleWatchCache(path.join(directory, "watch-results.sqlite"));
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("Google watch cache", () => {
  it("normalizes equivalent queries", () => {
    expect(normalizeGoogleWatchQuery("  Breaking   BAD ")).toBe("breaking bad");
  });

  it("round-trips a fresh regional result and its offers", () => {
    const database = cache();
    database.save(result());
    expect(database.getFresh(
      "breaking bad season 1 episode 3",
      "us",
      new Date("2026-08-28T12:00:00.000Z")
    )).toEqual(result());
    expect(database.exportRows()).toHaveLength(1);
    database.close();
  });

  it("replaces stale offers and does not return expired results", () => {
    const database = cache();
    database.save(result());
    database.save(result({ offers: [{
      monetizationType: "purchase_or_rental",
      priceText: "$1.99",
      providerContentId: "episode-id",
      providerHost: "tv.apple.com",
      providerName: "Apple TV",
      rawLabel: "Apple TV $1.99",
      watchUrl: "https://tv.apple.com/us/episode/example/episode-id"
    }] }));
    expect(database.exportRows()).toMatchObject([{ provider_name: "Apple TV" }]);
    expect(database.getFresh(
      result().queryText,
      "US",
      new Date("2026-08-30T00:00:00.000Z")
    )).toBeNull();
    database.close();
  });
});
