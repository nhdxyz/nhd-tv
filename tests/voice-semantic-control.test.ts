import { describe, expect, it } from "vitest";
import {
  MAX_VOICE_ABSOLUTE_SEEK_SECONDS,
  MAX_VOICE_RELATIVE_SEEK_SECONDS,
  buildSpotifyRepeatControlStateScript,
  buildSpotifyRepeatTransitionScript,
  buildVoiceSemanticControlScript,
  executeSpotifyRepeatStateChange,
  normalizeVoiceSemanticControlRequest,
  parseVoiceSpotifyRepeatControlState,
  parseVoiceSemanticControlResult,
  type VoiceSemanticControlRequest,
  type VoiceSemanticControlResult,
  type VoiceSpotifyRepeatControlState,
  type VoiceSpotifyRepeatDriverOptions,
  type VoiceSpotifyRepeatState
} from "../src/main/voice/voice-semantic-control";

class FakeElement {
  clicked = false;
  clickCount = 0;
  disabled = false;
  hidden = false;
  isConnected = true;
  readonly #attributes: Record<string, string>;
  readonly #onClick: ((element: FakeElement) => void) | null;
  readonly #visible: boolean;
  textContent: string;

  constructor(options: {
    attributes?: Record<string, string>;
    onClick?: ((element: FakeElement) => void) | null;
    text?: string;
    visible?: boolean;
  } = {}) {
    this.#attributes = { ...(options.attributes ?? {}) };
    this.#onClick = options.onClick ?? null;
    this.#visible = options.visible ?? true;
    this.textContent = options.text ?? "";
  }

  click(): void {
    this.clicked = true;
    this.clickCount += 1;
    this.#onClick?.(this);
  }

  contains(value: unknown): boolean {
    return value === this;
  }

