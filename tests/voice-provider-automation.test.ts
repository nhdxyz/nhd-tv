import { describe, expect, it } from "vitest";
import {
  applyYouTubeLatestSort,
  buildNetflixVoiceAutomationScript,
  buildSpotifyVoiceAutomationScript,
  buildYouTubeVoiceAutomationScript,
  type VoiceProviderAutomationResult
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
  readonly #selectAll: ((selector: string) => FakeElement[]) | null;
  readonly #selectors: Record<string, FakeElement[]>;
  readonly #visible: boolean;
  textContent: string;

  constructor(options: {
    attributes?: Record<string, string>;
    byline?: FakeElement | null;
    card?: FakeElement | null;
    selectAll?: (selector: string) => FakeElement[];
    selectors?: Record<string, FakeElement[]>;
    text?: string;
    visible?: boolean;
  } = {}) {
    this.#attributes = options.attributes ?? {};
    this.#byline = options.byline ?? null;
    this.#card = options.card ?? null;
    this.#selectAll = options.selectAll ?? null;
    this.#selectors = options.selectors ?? {};
    this.#visible = options.visible ?? true;
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
    return this.#visible ? { height: 100, width: 100 } : { height: 0, width: 0 };
  }

  querySelector(selector: string): FakeElement | null {
    return this.#selectors[selector]?.[0] ?? this.#byline;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return this.#selectAll?.(selector) ?? this.#selectors[selector] ?? [];
  }
}

function executeProviderScript(
  script: string,
  documentValue: object,
  pathname: string
): VoiceProviderAutomationResult {
  const run = new Function(
    "document",
    "HTMLElement",
    "getComputedStyle",
    "location",
    `return ${script};`
  );
  return run(
    documentValue,
    FakeElement,
    () => ({ display: "block", opacity: "1", visibility: "visible" }),
    { pathname }
  ) as VoiceProviderAutomationResult;
}

