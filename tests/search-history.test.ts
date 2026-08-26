import { describe, expect, it } from "vitest";
import type { ContinueWatchingItem } from "../src/main/contracts";
import { matchContinueWatching } from "../src/renderer/search-history";

function item(overrides: Partial<ContinueWatchingItem>): ContinueWatchingItem {
  return {
    artworkDataUrl: null,
    durationSeconds: 2_400,
    id: "item",
    positionSeconds: 600,
    serviceId: "netflix",
    serviceName: "Netflix",
    subtitle: "S1 E2 · The Train",
    title: "Example Show",
    updatedAt: 1,
    ...overrides
  };
}

describe("dynamic local search", () => {
  it("matches title, subtitle, and service within the active lineup", () => {
    const items = [
      item({ id: "title" }),
      item({ id: "subtitle", serviceId: "youtube", serviceName: "YouTube", title: "Travel", subtitle: "Night train" }),
      item({ id: "disabled", serviceId: "disney-plus", serviceName: "Disney+", title: "Train Movie" })
    ];

    expect(matchContinueWatching(items, new Set(["netflix", "youtube"]), "  TRAIN ").map((match) => match.id))
      .toEqual(["title", "subtitle"]);
    expect(matchContinueWatching(items, new Set(["youtube"]), "youtube").map((match) => match.id))
      .toEqual(["subtitle"]);
  });

  it("returns no results for empty input and respects its result cap", () => {
    const items = Array.from({ length: 8 }, (_, index) => item({ id: String(index) }));
    expect(matchContinueWatching(items, new Set(["netflix"]), " ")).toEqual([]);
    expect(matchContinueWatching(items, new Set(["netflix"]), "example")).toHaveLength(6);
  });
});
