import { describe, expect, it } from "vitest";
import { googleWatchResultMatchesIdentity } from "../src/main/voice/google-watch-identity";

function matches(
  resolvedTitle: string | null,
  resolvedSubtitle: string | null,
  overrides: Partial<Parameters<typeof googleWatchResultMatchesIdentity>[1]> = {}
): boolean {
  return googleWatchResultMatchesIdentity(
    { resolvedSubtitle, resolvedTitle },
    {
      episodeNumber: null,
      mediaType: "movie",
      requestedTitle: "Apollo 13",
      seasonNumber: null,
      ...overrides
    }
  );
}

describe("Google watch result identity", () => {
  it("accepts an exact title with harmless media labels", () => {
    expect(matches("Apollo 13", null)).toBe(true);
    expect(matches("Apollo 13 movie", null)).toBe(true);
    expect(matches("Amelie film", null, { requestedTitle: "Amélie" })).toBe(true);
  });

  it("rejects missing, partial, and different title identities", () => {
    expect(matches(null, null)).toBe(false);
    expect(matches("Apollo", null)).toBe(false);
    expect(matches("Apollo 18", null)).toBe(false);
  });

  it("requires the requested season and episode in visible metadata", () => {
    const episode = {
      episodeNumber: 3,
      mediaType: "episode",
      requestedTitle: "Breaking Bad",
      seasonNumber: 1
    };
    expect(matches("Breaking Bad", "Season 1, Episode 3 — And the Bag's in the River", episode))
      .toBe(true);
    expect(matches("Breaking Bad", "S01 E03", episode)).toBe(true);
    expect(matches("Breaking Bad", "S1 E4", episode)).toBe(false);
    expect(matches("Breaking Bad", null, episode)).toBe(false);
  });
});
