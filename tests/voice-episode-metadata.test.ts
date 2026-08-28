import { describe, expect, it } from "vitest";
import { parseVoiceEpisodeCoordinates } from "../src/main/voice/voice-episode-metadata";

describe("voice episode metadata", () => {
  it.each([
    "Season 1, Episode 3 — And the Bag's in the River",
    "season 01 episode 003",
    "S1:E3 Cancer Man",
    "S01 E03"
  ])("extracts explicit coordinates from %s", (value) => {
    expect(parseVoiceEpisodeCoordinates(value)).toEqual({
      episodeNumber: 3,
      seasonNumber: 1
    });
  });

  it("rejects incomplete or non-positive coordinates", () => {
    expect(parseVoiceEpisodeCoordinates("Episode 3")).toBeNull();
    expect(parseVoiceEpisodeCoordinates("Season 1")).toBeNull();
    expect(parseVoiceEpisodeCoordinates("S0:E3")).toBeNull();
    expect(parseVoiceEpisodeCoordinates("Cancer Man")).toBeNull();
  });
});
