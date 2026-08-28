import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openGoogleWatchCache } from "./google-watch-cache.mjs";

const directory = mkdtempSync(path.join(tmpdir(), "nhd-google-watch-cache-"));
const databasePath = path.join(directory, "watch-results.sqlite");

try {
  const cache = openGoogleWatchCache(databasePath);
  const baseResult = {
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
      watchUrl: "https://www.netflix.com/watch/70196254?source=35"
    }],
    offersComplete: false,
    queryText: "Breaking Bad season 1 episode 3",
    renderMs: 650,
    requestAfterRenderHasData: false,
    requestBeforeRenderHasData: false,
    resolvedSubtitle: "Breaking Bad: Season 1, Episode 3",
    resolvedTitle: "...And the Bag's in the River",
    retrievalMode: "hidden-render",
    seasonNumber: 1,
    source: "google-search",
    sourceUrl: "https://www.google.com/search?q=Breaking+Bad",
    warmMs: 300
  };

  const firstId = cache.save(baseResult);
  const secondId = cache.save({
    ...baseResult,
    fetchedAt: "2026-08-28T01:00:00.000Z",
    offers: [{
      monetizationType: "purchase_or_rental",
      priceText: "$1.99",
      providerContentId: "75om3c5p2q69ld8r2sowraim7",
      providerHost: "tv.apple.com",
      providerName: "Apple TV",
      rawLabel: "Apple TV $1.99 Watch",
      watchUrl: "https://tv.apple.com/us/episode/example/umc.cmc.75om3c5p2q69ld8r2sowraim7"
    }]
  });

  assert.equal(secondId, firstId, "Repeated queries should update the existing cached title");
  const rows = cache.exportRows();
  assert.equal(rows.length, 1, "Updating a title should replace stale provider offers");
  assert.equal(rows[0].provider_name, "Apple TV");
  assert.equal(rows[0].resolved_title, "...And the Bag's in the River");
  assert.equal(rows[0].season_number, 1);
  assert.equal(rows[0].episode_number, 3);
  assert.equal(rows[0].offers_complete, 0);
  cache.close();
  console.log("[google-watch-cache] local SQLite cache verified");
} finally {
  rmSync(directory, { force: true, recursive: true });
}
