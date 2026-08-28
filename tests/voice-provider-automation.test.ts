import { describe, expect, it } from "vitest";
import {
  applyYouTubeLatestSort,
  buildNetflixVoiceAutomationScript,
  buildSpotifyVoiceAutomationScript,
  buildYouTubeVoiceAutomationScript,
  netflixContentIdFromUrl,
  voiceProviderCommandHandled,
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
    expect(script).toContain("else continue");
    expect(script).toContain('intent.recency === "latest"');
  });

  it("opens a YouTube channel when the channel name is carried in the title", () => {
    const channelName = new FakeElement({ text: "Outdoor Boys" });
    const channelCard = new FakeElement({ byline: channelName, text: "Outdoor Boys" });
    const channel = new FakeElement({
      attributes: { href: "/@OutdoorBoys" },
      card: channelCard,
      text: "Outdoor Boys"
    });

    expect(executeYouTubeScript(intent({
      action: "open",
      creator: null,
      mediaType: "channel",
      title: "Outdoor Boys"
    }), [channel])).toBe("complete");
    expect(channel.clicked).toBe(true);
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

  it("does not trust result-card text when a named creator byline is absent", () => {
    const fanCard = new FakeElement({ text: "Outdoor Boys reaction and latest news" });
    const fanVideo = new FakeElement({
      attributes: { href: "/watch?v=fan", title: "Outdoor Boys newest upload" },
      card: fanCard
    });

    expect(executeYouTubeScript(intent({ recency: "latest" }), [fanVideo])).toBe("idle");
    expect(fanVideo.clicked).toBe(false);
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

  it("does not treat a shorter creator prefix as the requested YouTube channel", () => {
    const shorterCard = new FakeElement({
      byline: new FakeElement({ text: "Cody" }),
      text: "A Cody upload"
    });
    const video = new FakeElement({
      attributes: { href: "/watch?v=short", title: "Latest video" },
      card: shorterCard
    });

    expect(executeYouTubeScript(intent({
      creator: "Cody Ko",
      recency: "latest",
      title: "latest video"
    }), [video])).toBe("idle");
    expect(video.clicked).toBe(false);
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

    const fallbackScript = buildYouTubeVoiceAutomationScript(intent(), true);
    expect(executeProviderScript(fallbackScript, documentValue, "/watch")).toBe("playing");

    documentValue.fullscreenElement = { contains: () => true };
    expect(executeProviderScript(fallbackScript, documentValue, "/watch")).toBe("complete");
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
    const titleSignal = new FakeElement({ attributes: { "aria-label": "Breaking Bad" } });
    const detailRoot = new FakeElement({
      selectAll: (selector) => selector === 'button,a,[role="button"]'
        ? [play, resume]
        : selector.includes("h1,h2,h3") ? [titleSignal] : []
    });
    const detailDocument = {
      body: { innerText: "Breaking Bad" },
      fullscreenElement: null as object | null,
      querySelector: (selector: string) => selector.includes('[role="dialog"]')
        ? detailRoot
        : null,
      querySelectorAll: (selector: string) => {
        if (selector.includes('data-uia="profile-link"')) return [];
        return [];
      }
    };
    const script = buildNetflixVoiceAutomationScript(
      intent({
        mediaType: "show",
        providerHint: "netflix",
        title: "Breaking Bad"
      }),
      null,
      "70143836"
    );

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
    const fallbackScript = buildNetflixVoiceAutomationScript(
      intent({
        mediaType: "show",
        providerHint: "netflix",
        title: "Breaking Bad"
      }),
      null,
      "70143836",
      true
    );
    expect(executeProviderScript(fallbackScript, playbackDocument, "/watch/70143836"))
      .toBe("playing");
    playbackDocument.fullscreenElement = { contains: () => true };
    expect(executeProviderScript(fallbackScript, playbackDocument, "/watch/70143836"))
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

  it("selects the exact requested Netflix episode instead of generic Resume", () => {
    const wrongPlay = new FakeElement({ attributes: { "aria-label": "Play episode 2" } });
    const rightPlay = new FakeElement({ attributes: { "aria-label": "Play episode 3" } });
    const selectedSeason = new FakeElement({ attributes: { "aria-label": "Season 1" } });
    const row = (coordinate: string, play: FakeElement) => new FakeElement({
      attributes: { "aria-label": coordinate },
      selectAll: (selector) => selector.includes('[data-uia*="play"]') ? [play] : []
    });
    const wrongRow = row("S1 E2", wrongPlay);
    const rightRow = row("S1 E3", rightPlay);
    const resume = new FakeElement({ attributes: { "aria-label": "Resume" } });
    const episodeDetailRoot = new FakeElement({
      selectAll: (selector) => {
        if (selector.includes("h1,h2,h3")) {
          return [new FakeElement({ attributes: { "aria-label": "Breaking Bad" } })];
        }
        if (selector.includes('select[data-uia*="season"]')) return [selectedSeason];
        if (selector.includes('[data-uia^="episode-item-"]')) return [wrongRow, rightRow];
        if (selector === 'button,a,[role="button"]') return [resume];
        return [];
      }
    });
    const documentValue = {
      body: { innerText: "Breaking Bad" },
      fullscreenElement: null,
      querySelector: (selector: string) => selector.includes('[role="dialog"]')
        ? episodeDetailRoot
        : null,
      querySelectorAll: (selector: string) => {
        if (selector.includes('data-uia="profile-link"')) return [];
        return [];
      }
    };

    const script = buildNetflixVoiceAutomationScript(intent({
      creator: null,
      episode: 3,
      mediaType: "episode",
      providerHint: "netflix",
      season: 1,
      title: "Breaking Bad"
    }));
    expect(script).toContain('"episode":3');
    expect(script).toContain('"season":1');
    expect(executeProviderScript(script, documentValue, "/title/70143836"))
      .toBe("play-clicked");
    expect(wrongPlay.clicked).toBe(false);
    expect(rightPlay.clicked).toBe(true);
    expect(resume.clicked).toBe(false);
  });

  it("ignores an unrelated Netflix Resume outside the requested title details", () => {
    const unrelatedResume = new FakeElement({ attributes: { "aria-label": "Resume another show" } });
    const requestedPlay = new FakeElement({ attributes: { "aria-label": "Play Breaking Bad" } });
    const titleSignal = new FakeElement({ attributes: { "aria-label": "Breaking Bad" } });
    const requestedDetails = new FakeElement({
      selectAll: (selector) => selector === 'button,a,[role="button"]'
        ? [requestedPlay]
        : selector.includes("h1,h2,h3") ? [titleSignal] : []
    });
    const documentValue = {
      body: { innerText: "Breaking Bad and other titles" },
      fullscreenElement: null,
      querySelector: (selector: string) => selector.includes('[role="dialog"]')
        ? requestedDetails
        : null,
      querySelectorAll: (selector: string) => selector === 'button,a,[role="button"]'
        ? [unrelatedResume]
        : []
    };

    expect(executeProviderScript(buildNetflixVoiceAutomationScript(intent({
      creator: null,
      mediaType: "show",
      providerHint: "netflix",
      title: "Breaking Bad"
    })), documentValue, "/title/70143836")).toBe("play-clicked");
    expect(requestedPlay.clicked).toBe(true);
    expect(unrelatedResume.clicked).toBe(false);
  });

  it("trusts a Netflix document-wide control only for the expected content id", () => {
    const resume = new FakeElement({ attributes: { "aria-label": "Resume" } });
    const documentValue = {
      body: { innerText: "Continue watching" },
      fullscreenElement: null,
      querySelector: () => null,
      querySelectorAll: (selector: string) => selector === 'button,a,[role="button"]'
        ? [resume]
        : []
    };
    const script = buildNetflixVoiceAutomationScript(intent({
      creator: null,
      mediaType: "show",
      providerHint: "netflix",
      title: "Breaking Bad"
    }), null, "70143836");

    expect(executeProviderScript(script, documentValue, "/title/999"))
      .toBe("idle");
    expect(resume.clicked).toBe(false);
    expect(executeProviderScript(script, documentValue, "/title/70143836"))
      .toBe("play-clicked");
    expect(resume.clicked).toBe(true);
  });

  it("opens Netflix title details for exact episodes and open-only requests", () => {
    const execute = (voiceIntent: VoiceMediaIntent) => {
      const watch = new FakeElement({ attributes: { href: "/watch/current" } });
      const title = new FakeElement({ attributes: { href: "/title/breaking-bad" } });
      const signal = new FakeElement({ attributes: { "aria-label": "Breaking Bad" } });
      const card = new FakeElement({
        selectAll: (selector) => selector.includes("img[alt]")
          ? [signal]
          : selector.includes('a[href^="/title/"]') ? [watch, title] : []
      });
      const documentValue = {
        body: { innerText: "Search" },
        fullscreenElement: null,
        querySelector: () => null,
        querySelectorAll: (selector: string) =>
          selector.includes('data-uia="search-video"') ? [card] : []
      };

      const result = executeProviderScript(
        buildNetflixVoiceAutomationScript(voiceIntent),
        documentValue,
        "/search"
      );
      return { result, title, watch };
    };

    const episodeResult = execute(intent({
      creator: null,
      episode: 3,
      mediaType: "episode",
      providerHint: "netflix",
      season: 1,
      title: "Breaking Bad"
    }));
    expect(episodeResult.result).toBe("navigated");
    expect(episodeResult.title.clicked).toBe(true);
    expect(episodeResult.watch.clicked).toBe(false);

    const openResult = execute(intent({
      action: "open",
      creator: null,
      mediaType: "show",
      providerHint: "netflix",
      title: "Breaking Bad"
    }));
    expect(openResult.result).toBe("complete");
    expect(openResult.title.clicked).toBe(true);
    expect(openResult.watch.clicked).toBe(false);
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

  it("does not call Spotify playback complete while the global control still says Play", () => {
    const nowPlaying = new FakeElement({ selectors: {
      '[data-testid="context-item-info-subtitles"],a[href^="/artist/"]': [
        new FakeElement({ text: "Kanye West" })
      ],
      '[data-testid="context-item-info-title"],a[href^="/track/"]': [
        new FakeElement({ text: "Stronger" })
      ]
    } });
    const globalPlay = new FakeElement({ attributes: { "aria-label": "Play" } });
    const documentValue = {
      querySelector: (selector: string) => selector.includes("now-playing-widget")
        ? nowPlaying
        : null,
      querySelectorAll: (selector: string) => selector.includes("control-button-playpause")
        ? [globalPlay]
        : []
    };
    const script = buildSpotifyVoiceAutomationScript(intent({
      creator: "Kanye West",
      mediaType: "song",
      providerHint: "spotify",
      title: "Stronger"
    }));

    expect(executeProviderScript(script, documentValue, "/search/Stronger")).toBe("idle");
  });

  it("does not accept unrelated Spotify playback until the requested artist was started", () => {
    const play = new FakeElement({ attributes: { "aria-label": "Play Kanye West" } });
    const artist = new FakeElement({ attributes: { href: "/artist/kanye" }, text: "Kanye West" });
    const artistCard = new FakeElement({
      selectAll: (selector) => selector === "a[href]"
        ? [artist]
        : selector.includes('data-testid="play-button"') ? [play] : []
    });
    const unrelatedPause = new FakeElement({ attributes: { "aria-label": "Pause" } });
    const documentValue = {
      querySelector: () => null,
      querySelectorAll: (selector: string) => {
        if (selector.includes('data-testid="control-button-playpause"')) return [unrelatedPause];
        if (selector.includes('data-testid="tracklist-row"')) return [artistCard];
        return [];
      }
    };
    const artistIntent = intent({
      creator: "Kanye West",
      mediaType: "artist",
      providerHint: "spotify",
      title: "Kanye West"
    });

    expect(executeProviderScript(
      buildSpotifyVoiceAutomationScript(artistIntent, false),
      documentValue,
      "/search/Kanye%20West"
    )).toBe("play-clicked");
    expect(play.clicked).toBe(true);

    expect(executeProviderScript(
      buildSpotifyVoiceAutomationScript(artistIntent, true),
      documentValue,
      "/search/Kanye%20West"
    )).toBe("play-clicked");

    const localPause = new FakeElement({ attributes: { "aria-label": "Pause Kanye West" } });
    const playingArtistCard = new FakeElement({
      selectAll: (selector) => selector === "a[href]"
        ? [artist]
        : selector.includes('data-testid="play-button"') ? [localPause] : []
    });
    const verifiedDocument = {
      querySelector: () => null,
      querySelectorAll: (selector: string) => {
        if (selector.includes('data-testid="control-button-playpause"')) {
          return [unrelatedPause];
        }
        return selector.includes('data-testid="tracklist-row"') ? [playingArtistCard] : [];
      }
    };
    const localOnlyDocument = {
      querySelector: () => null,
      querySelectorAll: (selector: string) =>
        selector.includes('data-testid="tracklist-row"') ? [playingArtistCard] : []
    };
    expect(executeProviderScript(
      buildSpotifyVoiceAutomationScript(artistIntent, true),
      localOnlyDocument,
      "/search/Kanye%20West"
    )).not.toBe("playing");
    expect(executeProviderScript(
      buildSpotifyVoiceAutomationScript(artistIntent, true),
      verifiedDocument,
      "/search/Kanye%20West"
    )).toBe("playing");
  });

  it("does not use an unrelated global Spotify Pause control to verify an entity page", () => {
    const heading = new FakeElement({ text: "Kanye West" });
    const entityPlay = new FakeElement({ attributes: { "aria-label": "Play Kanye West" } });
    const entityRoot = new FakeElement({
      selectAll: (selector) => selector.includes('data-testid="play-button"')
        ? [entityPlay]
        : []
    });
    const unrelatedPause = new FakeElement({ attributes: { "aria-label": "Pause" } });
    const documentValue = {
      querySelector: (selector: string) => {
        if (selector.startsWith("h1,")) return heading;
        if (selector.includes('data-testid="artist-page"')) return entityRoot;
        return null;
      },
      querySelectorAll: (selector: string) => selector.includes("control-button-playpause")
        ? [unrelatedPause]
        : []
    };
    const artistIntent = intent({
      creator: "Kanye West",
      mediaType: "artist",
      providerHint: "spotify",
      title: "Kanye West"
    });

    expect(executeProviderScript(
      buildSpotifyVoiceAutomationScript(artistIntent, true),
      documentValue,
      "/artist/kanye"
    )).toBe("play-clicked");
    expect(entityPlay.clicked).toBe(true);

    const entityPause = new FakeElement({
      attributes: { "aria-label": "Pause Kanye West" }
    });
    const playingEntityRoot = new FakeElement({
      selectAll: (selector) => selector.includes('data-testid="play-button"')
        ? [entityPause]
        : []
    });
    const verifiedDocument = {
      ...documentValue,
      querySelector: (selector: string) => {
        if (selector.startsWith("h1,")) return heading;
        if (selector.includes('data-testid="artist-page"')) return playingEntityRoot;
        return null;
      }
    };
    expect(executeProviderScript(
      buildSpotifyVoiceAutomationScript(artistIntent, true),
      verifiedDocument,
      "/artist/kanye"
    )).toBe("playing");
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
    expect(source).toContain("let playbackRequested = false");
    expect(source).toContain("buildSpotifyVoiceAutomationScript(intent, playbackRequested)");
    expect(source).toContain("let fullscreenRequested = false");
    expect(source).toContain("fullscreenRequested = true");
    expect(source).toContain("playbackRevealAttempts = Math.max(1, playbackRevealAttempts)");
    expect(source).toContain("trustedNetflixContentId");
    expect(source).toContain('keyCode: "F"');
    expect(source).toContain('result === "complete"');
  });

  it("reports play as handled only after provider automation verifies it", () => {
    const playIntent = intent({ action: "play" });
    expect(voiceProviderCommandHandled(playIntent, false)).toBe(false);
    expect(voiceProviderCommandHandled(playIntent, true)).toBe(true);
    expect(voiceProviderCommandHandled(intent({ action: "open" }), false)).toBe(true);
  });

  it("extracts only bounded Netflix title and watch ids from trusted URLs", () => {
    expect(netflixContentIdFromUrl("https://www.netflix.com/title/70143836"))
      .toBe("70143836");
    expect(netflixContentIdFromUrl("https://www.netflix.com/watch/70143836?trackId=1"))
      .toBe("70143836");
    expect(netflixContentIdFromUrl("https://evil.test/title/70143836")).toBeNull();
    expect(netflixContentIdFromUrl("javascript:alert(1)")).toBeNull();
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
