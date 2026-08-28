import { describe, expect, it } from "vitest";
import {
  MAX_VOICE_ABSOLUTE_SEEK_SECONDS,
  MAX_VOICE_RELATIVE_SEEK_SECONDS,
  buildVoiceSemanticControlScript,
  normalizeVoiceSemanticControlRequest,
  parseVoiceSemanticControlResult,
  type VoiceSemanticControlRequest,
  type VoiceSemanticControlResult
} from "../src/main/voice/voice-semantic-control";

class FakeElement {
  clicked = false;
  disabled = false;
  hidden = false;
  isConnected = true;
  readonly #attributes: Record<string, string>;
  readonly #visible: boolean;
  textContent: string;

  constructor(options: {
    attributes?: Record<string, string>;
    text?: string;
    visible?: boolean;
  } = {}) {
    this.#attributes = options.attributes ?? {};
    this.#visible = options.visible ?? true;
    this.textContent = options.text ?? "";
  }

  click(): void {
    this.clicked = true;
  }

  contains(value: unknown): boolean {
    return value === this;
  }

  getAttribute(name: string): string | null {
    return this.#attributes[name] ?? null;
  }

  getBoundingClientRect(): { height: number; width: number } {
    return this.#visible ? { height: 90, width: 160 } : { height: 0, width: 0 };
  }
}

class FakeVideo extends FakeElement {
  readonly defaultPlaybackRate = 1;
  currentTime: number;
  duration: number;
  ended: boolean;
  paused: boolean;
  readonly playbackRateWrites: number[] = [];
  readyState: number;
  requestedFullscreen = false;
  readonly #clampPlaybackRateTo: number | null;
  readonly #onPlaybackRateWrite: ((value: number) => void) | null;
  readonly #rateResetDelayMs: number | null;
  #playbackRate: number;
  readonly #throwOnPlaybackRateWrite: boolean;

  constructor(options: {
    clampPlaybackRateTo?: number | null;
    currentTime?: number;
    duration?: number;
    ended?: boolean;
    onPlaybackRateWrite?: ((value: number) => void) | null;
    paused?: boolean;
    playbackRate?: number;
    rateResetDelayMs?: number | null;
    readyState?: number;
    throwOnPlaybackRateWrite?: boolean;
    visible?: boolean;
  } = {}) {
    super({ visible: options.visible });
    this.#clampPlaybackRateTo = options.clampPlaybackRateTo ?? null;
    this.currentTime = options.currentTime ?? 0;
    this.duration = options.duration ?? 600;
    this.ended = options.ended ?? false;
    this.#onPlaybackRateWrite = options.onPlaybackRateWrite ?? null;
    this.paused = options.paused ?? false;
    this.#playbackRate = options.playbackRate ?? 1;
    this.#rateResetDelayMs = options.rateResetDelayMs ?? null;
    this.readyState = options.readyState ?? 4;
    this.#throwOnPlaybackRateWrite = options.throwOnPlaybackRateWrite ?? false;
  }

  get playbackRate(): number {
    return this.#playbackRate;
  }

