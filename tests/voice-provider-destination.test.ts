import { describe, expect, it } from "vitest";
import {
  isVoiceProviderDestinationServiceId,
  voiceProviderDestinationRoute
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
});