  getAttribute(name: string): string | null {
    return this.#attributes[name] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.#attributes[name] = value;
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

function executeScript(
  script: string,
  options: FakeDocumentOptions = {}
): unknown {
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
      if (selector === '[data-testid="control-button-shuffle"][role="switch"]') {
        return [...(options.controls?.["control-button-shuffle"] ?? [])].filter(
          (element) => element.getAttribute("data-testid") === "control-button-shuffle" &&
            element.getAttribute("role") === "switch"
        );
      }
      if (selector === '[data-testid="control-button-repeat"][role="checkbox"]') {
        return [...(options.controls?.["control-button-repeat"] ?? [])].filter(
          (element) => element.getAttribute("data-testid") === "control-button-repeat" &&
            element.getAttribute("role") === "checkbox"
        );
      }
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
  ) as unknown;
}

function execute(
  provider: unknown,
  request: VoiceSemanticControlRequest,
  options: FakeDocumentOptions = {}
): VoiceSemanticControlResult | Promise<VoiceSemanticControlResult> {
  const script = buildVoiceSemanticControlScript(provider, request);
  if (script === null) throw new Error("Expected a script");
  return executeScript(script, options) as VoiceSemanticControlResult |
    Promise<VoiceSemanticControlResult>;
}

function spotifyRepeatDomDriver(
  documentOptions: FakeDocumentOptions,
  options: Pick<VoiceSpotifyRepeatDriverOptions, "pause" | "signal"> = {}
): VoiceSpotifyRepeatDriverOptions {
  const stateScript = buildSpotifyRepeatControlStateScript();
  return {
    clickTransition: (expectedState) => {
      const script = buildSpotifyRepeatTransitionScript(expectedState);
      return script !== null && executeScript(script, documentOptions) === true;
    },
    pause: options.pause ?? (() => undefined),
    readState: () => parseVoiceSpotifyRepeatControlState(
      executeScript(stateScript, documentOptions)
    ),
    signal: options.signal
  };
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
      { action: "fullscreen-exit" },
      { action: "shuffle-on" },
      { action: "shuffle-off" },
      { action: "repeat-all" },
      { action: "repeat-one" },
      { action: "repeat-off" }
    ];
    for (const request of requests) {
      expect(normalizeVoiceSemanticControlRequest(request)).toEqual(request);
    }
    for (const action of [
      "shuffle-on",
      "shuffle-off",
      "repeat-all",
      "repeat-one",
      "repeat-off"
    ] as const) {
      expect(normalizeVoiceSemanticControlRequest({ action, providerHint: "spotify" }))
        .toBeNull();
      expect(normalizeVoiceSemanticControlRequest({ action, selector: "body" })).toBeNull();
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

  it("uses only Spotify's exact qualified shuffle and repeat state controls", () => {
    const shuffleScript = buildVoiceSemanticControlScript(
      "spotify",
      { action: "shuffle-on" }
    ) ?? "";
    const repeatStateScript = buildSpotifyRepeatControlStateScript();
    const repeatTransitionScript = buildSpotifyRepeatTransitionScript("all") ?? "";
    expect(shuffleScript).toContain(
      '[data-testid="control-button-shuffle"][role="switch"]'
    );
    expect(repeatStateScript).toContain(
      '[data-testid="control-button-repeat"][role="checkbox"]'
    );
    expect(repeatTransitionScript).toContain(
      '[data-testid="control-button-repeat"][role="checkbox"]'
    );
    expect(repeatStateScript).toContain('getAttribute("aria-checked")');
    expect(shuffleScript).not.toContain('button[aria-label^="Shuffle');
    expect(repeatStateScript).not.toContain('button[aria-label^="Repeat');
    expect(repeatTransitionScript).not.toContain("setTimeout");
    expect(buildSpotifyRepeatTransitionScript("unexpected")).toBeNull();
    expect(execute("spotify", { action: "repeat-one" })).toBe("needs-follow-up");
  });

  it("makes Spotify shuffle state idempotent and verifies a settled transition", async () => {
    const shuffle = new FakeElement({
      attributes: {
        "aria-checked": "false",
        "data-testid": "control-button-shuffle",
        role: "switch"
      },
      onClick: (element) => {
        setTimeout(() => element.setAttribute("aria-checked", "true"), 35);
      }
    });
    const options = { controls: { "control-button-shuffle": [shuffle] } };

    expect(await execute("spotify", { action: "shuffle-on" }, options)).toBe("verified");
    expect(shuffle.clickCount).toBe(1);
    expect(await execute("spotify", { action: "shuffle-on" }, options)).toBe("complete");
    expect(shuffle.clickCount).toBe(1);

    shuffle.setAttribute("aria-checked", "true");
    const shuffleOff = new FakeElement({
      attributes: {
        "aria-checked": "true",
        "data-testid": "control-button-shuffle",
        role: "switch"
      },
      onClick: (element) => element.setAttribute("aria-checked", "false")
    });
    expect(await execute("spotify", { action: "shuffle-off" }, {
      controls: { "control-button-shuffle": [shuffleOff] }
    })).toBe("verified");
    expect(shuffleOff.clickCount).toBe(1);
  });

  it("re-queries a React-replaced Spotify control while verifying state", async () => {
    const controls: FakeElement[] = [];
    const replacement = new FakeElement({ attributes: {
      "aria-checked": "true",
      "data-testid": "control-button-shuffle",
      role: "switch"
    } });
    const initial = new FakeElement({
      attributes: {
        "aria-checked": "false",
        "data-testid": "control-button-shuffle",
        role: "switch"
      },
      onClick: (element) => {
        element.isConnected = false;
        controls.splice(0, 1, replacement);
      }
    });
    controls.push(initial);

    expect(await execute("spotify", { action: "shuffle-on" }, {
      controls: { "control-button-shuffle": controls }
    })).toBe("verified");
    expect(initial.clickCount).toBe(1);
    expect(replacement.clickCount).toBe(0);
  });

  it("tolerates a transient React gap before the replacement control appears", async () => {
    const controls: FakeElement[] = [];
    const replacement = new FakeElement({ attributes: {
      "aria-checked": "true",
      "data-testid": "control-button-shuffle",
      role: "switch"
    } });
    const initial = new FakeElement({
      attributes: {
        "aria-checked": "false",
        "data-testid": "control-button-shuffle",
        role: "switch"
      },
      onClick: (element) => {
        element.isConnected = false;
        controls.splice(0, 1);
        setTimeout(() => controls.push(replacement), 35);
      }
    });
    controls.push(initial);

    expect(await execute("spotify", { action: "shuffle-on" }, {
      controls: { "control-button-shuffle": controls }
    })).toBe("verified");
    expect(initial.clickCount).toBe(1);
  });

  it("does not accept an optimistic Spotify state that reverts during settle", async () => {
    const shuffle = new FakeElement({
      attributes: {
        "aria-checked": "false",
        "data-testid": "control-button-shuffle",
        role: "switch"
      },
      onClick: (element) => {
        element.setAttribute("aria-checked", "true");
        setTimeout(() => element.setAttribute("aria-checked", "false"), 50);
      }
    });
    expect(await execute("spotify", { action: "shuffle-on" }, {
      controls: { "control-button-shuffle": [shuffle] }
    })).toBe("unavailable");
    expect(shuffle.clickCount).toBe(1);
    expect(shuffle.getAttribute("aria-checked")).toBe("false");
  });

  it("reads a settled target after Spotify temporarily disables the clicked control", async () => {
    const shuffle = new FakeElement({
      attributes: {
        "aria-checked": "false",
        "data-testid": "control-button-shuffle",
        role: "switch"
      },
      onClick: (element) => {
        element.setAttribute("aria-checked", "true");
        element.disabled = true;
      }
    });
    expect(await execute("spotify", { action: "shuffle-on" }, {
      controls: { "control-button-shuffle": [shuffle] }
    })).toBe("verified");
    expect(shuffle.clickCount).toBe(1);
  });

  it("strictly parses and reads one qualified Spotify repeat control", () => {
    expect(parseVoiceSpotifyRepeatControlState({ enabled: true, state: "off" }))
      .toEqual({ enabled: true, state: "off" });
    expect(parseVoiceSpotifyRepeatControlState({ enabled: true, state: ["off"] }))
      .toBeNull();
    expect(parseVoiceSpotifyRepeatControlState({
      enabled: true,
      state: "off",
      selector: "button"
    })).toBeNull();

    const repeat = new FakeElement({ attributes: {
      "aria-checked": "mixed",
      "data-testid": "control-button-repeat",
      role: "checkbox"
    } });
    const options = { controls: { "control-button-repeat": [repeat] } };
    expect(executeScript(buildSpotifyRepeatControlStateScript(), options))
      .toEqual({ enabled: true, state: "one" });

    repeat.disabled = true;
    expect(executeScript(buildSpotifyRepeatControlStateScript(), options))
      .toEqual({ enabled: false, state: "one" });
    repeat.setAttribute("aria-checked", "invalid");
    expect(executeScript(buildSpotifyRepeatControlStateScript(), options)).toBeNull();

    const duplicate = new FakeElement({ attributes: {
      "aria-checked": "false",
      "data-testid": "control-button-repeat",
      role: "checkbox"
    } });
    expect(executeScript(buildSpotifyRepeatControlStateScript(), {
      controls: { "control-button-repeat": [repeat, duplicate] }
    })).toBeNull();
  });

  it("allows one synchronous repeat click only after exact state and DOM validation", () => {
    const repeat = new FakeElement({ attributes: {
      "aria-checked": "false",
      "data-testid": "control-button-repeat",
      role: "checkbox"
    } });
    const options = { controls: { "control-button-repeat": [repeat] } };
    const offTransition = buildSpotifyRepeatTransitionScript("off") ?? "";
    const allTransition = buildSpotifyRepeatTransitionScript("all") ?? "";
    expect(executeScript(offTransition, options)).toBe(true);
    expect(repeat.clickCount).toBe(1);
    expect(executeScript(allTransition, options)).toBe(false);
    expect(repeat.clickCount).toBe(1);

    repeat.disabled = true;
    expect(executeScript(offTransition, options)).toBe(false);
    repeat.disabled = false;
    repeat.isConnected = false;
    expect(executeScript(offTransition, options)).toBe(false);
    expect(repeat.clickCount).toBe(1);

    const duplicate = new FakeElement({ attributes: {
      "aria-checked": "false",
      "data-testid": "control-button-repeat",
      role: "checkbox"
    } });
    repeat.isConnected = true;
    expect(executeScript(offTransition, {
      controls: { "control-button-repeat": [repeat, duplicate] }
    })).toBe(false);
    expect(repeat.clickCount).toBe(1);
    expect(duplicate.clickCount).toBe(0);
  });

  it.each([
    ["off", "repeat-off"],
    ["all", "repeat-all"],
    ["one", "repeat-one"]
  ] as const)("does not click when Spotify repeat state %s already matches %s", async (
    state,
    action
  ) => {
    let clickCount = 0;
    expect(await executeSpotifyRepeatStateChange({ action }, {
      clickTransition: () => {
        clickCount += 1;
        return true;
      },
      pause: () => undefined,
      readState: () => ({ enabled: true, state })
    })).toBe("complete");
    expect(clickCount).toBe(0);
  });

  it("cycles with one host round trip per click and re-queries React replacements", async () => {
    const controls: FakeElement[] = [];
    const repeatOne = new FakeElement({ attributes: {
      "aria-checked": "mixed",
      "data-testid": "control-button-repeat",
      role: "checkbox"
    } });
    const repeatAll = new FakeElement({
      attributes: {
        "aria-checked": "true",
        "data-testid": "control-button-repeat",
        role: "checkbox"
      },
      onClick: (element) => {
        element.isConnected = false;
        controls.splice(0, 1, repeatOne);
      }
    });
    const repeatOff = new FakeElement({
      attributes: {
        "aria-checked": "false",
        "data-testid": "control-button-repeat",
        role: "checkbox"
      },
      onClick: (element) => {
        element.isConnected = false;
        controls.splice(0, 1, repeatAll);
      }
    });
    controls.push(repeatOff);

    expect(await executeSpotifyRepeatStateChange(
      { action: "repeat-one" },
      spotifyRepeatDomDriver({ controls: { "control-button-repeat": controls } })
    )).toBe("verified");
    expect(repeatOff.clickCount).toBe(1);
    expect(repeatAll.clickCount).toBe(1);
    expect(repeatOne.clickCount).toBe(0);
  });

  it("waits for a temporarily disabled replacement before a second transition", async () => {
    const controls: FakeElement[] = [];
    let pauses = 0;
    const repeatOne = new FakeElement({ attributes: {
      "aria-checked": "mixed",
      "data-testid": "control-button-repeat",
      role: "checkbox"
    } });
    const repeatAll = new FakeElement({
      attributes: {
        "aria-checked": "true",
        "data-testid": "control-button-repeat",
        role: "checkbox"
      },
      onClick: (element) => {
        element.isConnected = false;
        controls.splice(0, 1, repeatOne);
      }
    });
    repeatAll.disabled = true;
    const repeatOff = new FakeElement({
      attributes: {
        "aria-checked": "false",
        "data-testid": "control-button-repeat",
        role: "checkbox"
      },
      onClick: (element) => {
        element.isConnected = false;
        controls.splice(0, 1, repeatAll);
      }
    });
    controls.push(repeatOff);

    const result = await executeSpotifyRepeatStateChange(
      { action: "repeat-one" },
      spotifyRepeatDomDriver(
        { controls: { "control-button-repeat": controls } },
        { pause: () => {
          pauses += 1;
          if (pauses >= 4) repeatAll.disabled = false;
        } }
      )
    );
    expect(result).toBe("verified");
    expect(repeatOff.clickCount).toBe(1);
    expect(repeatAll.clickCount).toBe(1);
  });

  it("never dispatches a second repeat click after cancellation", async () => {
    const controller = new AbortController();
    let state: VoiceSpotifyRepeatState = "off";
    let clickCount = 0;
    const result = executeSpotifyRepeatStateChange({ action: "repeat-one" }, {
      clickTransition: (expectedState) => {
        expect(expectedState).toBe(state);
        clickCount += 1;
        state = "all";
        controller.abort(new DOMException("cancelled", "AbortError"));
        return true;
      },
      pause: () => undefined,
      readState: (): VoiceSpotifyRepeatControlState => ({ enabled: true, state }),
      signal: controller.signal
    });
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(clickCount).toBe(1);
  });

  it("restores the original verified state when a provider cycle skips the target", async () => {
    let state: VoiceSpotifyRepeatState = "off";
    let clickCount = 0;
    const result = await executeSpotifyRepeatStateChange({ action: "repeat-one" }, {
      clickTransition: (expectedState) => {
        if (expectedState !== state) return false;
        clickCount += 1;
        state = state === "off" ? "all" : "off";
        return true;
      },
      pause: () => undefined,
      readState: () => ({ enabled: true, state })
    });
    expect(result).toBe("recovered");
    expect(state).toBe("off");
    expect(clickCount).toBe(2);
  });

  it("reports a partial mutation when an intermediate state cannot be safely restored", async () => {
    let state: VoiceSpotifyRepeatState = "off";
    let enabled = true;
    let clickCount = 0;
    const result = await executeSpotifyRepeatStateChange({ action: "repeat-one" }, {
      clickTransition: (expectedState) => {
        if (!enabled || expectedState !== state) return false;
        clickCount += 1;
        state = "all";
        enabled = false;
        return true;
      },
      pause: () => undefined,
      readState: () => ({ enabled, state })
    });
    expect(result).toBe("partial-mutation");
    expect(state).toBe("all");
    expect(clickCount).toBe(1);
  });

  it("does not claim recovery when an acknowledged click may still mutate later", async () => {
    let state: VoiceSpotifyRepeatState = "off";
    const result = await executeSpotifyRepeatStateChange({ action: "repeat-one" }, {
      clickTransition: () => {
        setTimeout(() => {
          state = "all";
        }, 0);
        return true;
      },
      pause: () => undefined,
      readState: () => ({ enabled: true, state })
    });
    expect(result).toBe("partial-mutation");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state).toBe("all");
  });

