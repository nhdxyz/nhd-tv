import { describe, expect, it } from "vitest";
import {
  isVoiceDiscoveryIntent,
  resolveVoiceMediaDestination,
  voiceDiscoveryOpenedDetail,
  voiceMediaSearchQuery
} from "../src/main/voice/voice-media-destination";
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

describe("voice media destination", () => {
  it("prefers Netflix for general video when it is enabled", () => {
    expect(resolveVoiceMediaDestination(intent(), ["spotify", "youtube", "netflix"]))
      .toEqual({ query: "Apollo 13", serviceId: "netflix" });
    expect(resolveVoiceMediaDestination(intent(), ["spotify", "youtube"]))
      .toBeNull();
  });

  it("routes audio and YouTube shapes without model-provided URLs", () => {
    expect(resolveVoiceMediaDestination(intent({
      creator: "Kanye West",
      mediaType: "song",
      title: "Stronger"
    }), ["netflix", "spotify"])).toEqual({
      query: "Stronger Kanye West",
      serviceId: "spotify"
    });
    expect(resolveVoiceMediaDestination(intent({
      creator: "Outdoor Boys",
      mediaType: "channel",
      title: "Outdoor Boys"
    }), ["youtube"])).toEqual({ query: "Outdoor Boys", serviceId: "youtube" });
  });

  it("preserves latest-video meaning and reports no subscribed destination", () => {
    expect(voiceMediaSearchQuery(intent({
      creator: "Outdoor Boys",
      mediaType: "video",
      providerHint: "youtube",
      recency: "latest",
      title: "latest video"
    }))).toBe("Outdoor Boys");
    expect(resolveVoiceMediaDestination(intent({ providerHint: "netflix" }), []))
      .toBeNull();
  });

  it("opens bounded recommendation discovery in Netflix rather than exact-title lookup", () => {
    const recommendation = intent({
      action: "open",
      mediaType: "recommendation",
      title: "tense action movies with a clever lead"
    });
    expect(resolveVoiceMediaDestination(recommendation, ["netflix"])).toEqual({
      query: "tense action movies with a clever lead",
      serviceId: "netflix"
    });
    expect(isVoiceDiscoveryIntent(recommendation)).toBe(true);
    expect(voiceDiscoveryOpenedDetail(recommendation, "Netflix"))
      .toBe("Searched Netflix for tense action movies with a clever lead.");
    const similar = intent({
      action: "open",
      mediaType: "similar-title",
      title: "Inception"
    });
    expect(resolveVoiceMediaDestination(similar, ["netflix"]))
      .toEqual({ query: "Inception", serviceId: "netflix" });
    expect(voiceDiscoveryOpenedDetail(similar, "Netflix"))
      .toBe("Searched Netflix for titles related to Inception.");
  });

  it("keeps an explicit Disney Plus exact-title request on Disney Plus", () => {
    expect(resolveVoiceMediaDestination(intent({
      mediaType: "movie",
      providerHint: "disney-plus",
      title: "Moana"
    }), ["disney-plus", "netflix"])).toEqual({
      query: "Moana",
      serviceId: "disney-plus"
    });
  });

  it("allows search-only requests to use a safe active-provider candidate", () => {
    expect(resolveVoiceMediaDestination(intent({
      action: "search",
      title: "Dune"
    }), ["youtube"])).toEqual({ query: "Dune", serviceId: "youtube" });
    expect(resolveVoiceMediaDestination(intent({
      action: "search",
      providerHint: "spotify",
      title: "Kanye West"
    }), ["spotify"])).toEqual({ query: "Kanye West", serviceId: "spotify" });
  });

  it("prefers an implied search app when enabled and otherwise uses the safe fallback", () => {
    const artistSearch = intent({
      action: "search",
      mediaType: "artist",
      providerHint: null,
      title: "Taylor Swift"
    });
    expect(resolveVoiceMediaDestination(artistSearch, ["youtube", "spotify"]))
      .toEqual({ query: "Taylor Swift", serviceId: "spotify" });
    expect(resolveVoiceMediaDestination(artistSearch, ["youtube"]))
      .toEqual({ query: "Taylor Swift", serviceId: "youtube" });
  });

  it("honors a named search provider even when the media label implies another app", () => {
    expect(resolveVoiceMediaDestination(intent({
      action: "search",
      mediaType: "artist",
      providerHint: "youtube",
      title: "Taylor Swift"
    }), ["spotify", "youtube"])).toEqual({
      query: "Taylor Swift",
      serviceId: "youtube"
    });
  });
});