  set playbackRate(value: number) {
    this.playbackRateWrites.push(value);
    if (this.#throwOnPlaybackRateWrite) throw new Error("playback rate rejected");
    this.#playbackRate = this.#clampPlaybackRateTo ?? value;
    this.#onPlaybackRateWrite?.(value);
    if (this.#rateResetDelayMs !== null) {
      setTimeout(() => {
        this.#playbackRate = 1;
      }, this.#rateResetDelayMs);
    }
  }

  requestFullscreen(): Promise<void> {
    this.requestedFullscreen = true;
    return Promise.resolve();
  }
}

interface FakeDocumentOptions {
  controls?: Readonly<Record<string, readonly FakeElement[]>>;
  fullscreenElement?: FakeElement | null;
  fullscreenPlayer?: boolean;
  videos?: readonly FakeVideo[];
}

function execute(
  provider: unknown,
  request: VoiceSemanticControlRequest,
  options: FakeDocumentOptions = {}
): VoiceSemanticControlResult | Promise<VoiceSemanticControlResult> {
  const script = buildVoiceSemanticControlScript(provider, request);
  if (script === null) throw new Error("Expected a script");
  const exitState = { called: false };
  const documentValue = {
    exitFullscreen: () => {
      exitState.called = true;
      return Promise.resolve();
    },
    fullscreenElement: options.fullscreenElement ?? null,
    querySelector: (selector: string) => selector.includes("ytp-fullscreen") && options.fullscreenPlayer
      ? new FakeElement()
      : null,
    querySelectorAll: (selector: string) => {
      if (selector === "video") return [...(options.videos ?? [])];
      const matches: FakeElement[] = [];
      for (const [needle, elements] of Object.entries(options.controls ?? {})) {
        if (!selector.includes(needle)) continue;
        for (const element of elements) {
          if (!matches.includes(element)) matches.push(element);
        }
      }
      return matches;
    }
  };
  const run = new Function(
    "document",
    "HTMLElement",
    "HTMLVideoElement",
    "getComputedStyle",
    `return ${script};`
  );
  return run(
    documentValue,
    FakeElement,
    FakeVideo,
    () => ({ display: "block", opacity: "1", visibility: "visible" })
  ) as VoiceSemanticControlResult | Promise<VoiceSemanticControlResult>;
}

describe("voice semantic controls", () => {
  it("accepts only the closed action union and exact payload shapes", () => {
    const requests: VoiceSemanticControlRequest[] = [
      { action: "seek-relative", offsetSeconds: -15 },
      { action: "seek-absolute", positionSeconds: 125 },
      { action: "set-playback-rate", playbackRate: 1.5 },
      { action: "restart" },
      { action: "next" },
      { action: "previous" },
      { action: "skip-intro" },
      { action: "skip-recap" },
      { action: "skip-ad" },
      { action: "captions-on" },
      { action: "captions-off" },
      { action: "fullscreen-enter" },
      { action: "fullscreen-exit" }
    ];
    for (const request of requests) {
      expect(normalizeVoiceSemanticControlRequest(request)).toEqual(request);
    }

    expect(normalizeVoiceSemanticControlRequest({ action: "pause" })).toBeNull();
    expect(normalizeVoiceSemanticControlRequest({ action: "next", selector: "body" })).toBeNull();
    expect(normalizeVoiceSemanticControlRequest(Object.assign(new Date(), { action: "next" })))
      .toBeNull();
  });

  it("accepts only exact allowlisted playback rates without coercion", () => {
    for (const playbackRate of [0.5, 0.75, 1, 1.25, 1.5] as const) {
      expect(normalizeVoiceSemanticControlRequest({
        action: "set-playback-rate",
        playbackRate
      })).toEqual({ action: "set-playback-rate", playbackRate });
    }
    for (const playbackRate of [0, 0.8, 1.3, 2, "1.5", Number.NaN,
      Number.POSITIVE_INFINITY]) {
      expect(normalizeVoiceSemanticControlRequest({
        action: "set-playback-rate",
        playbackRate
      })).toBeNull();
    }
    expect(normalizeVoiceSemanticControlRequest({
      action: "set-playback-rate",
      playbackRate: 1.5,
      selector: "video"
    })).toBeNull();
  });

  it("rejects non-integral, zero, and out-of-bounds seeks without coercion", () => {
    expect(normalizeVoiceSemanticControlRequest({
      action: "seek-relative",
      offsetSeconds: MAX_VOICE_RELATIVE_SEEK_SECONDS
    })).toEqual({
      action: "seek-relative",
      offsetSeconds: MAX_VOICE_RELATIVE_SEEK_SECONDS
    });
    expect(normalizeVoiceSemanticControlRequest({
      action: "seek-absolute",
      positionSeconds: MAX_VOICE_ABSOLUTE_SEEK_SECONDS
    })).toEqual({
      action: "seek-absolute",
      positionSeconds: MAX_VOICE_ABSOLUTE_SEEK_SECONDS
    });
    for (const offsetSeconds of [0, 1.5, "10", Number.NaN, Number.POSITIVE_INFINITY,
      MAX_VOICE_RELATIVE_SEEK_SECONDS + 1, -MAX_VOICE_RELATIVE_SEEK_SECONDS - 1]) {
      expect(normalizeVoiceSemanticControlRequest({ action: "seek-relative", offsetSeconds }))
        .toBeNull();
    }
    for (const positionSeconds of [-1, 1.5, "10", Number.NaN,
      MAX_VOICE_ABSOLUTE_SEEK_SECONDS + 1]) {
      expect(normalizeVoiceSemanticControlRequest({ action: "seek-absolute", positionSeconds }))
        .toBeNull();
    }
  });

  it("serializes only qualified provider IDs, actions, and bounded numbers", () => {
    const injectedProvider = 'youtube"; globalThis.pwned = true; //';
    const unsupported = buildVoiceSemanticControlScript(injectedProvider, { action: "next" });
    expect(unsupported).toBe('(() => "unsupported")()');
    expect(unsupported).not.toContain("pwned");
    expect(buildVoiceSemanticControlScript("youtube", {
      action: "seek-relative",
      offsetSeconds: '10); globalThis.pwned = true; //' as unknown as number
    })).toBeNull();

    const script = buildVoiceSemanticControlScript("youtube", {
      action: "seek-relative",
      offsetSeconds: 10
    });
    expect(script).toContain('const provider = "youtube"');
    expect(script).toContain('"offsetSeconds":10');
    expect(script).not.toContain("eval(");
    expect(script).not.toContain("innerHTML");
    expect(script).not.toContain("location");
    expect(() => new Function(script ?? "")).not.toThrow();

    const rateScript = buildVoiceSemanticControlScript("youtube", {
      action: "set-playback-rate",
      playbackRate: 1.5
    }) ?? "";
    expect(rateScript).toContain('"action":"set-playback-rate"');
    expect(rateScript).toContain('"playbackRate":1.5');
    expect(rateScript).not.toContain("defaultPlaybackRate =");
  });

  it("contains provider-owned Netflix and YouTube selectors and semantic labels", () => {
    const netflix = buildVoiceSemanticControlScript("netflix", { action: "skip-intro" }) ?? "";
    expect(netflix).toContain('data-uia="player-skip-intro');
    expect(netflix).toContain("Skip Intro");
    expect(netflix).toContain('data-uia="control-audio-subtitle');
    expect(netflix).toContain("Audio & Subtitles");
    expect(netflix).toContain('data-uia="control-fullscreen-enter');

    const youtube = buildVoiceSemanticControlScript("youtube", { action: "skip-ad" }) ?? "";
    expect(youtube).toContain("ytp-ad-skip-button-modern");
    expect(youtube).toContain("Skip ads");
    expect(youtube).toContain("ytp-subtitles-button");
    expect(youtube).toContain("ytp-fullscreen-button");
  });

  it("performs bounded video seeks and makes absolute targets idempotent", () => {
    const video = new FakeVideo({ currentTime: 30, duration: 100 });
    expect(execute("youtube", { action: "seek-relative", offsetSeconds: 90 }, {
      videos: [video]
    })).toBe("verified");
    expect(video.currentTime).toBe(99.75);

    expect(execute("youtube", { action: "seek-absolute", positionSeconds: 50 }, {
      videos: [video]
    })).toBe("verified");
    expect(video.currentTime).toBe(50);
    expect(execute("youtube", { action: "seek-absolute", positionSeconds: 50 }, {
      videos: [video]
    })).toBe("complete");

    video.currentTime = 0.3;
    expect(execute("netflix", { action: "restart" }, { videos: [video] })).toBe("complete");
  });

  it("sets and settles playback rate only on Netflix and YouTube finite VOD", async () => {
    for (const provider of ["netflix", "youtube"] as const) {
      const video = new FakeVideo({ playbackRate: 1, paused: provider === "netflix" });
      expect(await execute(provider, {
        action: "set-playback-rate",
        playbackRate: 1.5
      }, { videos: [video] })).toBe("verified");
      expect(video.playbackRate).toBe(1.5);
      expect(video.playbackRateWrites).toEqual([1.5]);
      expect(video.defaultPlaybackRate).toBe(1);

      expect(await execute(provider, {
        action: "set-playback-rate",
        playbackRate: 1.5
      }, { videos: [video] })).toBe("complete");
      expect(video.playbackRateWrites).toEqual([1.5]);
    }
  });

  it("does not claim playback-rate success when the provider rejects or resets it", async () => {
    const rejected = new FakeVideo({ throwOnPlaybackRateWrite: true });
    expect(await execute("netflix", {
      action: "set-playback-rate",
      playbackRate: 1.25
    }, { videos: [rejected] })).toBe("unavailable");
    expect(rejected.playbackRate).toBe(1);

    const reset = new FakeVideo({ rateResetDelayMs: 20 });
    expect(await execute("youtube", {
      action: "set-playback-rate",
      playbackRate: 1.5
    }, { videos: [reset] })).toBe("unavailable");
    expect(reset.playbackRate).toBe(1);

    const clamped = new FakeVideo({ clampPlaybackRateTo: 1.25 });
    expect(await execute("youtube", {
      action: "set-playback-rate",
      playbackRate: 1.5
    }, { videos: [clamped] })).toBe("unavailable");
    expect(clamped.playbackRate).toBe(1.25);
  });

  it("requires the same eligible video to survive the settled rate read-back", async () => {
    const videos: FakeVideo[] = [];
    const replaced = new FakeVideo({
      onPlaybackRateWrite: () => {
        setTimeout(() => videos.splice(0, 1, new FakeVideo({ playbackRate: 1.5 })), 20);
      }
    });
    videos.push(replaced);
    expect(await execute("youtube", {
      action: "set-playback-rate",
      playbackRate: 1.5
    }, { videos })).toBe("unavailable");

    const ending = new FakeVideo({
      onPlaybackRateWrite: () => {
        setTimeout(() => {
          ending.ended = true;
        }, 20);
      }
    });
    expect(await execute("netflix", {
      action: "set-playback-rate",
      playbackRate: 1.25
    }, { videos: [ending] })).toBe("unavailable");
  });

  it("does not mutate unsupported providers or ineligible video elements", async () => {
    for (const provider of ["spotify", "disney-plus", "custom-service"] as const) {
      const video = new FakeVideo();
      expect(await execute(provider, {
        action: "set-playback-rate",
        playbackRate: 1.5
      }, { videos: [video] })).toBe("unsupported");
      expect(video.playbackRateWrites).toEqual([]);
    }

    for (const video of [
      new FakeVideo({ duration: Number.POSITIVE_INFINITY }),
      new FakeVideo({ duration: 0 }),
      new FakeVideo({ ended: true }),
      new FakeVideo({ readyState: 0 })
    ]) {
      expect(await execute("youtube", {
        action: "set-playback-rate",
        playbackRate: 1.5
      }, { videos: [video] })).toBe("unavailable");
      expect(video.playbackRateWrites).toEqual([]);
    }
    const disconnected = new FakeVideo();
    disconnected.isConnected = false;
    expect(await execute("youtube", {
      action: "set-playback-rate",
      playbackRate: 1.5
    }, { videos: [disconnected] })).toBe("unavailable");
    expect(disconnected.playbackRateWrites).toEqual([]);
    expect(await execute("youtube", {
      action: "set-playback-rate",
      playbackRate: 1.5
    })).toBe("unavailable");
  });

  it("clicks only visible, enabled transport and skip controls", () => {
    const next = new FakeElement({ attributes: { "aria-label": "Next video" } });
    expect(execute("youtube", { action: "next" }, {
      controls: { "ytp-next-button": [next] }
    })).toBe("acted");
    expect(next.clicked).toBe(true);

    const hiddenSkip = new FakeElement({
      attributes: { "aria-label": "Skip Intro" },
      visible: false
    });
    expect(execute("netflix", { action: "skip-intro" }, {
      controls: { "player-skip-intro": [hiddenSkip] }
    })).toBe("unavailable");
    expect(hiddenSkip.clicked).toBe(false);

    const spotifyPrevious = new FakeElement({
      attributes: { "data-testid": "control-button-skip-back" }
    });
    expect(execute("spotify", { action: "previous" }, {
      controls: { "control-button-skip-back": [spotifyPrevious] }
    })).toBe("acted");
    expect(spotifyPrevious.clicked).toBe(true);
  });

  it("does not toggle observable caption state that is already correct", () => {
    const captions = new FakeElement({ attributes: {
      "aria-label": "Subtitles/closed captions",
      "aria-pressed": "true"
    } });
    const options = { controls: { "ytp-subtitles-button": [captions] } };
    expect(execute("youtube", { action: "captions-on" }, options)).toBe("complete");
    expect(captions.clicked).toBe(false);
    expect(execute("youtube", { action: "captions-off" }, options)).toBe("acted");
    expect(captions.clicked).toBe(true);

    const unknownState = new FakeElement({ attributes: {
      "aria-label": "Subtitles/closed captions"
    } });
    expect(execute("youtube", { action: "captions-on" }, {
      controls: { "ytp-subtitles-button": [unknownState] }
    })).toBe("unavailable");
    expect(unknownState.clicked).toBe(false);
  });

  it("asks the host for one bounded follow-up after opening Netflix captions", () => {
    const menu = new FakeElement({ attributes: {
      "aria-expanded": "false",
      "aria-label": "Audio & Subtitles"
    } });
    expect(execute("netflix", { action: "captions-on" }, {
      controls: { "control-audio-subtitle": [menu] }
    })).toBe("needs-follow-up");
    expect(menu.clicked).toBe(true);
    expect(parseVoiceSemanticControlResult("needs-follow-up")).toBe("needs-follow-up");
  });

  it("makes fullscreen entry and exit idempotent before using controls", () => {
    const video = new FakeVideo();
    const fullscreen = new FakeElement();
    fullscreen.contains = (value: unknown) => value === video;
    const button = new FakeElement({ attributes: { "aria-label": "Full screen" } });

    expect(execute("youtube", { action: "fullscreen-enter" }, {
      controls: { "ytp-fullscreen-button": [button] },
      fullscreenElement: fullscreen,
      videos: [video]
    })).toBe("complete");
    expect(button.clicked).toBe(false);

    expect(execute("youtube", { action: "fullscreen-enter" }, {
      controls: { "ytp-fullscreen-button": [button] },
      videos: [video]
    })).toBe("acted");
    expect(button.clicked).toBe(true);

    button.clicked = false;
    expect(execute("netflix", { action: "fullscreen-exit" }, {
      controls: { "control-fullscreen-exit": [button] },
      videos: [video]
    })).toBe("complete");
    expect(button.clicked).toBe(false);
  });

  it("returns unsupported without touching the DOM for unsupported combinations", () => {
    const captions = new FakeElement();
    expect(execute("spotify", { action: "captions-on" }, {
      controls: { "ytp-subtitles-button": [captions] }
    })).toBe("unsupported");
    expect(captions.clicked).toBe(false);
    expect(execute("youtube", { action: "skip-recap" })).toBe("unsupported");
    expect(execute("custom-service", { action: "next" })).toBe("unsupported");
    expect(parseVoiceSemanticControlResult("acted")).toBe("acted");
    expect(parseVoiceSemanticControlResult("verified")).toBe("verified");
    expect(parseVoiceSemanticControlResult({ state: "acted" })).toBe("unavailable");
    expect(parseVoiceSemanticControlResult("anything-else")).toBe("unavailable");
  });
});
