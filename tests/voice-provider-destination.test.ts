import { describe, expect, it } from "vitest";
import {
  isVoiceProviderDestinationServiceId,
  voiceProviderDestinationRoute,
  voiceProviderDestinationUrlMatches
} from "../src/main/voice/voice-provider-destination";

describe("voice provider destination map", () => {
  it("returns only the three qualified fixed routes", () => {
    expect(voiceProviderDestinationRoute("youtube", "subscriptions")).toEqual({
      destination: "subscriptions",
      serviceId: "youtube",
      url: "https://www.youtube.com/feed/subscriptions"
    });
    expect(voiceProviderDestinationRoute("youtube", "library")).toEqual({
      destination: "library",
      serviceId: "youtube",
      url: "https://www.youtube.com/feed/you"
    });
    expect(voiceProviderDestinationRoute("spotify", "library")).toEqual({
      destination: "library",
      serviceId: "spotify",
      url: "https://open.spotify.com/collection/playlists"
    });
  });

  it("does not synthesize routes for unsupported provider and destination pairs", () => {
    expect(voiceProviderDestinationRoute("spotify", "subscriptions")).toBeNull();
    expect(voiceProviderDestinationRoute("netflix", "library")).toBeNull();
    expect(voiceProviderDestinationRoute("disney-plus", "subscriptions")).toBeNull();
    expect(voiceProviderDestinationRoute("custom-service", "library")).toBeNull();
  });

  it("recognizes only providers represented in the fixed map", () => {
    expect(isVoiceProviderDestinationServiceId("spotify")).toBe(true);
    expect(isVoiceProviderDestinationServiceId("youtube")).toBe(true);
    expect(isVoiceProviderDestinationServiceId("netflix")).toBe(false);
  });

  it("requires the final origin and canonical path while allowing provider query state", () => {
    const route = voiceProviderDestinationRoute("youtube", "subscriptions");
    if (route === null) throw new Error("Expected YouTube subscriptions route");
    expect(voiceProviderDestinationUrlMatches(
      "https://www.youtube.com/feed/subscriptions?flow=2#section",
      route
    )).toBe(true);
    expect(voiceProviderDestinationUrlMatches(
      "https://www.youtube.com/feed/subscriptions/",
      route
    )).toBe(true);
    expect(voiceProviderDestinationUrlMatches("https://www.youtube.com/", route)).toBe(false);
    expect(voiceProviderDestinationUrlMatches("https://accounts.google.com/login", route))
      .toBe(false);
    expect(voiceProviderDestinationUrlMatches(
      "https://user@www.youtube.com/feed/subscriptions",
      route
    )).toBe(false);
    expect(voiceProviderDestinationUrlMatches(null, route)).toBe(false);
  });
});