  it("fails Spotify shuffle closed on missing, disabled, hidden, or unknown state", async () => {
    expect(await execute("spotify", { action: "shuffle-on" })).toBe("unavailable");

    const disabled = new FakeElement({ attributes: {
      "aria-checked": "false",
      "aria-disabled": "true",
      "data-testid": "control-button-shuffle",
      role: "switch"
    } });
    expect(await execute("spotify", { action: "shuffle-on" }, {
      controls: { "control-button-shuffle": [disabled] }
    })).toBe("unavailable");
    expect(disabled.clickCount).toBe(0);

    const hidden = new FakeElement({
      attributes: {
        "aria-checked": "false",
        "data-testid": "control-button-shuffle",
        role: "switch"
      },
      visible: false
    });
    expect(await execute("spotify", { action: "shuffle-on" }, {
      controls: { "control-button-shuffle": [hidden] }
    })).toBe("unavailable");
    expect(hidden.clickCount).toBe(0);

    const labelOnly = new FakeElement({ attributes: {
      "aria-checked": "false",
      "aria-label": "Enable shuffle"
    } });
    expect(await execute("spotify", { action: "shuffle-on" }, {
      controls: { "control-button-shuffle": [labelOnly] }
    })).toBe("unavailable");
    expect(labelOnly.clickCount).toBe(0);

    const unknown = new FakeElement({ attributes: {
      "aria-checked": "mixed",
      "data-testid": "control-button-shuffle",
      role: "switch"
    } });
    expect(await execute("spotify", { action: "shuffle-on" }, {
      controls: { "control-button-shuffle": [unknown] }
    })).toBe("unavailable");
    expect(unknown.clickCount).toBe(0);
  });

  it("never touches Spotify mode controls on another provider", async () => {
    const shuffle = new FakeElement({ attributes: {
      "aria-checked": "false",
      "data-testid": "control-button-shuffle",
      role: "switch"
    } });
    expect(await execute("youtube", { action: "shuffle-on" }, {
      controls: { "control-button-shuffle": [shuffle] }
    })).toBe("unsupported");
    expect(shuffle.clickCount).toBe(0);
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
    expect(parseVoiceSemanticControlResult("recovered")).toBe("recovered");
    expect(parseVoiceSemanticControlResult("partial-mutation")).toBe("partial-mutation");
    expect(parseVoiceSemanticControlResult({ state: "acted" })).toBe("unavailable");
    expect(parseVoiceSemanticControlResult("anything-else")).toBe("unavailable");
  });
});