function executeYouTubeScript(
  voiceIntent: VoiceMediaIntent,
  anchors: FakeElement[]
): VoiceProviderAutomationResult {
  const script = buildYouTubeVoiceAutomationScript(voiceIntent);
  const run = new Function(
    "document",
    "HTMLElement",
    "getComputedStyle",
    "location",
    `return ${script};`
  );
  return run(
    {
      fullscreenElement: null,
      querySelector: () => null,
      querySelectorAll: () => anchors
    },
    FakeElement,
    () => ({ display: "block", opacity: "1", visibility: "visible" }),
    { pathname: "/results" }
  ) as VoiceProviderAutomationResult;
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
    expect(script).toContain("exactLink");
    expect(script).toContain("candidateMatches");
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
      .toBe("navigated");
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

    expect(executeYouTubeScript(intent({ recency: "latest" }), [unrelatedVideo])).toBe("idle");
    expect(unrelatedVideo.clicked).toBe(false);
  });

  it("tolerates one phonetic spelling character in a YouTube creator name", () => {
    const creatorCard = new FakeElement({
      byline: new FakeElement({ text: "Cody Ko" }),
      text: "A new Cody Ko upload"
    });
    const video = new FakeElement({
      attributes: { href: "/watch?v=cody", title: "The Button" },
      card: creatorCard
    });

    expect(executeYouTubeScript(intent({
      creator: "Cody Co",
      recency: "latest",
      title: "latest video"
    }), [video])).toBe("navigated");
    expect(video.clicked).toBe(true);
  });

  it("waits for YouTube playback and requests provider fullscreen before succeeding", () => {
    const fullscreen = new FakeElement({ attributes: { "aria-label": "Full screen" } });
    const documentValue = {
      fullscreenElement: null as object | null,
      querySelector: (selector: string) => selector === "video"
        ? { ended: false, paused: false, readyState: 4 }
        : null,
      querySelectorAll: (selector: string) => selector.includes("ytp-fullscreen-button")
        ? [fullscreen]
        : []
    };
    const script = buildYouTubeVoiceAutomationScript(intent());

    expect(executeProviderScript(script, documentValue, "/watch"))
      .toBe("fullscreen-requested");
    expect(fullscreen.clicked).toBe(true);

    documentValue.fullscreenElement = { contains: () => true };
    expect(executeProviderScript(script, documentValue, "/watch")).toBe("complete");
  });

  it("selects the hinted Netflix profile and falls back to the first normal profile", () => {
    const nateName = new FakeElement({ text: "Nate" });
    const guestName = new FakeElement({ text: "Guest" });
    const nate = new FakeElement({
      selectors: { '.profile-name,[data-uia="profile-name"]': [nateName] },
      text: "Nate"
    });
    const guest = new FakeElement({
      selectors: { '.profile-name,[data-uia="profile-name"]': [guestName] },
      text: "Guest"
    });
    const manage = new FakeElement({ attributes: { "aria-label": "Manage Profiles" } });
    const documentValue = {
      body: { innerText: "Who's watching?" },
      fullscreenElement: null,
      querySelector: () => null,
      querySelectorAll: (selector: string) => selector.includes('data-uia="profile-link"')
        ? [nate, guest, manage]
        : []
    };

    expect(executeProviderScript(
      buildNetflixVoiceAutomationScript(intent({
        mediaType: "show",
        providerHint: "netflix",
        title: "Breaking Bad"
      }), "Guest"),
      documentValue,
      "/browse"
    )).toBe("profile-selected");
    expect(guest.clicked).toBe(true);
    expect(nate.clicked).toBe(false);

    guest.clicked = false;
    expect(executeProviderScript(
      buildNetflixVoiceAutomationScript(intent({
        mediaType: "show",
        providerHint: "netflix",
        title: "Breaking Bad"
      }), "Missing profile"),
      documentValue,
      "/browse"
    )).toBe("profile-selected");
    expect(nate.clicked).toBe(true);
    expect(guest.clicked).toBe(false);
  });

  it("prefers Netflix Resume over Play and requires fullscreen playback to finish", () => {
    const play = new FakeElement({ attributes: { "aria-label": "Play" } });
    const resume = new FakeElement({ attributes: { "aria-label": "Resume" } });
    const fullscreen = new FakeElement({ attributes: { "aria-label": "Full screen" } });
    const detailDocument = {
      body: { innerText: "Breaking Bad" },
      fullscreenElement: null as object | null,
      querySelector: () => null,
      querySelectorAll: (selector: string) => {
        if (selector.includes('data-uia="profile-link"')) return [];
        if (selector === 'button,a,[role="button"]') return [play, resume];
        return [];
      }
    };
    const script = buildNetflixVoiceAutomationScript(intent({
      mediaType: "show",
      providerHint: "netflix",
      title: "Breaking Bad"
    }));

    expect(executeProviderScript(script, detailDocument, "/title/70143836"))
      .toBe("play-clicked");
    expect(resume.clicked).toBe(true);
    expect(play.clicked).toBe(false);

    const playbackDocument = {
      ...detailDocument,
      querySelector: (selector: string) => selector === "video"
        ? { ended: false, paused: false, readyState: 4 }
        : null,
      querySelectorAll: (selector: string) => selector.includes("control-fullscreen-enter")
        ? [fullscreen]
        : []
    };
    expect(executeProviderScript(script, playbackDocument, "/watch/70143836"))
      .toBe("fullscreen-requested");
    expect(fullscreen.clicked).toBe(true);
    playbackDocument.fullscreenElement = { contains: () => true };
    expect(executeProviderScript(script, playbackDocument, "/watch/70143836"))
      .toBe("complete");
  });

  it("opens only an exact Netflix search card before attempting playback", () => {
    const wrongDestination = new FakeElement({ attributes: { href: "/title/wrong" } });
    const rightDestination = new FakeElement({ attributes: { href: "/title/right" } });
    const wrongSignal = new FakeElement({ attributes: { "aria-label": "Breaking Bad Reunion" } });
    const rightSignal = new FakeElement({ attributes: { "aria-label": "Breaking Bad" } });
    const card = (destination: FakeElement, signal: FakeElement) => new FakeElement({
      selectAll: (selector) => selector.includes("img[alt]")
        ? [signal]
        : selector.includes('a[href^="/title/"]') ? [destination] : []
    });
    const wrongCard = card(wrongDestination, wrongSignal);
    const rightCard = card(rightDestination, rightSignal);
    const documentValue = {
      body: { innerText: "Search" },
      fullscreenElement: null,
      querySelector: () => null,
      querySelectorAll: (selector: string) => {
        if (selector.includes('data-uia="profile-link"')) return [];
        if (selector.includes('data-uia="search-video"')) return [wrongCard, rightCard];
        return [];
      }
    };

    expect(executeProviderScript(buildNetflixVoiceAutomationScript(intent({
      mediaType: "show",
      providerHint: "netflix",
      title: "Breaking Bad"
    })), documentValue, "/search")).toBe("navigated");
    expect(wrongDestination.clicked).toBe(false);
    expect(rightDestination.clicked).toBe(true);
  });

  it("plays only the Spotify song row with an exact title and artist pair", () => {
    const wrongPlay = new FakeElement({ attributes: { "aria-label": "Play Stronger" } });
    const rightPlay = new FakeElement({ attributes: { "aria-label": "Play Stronger" } });
    const row = (artist: string, button: FakeElement) => {
      const track = new FakeElement({ attributes: { href: "/track/stronger" }, text: "Stronger" });
      const artistLink = new FakeElement({ attributes: { href: "/artist/kanye" }, text: artist });
      return new FakeElement({
        selectAll: (selector) => selector === "a[href]"
          ? [track, artistLink]
          : selector.includes('data-testid="play-button"') ? [button] : []
      });
    };
    const wrongRow = row("Kelly Clarkson", wrongPlay);
    const rightRow = row("Kanye West", rightPlay);
    const documentValue = {
      querySelector: () => null,
      querySelectorAll: (selector: string) => selector.includes('data-testid="tracklist-row"')
        ? [wrongRow, rightRow]
        : []
    };

    const script = buildSpotifyVoiceAutomationScript(intent({
      creator: "Kanye West",
      mediaType: "song",
      providerHint: "spotify",
      title: "Stronger"
    }));
    expect(executeProviderScript(script, documentValue, "/search/Stronger"))
      .toBe("play-clicked");
    expect(wrongPlay.clicked).toBe(false);
    expect(rightPlay.clicked).toBe(true);

    const nowPlaying = new FakeElement({ selectors: {
      '[data-testid="context-item-info-subtitles"],a[href^="/artist/"]': [
        new FakeElement({ text: "Kanye West" })
      ],
      '[data-testid="context-item-info-title"],a[href^="/track/"]': [
        new FakeElement({ text: "Stronger" })
      ]
    } });
    const pause = new FakeElement({ attributes: { "aria-label": "Pause" } });
    const playbackDocument = {
      querySelector: (selector: string) => selector.includes("now-playing-widget")
        ? nowPlaying
        : null,
      querySelectorAll: (selector: string) => selector.includes("control-button-playpause")
        ? [pause]
        : []
    };
    expect(executeProviderScript(script, playbackDocument, "/search/Stronger"))
      .toBe("complete");
  });

  it("bounds provider retries and revalidates a Netflix destination before profile recovery", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("../src/main/service-host.ts", import.meta.url), "utf8")
    );

    expect(source).toContain("VOICE_PROVIDER_AUTOMATION_TIMEOUT_MS = 20_000");
    expect(source).toContain('["netflix", "spotify", "youtube"]');
    expect(source).toContain("result === \"profile-selected\"");
    expect(source).toContain("isAllowedServiceUrl(");
    expect(source).toContain("await view.webContents.loadURL(intendedDestination)");
    expect(source).toContain("result === \"playing\"");
    expect(source).toContain('keyCode: "F"');
    expect(source).toContain('result === "complete"');
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
