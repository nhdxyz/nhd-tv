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

class FakeElement {
  clicked = false;
  readonly #attributes: Record<string, string>;
  readonly #byline: FakeElement | null;
  readonly #card: FakeElement | null;
  textContent: string;

  constructor(options: {
    attributes?: Record<string, string>;
    byline?: FakeElement | null;
    card?: FakeElement | null;
    text?: string;
  } = {}) {
    this.#attributes = options.attributes ?? {};
    this.#byline = options.byline ?? null;
    this.#card = options.card ?? null;
    this.textContent = options.text ?? "";
  }

  click(): void {
    this.clicked = true;
  }

  closest(): FakeElement {
    return this.#card ?? this;
  }

  getAttribute(name: string): string | null {
    return this.#attributes[name] ?? null;
  }

  getBoundingClientRect(): { height: number; width: number } {
    return { height: 100, width: 100 };
  }

  querySelector(): FakeElement | null {
    return this.#byline;
  }
}

function executeYouTubeScript(
  voiceIntent: VoiceMediaIntent,
  anchors: FakeElement[]
): boolean {
  const script = buildYouTubeVoiceAutomationScript(voiceIntent);
  const run = new Function(
    "document",
    "HTMLElement",
    "getComputedStyle",
    `return ${script};`
  );
  return run(
    { querySelectorAll: () => anchors },
    FakeElement,
    () => ({ display: "block", visibility: "visible" })
  ) as boolean;
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
    expect(script).toContain("exactTitle");
    expect(script).not.toContain('[data-testid="card-container"],section');
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
    expect(channelScript).toContain("creatorIdentity");
    expect(channelScript).toContain("candidates.sort");
    expect(channelScript).toContain('ytd-channel-name a');
    expect(channelScript).toContain('a[href^="/watch?"]');
    expect(channelScript).not.toContain("innerHTML");
  });

  it("requires a creator byline match before selecting a YouTube video", () => {
    const script = buildYouTubeVoiceAutomationScript(intent({ recency: "latest" }));
    expect(script).toContain("bylineIdentity === creatorIdentity");
    expect(script).toContain("else if (bylineIdentity) continue");
    expect(script).toContain('intent.recency === "latest"');
  });

  it("skips fan uploads before opening the named creator's latest video", () => {
    const fanByline = new FakeElement({ text: "Outdoor Adventures Fan" });
    const creatorByline = new FakeElement({ text: "Outdoor Boys" });
    const fanCard = new FakeElement({ byline: fanByline, text: "Outdoor Boys newest upload" });
    const creatorCard = new FakeElement({ byline: creatorByline, text: "A remote island camp" });
    const fanVideo = new FakeElement({
      attributes: { href: "/watch?v=fan", title: "Outdoor Boys latest news" },
      card: fanCard
    });
    const creatorVideo = new FakeElement({
      attributes: { href: "/watch?v=official", title: "A remote island camp" },
      card: creatorCard
    });

    expect(executeYouTubeScript(intent({ recency: "latest" }), [fanVideo, creatorVideo]))
      .toBe(true);
    expect(fanVideo.clicked).toBe(false);
    expect(creatorVideo.clicked).toBe(true);
  });

  it("leaves results open when no video belongs to the requested creator", () => {
    const unrelatedCard = new FakeElement({
      byline: new FakeElement({ text: "Different Channel" }),
      text: "Outdoor Boys reaction"
    });
    const unrelatedVideo = new FakeElement({
      attributes: { href: "/watch?v=unrelated", title: "Outdoor Boys reaction" },
      card: unrelatedCard
    });

    expect(executeYouTubeScript(intent({ recency: "latest" }), [unrelatedVideo])).toBe(false);
    expect(unrelatedVideo.clicked).toBe(false);
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
