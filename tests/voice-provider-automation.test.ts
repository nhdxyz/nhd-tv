import { describe, expect, it } from "vitest";
import {
  applyYouTubeLatestSort,
  buildSpotifyVoiceAutomationScript,
  buildYouTubeVoiceAutomationScript
} from "../src/main/voice/voice-provider-automation";
import type { VoiceMediaIntent } from "../src/main/voice/voice-intent";

function intent(overrides: Partial<VoiceMediaIntent> = {}): VoiceMediaIntent {
  return {
    action: "play",
    creator: "Outdoor Boys",
    episode: null,
    kind: "media",
    mediaType: "video",
    providerHint: "youtube",
    recency: null,
    season: null,
    title: "Camping",
    ...overrides
  };
}

describe("voice provider automation", () => {
  it("serializes voice text as data and limits Spotify actions to visible provider controls", () => {
    const script = buildSpotifyVoiceAutomationScript(intent({
      creator: "Kanye West",
      mediaType: "song",
      providerHint: "spotify",
      title: 'Stronger"; location="https://evil.test'
    }));
    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain('Stronger\\"; location=\\"https://evil.test');
    expect(script).toContain('[data-testid="play-button"]');
    expect(script).not.toContain("eval(");
    expect(script).not.toContain("innerHTML");
  });

  it("uses provider-owned channel and video anchors on YouTube", () => {
    const channelScript = buildYouTubeVoiceAutomationScript(intent({
      mediaType: "channel",
      title: "Outdoor Boys"
    }));
    expect(() => new Function(channelScript)).not.toThrow();
    expect(channelScript).toContain("ytd-channel-renderer");
    expect(channelScript).toContain('a[href^="/watch?"]');
  });

  it("adds the YouTube upload-date token only for latest-video searches", () => {
    const base = "https://www.youtube.com/results?search_query=Outdoor+Guys";
    const sorted = new URL(applyYouTubeLatestSort(base, intent({ recency: "latest" })));
    expect(sorted.searchParams.get("sp")).toBe("CAI%3D");
    expect(applyYouTubeLatestSort(base, intent())).toBe(base);
    expect(applyYouTubeLatestSort("https://example.test/results", intent({ recency: "latest" })))
      .toBe("https://example.test/results");
  });
});
