import { describe, expect, it } from "vitest";
import {
  resolveVoiceMediaDestination,
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
    expect(resolveVoiceMediaDestination(intent({
      action: "open",
      mediaType: "recommendation",
      title: "tense action movies with a clever lead"
    }), ["netflix"])).toEqual({
      query: "tense action movies with a clever lead",
      serviceId: "netflix"
    });
    expect(resolveVoiceMediaDestination(intent({
      action: "open",
      mediaType: "similar-title",
      title: "Inception"
    }), ["netflix"])).toEqual({ query: "Inception", serviceId: "netflix" });
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
});
