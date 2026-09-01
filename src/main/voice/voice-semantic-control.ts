import {
  VOICE_PLAYBACK_RATES,
  type VoicePlaybackRate
} from "./voice-intent";

export const MAX_VOICE_RELATIVE_SEEK_SECONDS = 60 * 60;
export const MAX_VOICE_ABSOLUTE_SEEK_SECONDS = 24 * 60 * 60;
const PLAYBACK_RATE_SETTLE_MS = 200;
const SPOTIFY_STATE_POLL_INTERVAL_MS = 25;
const SPOTIFY_STATE_POLL_LIMIT = 8;
const SPOTIFY_STATE_SETTLE_MS = 100;
const SPOTIFY_REPEAT_HOST_POLL_INTERVAL_MS = 50;
const SPOTIFY_REPEAT_HOST_POLL_LIMIT = 12;
const SPOTIFY_REPEAT_MAX_TRANSITIONS = 3;

export type VoiceSpotifyRepeatState = "off" | "all" | "one";

export interface VoiceSpotifyRepeatControlState {
  enabled: boolean;
  state: VoiceSpotifyRepeatState;
}

export interface VoiceSpotifyRepeatDriverOptions {
  clickTransition: (expectedState: VoiceSpotifyRepeatState) => boolean | Promise<boolean>;
  pause?: (milliseconds: number, signal?: AbortSignal) => void | Promise<void>;
  readState: () =>
    | VoiceSpotifyRepeatControlState
    | null
    | Promise<VoiceSpotifyRepeatControlState | null>;
  signal?: AbortSignal;
}

export type VoiceSemanticControlRequest =
  | { action: "seek-relative"; offsetSeconds: number }
  | { action: "seek-absolute"; positionSeconds: number }
  | { action: "set-playback-rate"; playbackRate: VoicePlaybackRate }
  | { action: "restart" }
  | { action: "next" }
  | { action: "previous" }
  | { action: "skip-intro" }
  | { action: "skip-recap" }
  | { action: "skip-ad" }
  | { action: "captions-on" }
  | { action: "captions-off" }
  | { action: "fullscreen-enter" }
  | { action: "fullscreen-exit" }
  | { action: "shuffle-on" }
  | { action: "shuffle-off" }
  | { action: "repeat-all" }
  | { action: "repeat-one" }
  | { action: "repeat-off" };

export type VoiceSemanticControlResult =
  | "complete"
  | "verified"
  | "acted"
  | "needs-follow-up"
  | "partial-mutation"
  | "recovered"
  | "unavailable"
  | "unsupported";

type VoiceSemanticServiceId = "netflix" | "spotify" | "youtube";

const SIMPLE_ACTIONS = new Set<VoiceSemanticControlRequest["action"]>([
  "restart",
  "next",
  "previous",
  "skip-intro",
  "skip-recap",
  "skip-ad",
  "captions-on",
  "captions-off",
  "fullscreen-enter",
  "fullscreen-exit",
  "shuffle-on",
  "shuffle-off",
  "repeat-all",
  "repeat-one",
  "repeat-off"
]);
const RESULT_VALUES: readonly VoiceSemanticControlResult[] = [
  "complete",
  "verified",
  "acted",
  "needs-follow-up",
  "partial-mutation",
  "recovered",
  "unavailable",
  "unsupported"
];

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? value as Record<string, unknown>
    : null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function playbackRate(value: unknown): VoicePlaybackRate | null {
  return VOICE_PLAYBACK_RATES.some((rate) => rate === value)
    ? value as VoicePlaybackRate
    : null;
}

/**
 * Qualifies the untrusted command payload before it can be serialized into a
 * provider page. Unknown fields, strings in numeric fields, and out-of-range
 * seeks are rejected rather than coerced.
 */
export function normalizeVoiceSemanticControlRequest(
  value: unknown
): VoiceSemanticControlRequest | null {
  const request = plainRecord(value);
  if (request === null || typeof request.action !== "string") return null;

  if (request.action === "seek-relative") {
    if (!hasExactKeys(request, ["action", "offsetSeconds"])) return null;
    const offsetSeconds = boundedInteger(
      request.offsetSeconds,
      -MAX_VOICE_RELATIVE_SEEK_SECONDS,
      MAX_VOICE_RELATIVE_SEEK_SECONDS
    );
    return offsetSeconds === null || offsetSeconds === 0
      ? null
      : Object.freeze({ action: "seek-relative", offsetSeconds });
  }

  if (request.action === "seek-absolute") {
    if (!hasExactKeys(request, ["action", "positionSeconds"])) return null;
    const positionSeconds = boundedInteger(
      request.positionSeconds,
      0,
      MAX_VOICE_ABSOLUTE_SEEK_SECONDS
    );
    return positionSeconds === null
      ? null
      : Object.freeze({ action: "seek-absolute", positionSeconds });
  }

  if (request.action === "set-playback-rate") {
    if (!hasExactKeys(request, ["action", "playbackRate"])) return null;
    const rate = playbackRate(request.playbackRate);
    return rate === null
      ? null
      : Object.freeze({ action: "set-playback-rate", playbackRate: rate });
  }

  if (
    SIMPLE_ACTIONS.has(request.action as VoiceSemanticControlRequest["action"]) &&
    hasExactKeys(request, ["action"])
  ) {
    return Object.freeze({ action: request.action }) as VoiceSemanticControlRequest;
  }
  return null;
}

export function parseVoiceSemanticControlResult(
  value: unknown
): VoiceSemanticControlResult {
  return typeof value === "string" &&
    RESULT_VALUES.includes(value as VoiceSemanticControlResult)
    ? value as VoiceSemanticControlResult
    : "unavailable";
}

function spotifyRepeatTargetState(
  request: VoiceSemanticControlRequest
): VoiceSpotifyRepeatState | null {
  if (request.action === "repeat-off") return "off";
  if (request.action === "repeat-all") return "all";
  if (request.action === "repeat-one") return "one";
  return null;
}

export function parseVoiceSpotifyRepeatControlState(
  value: unknown
): VoiceSpotifyRepeatControlState | null {
  const state = plainRecord(value);
  if (
    state === null ||
    !hasExactKeys(state, ["enabled", "state"]) ||
    typeof state.enabled !== "boolean" ||
    typeof state.state !== "string" ||
    !["off", "all", "one"].includes(state.state)
  ) {
    return null;
  }
  return Object.freeze({
    enabled: state.enabled,
    state: state.state as VoiceSpotifyRepeatState
  });
}

/** Reads only Spotify's qualified repeat checkbox and never mutates the page. */
export function buildSpotifyRepeatControlStateScript(): string {
  return `(() => {
    const selector = '[data-nhdtv-spotify-control="repeat"][role="checkbox"],'
      + '[data-testid="control-button-repeat"][role="checkbox"]';
    const visible = (element) => {
      if (!(element instanceof HTMLElement) || element.hidden === true ||
        element.isConnected === false) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
        style.visibility !== "hidden" && Number(style.opacity || 1) > 0.05;
    };
    const enabled = (element) => visible(element) && element.disabled !== true &&
      element.getAttribute("disabled") === null &&
      element.getAttribute("aria-disabled") !== "true";
    const controls = [...document.querySelectorAll(selector)].filter(visible);
    if (controls.length !== 1) return null;
    const control = controls[0];
    const checked = control.getAttribute("aria-checked");
    const state = checked === "false" ? "off"
      : checked === "true" ? "all" : checked === "mixed" ? "one" : null;
    return state === null ? null : { enabled: enabled(control), state };
  })()`;
}

/**
 * Builds one synchronous, compare-before-click Spotify repeat transition. The
 * host must probe and settle state between calls, so no delayed page task can
 * issue another click after cancellation or operation supersession.
 */
export function buildSpotifyRepeatTransitionScript(
  expectedState: unknown
): string | null {
  const checked = expectedState === "off" ? "false"
    : expectedState === "all" ? "true"
      : expectedState === "one" ? "mixed" : null;
  if (checked === null) return null;
  return `(() => {
    const selector = '[data-nhdtv-spotify-control="repeat"][role="checkbox"],'
      + '[data-testid="control-button-repeat"][role="checkbox"]';
    const visible = (element) => {
      if (!(element instanceof HTMLElement) || element.hidden === true ||
        element.isConnected === false) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
        style.visibility !== "hidden" && Number(style.opacity || 1) > 0.05;
    };
    const enabled = (element) => visible(element) && element.disabled !== true &&
      element.getAttribute("disabled") === null &&
      element.getAttribute("aria-disabled") !== "true";
    const controls = [...document.querySelectorAll(selector)].filter(visible);
    if (controls.length !== 1) return false;
    const control = controls[0];
    if (!enabled(control) || control.getAttribute("aria-checked") !== ${JSON.stringify(checked)}) {
      return false;
    }
    control.click();
    return true;
  })()`;
}

async function defaultSpotifyRepeatPause(
  milliseconds: number,
  signal?: AbortSignal
): Promise<void> {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      action();
    };
    const abort = () => finish(() => reject(signal?.reason));
    const timeout = setTimeout(() => finish(resolve), milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
  signal?.throwIfAborted();
}

async function pauseSpotifyRepeatDriver(
  options: VoiceSpotifyRepeatDriverOptions
): Promise<void> {
  options.signal?.throwIfAborted();
  await (options.pause ?? defaultSpotifyRepeatPause)(
    SPOTIFY_REPEAT_HOST_POLL_INTERVAL_MS,
    options.signal
  );
  options.signal?.throwIfAborted();
}

async function settledSpotifyRepeatState(
  options: VoiceSpotifyRepeatDriverOptions,
  accepts: (state: VoiceSpotifyRepeatControlState) => boolean
): Promise<VoiceSpotifyRepeatControlState | null> {
  let previousState: VoiceSpotifyRepeatState | null = null;
  let consecutive = 0;
  for (let attempt = 0; attempt < SPOTIFY_REPEAT_HOST_POLL_LIMIT; attempt += 1) {
    options.signal?.throwIfAborted();
    const observed = await options.readState();
    options.signal?.throwIfAborted();
    if (observed !== null && accepts(observed)) {
      consecutive = previousState === observed.state ? consecutive + 1 : 1;
      previousState = observed.state;
      if (consecutive >= 2) return observed;
    } else {
      previousState = null;
      consecutive = 0;
    }
    if (attempt + 1 < SPOTIFY_REPEAT_HOST_POLL_LIMIT) {
      await pauseSpotifyRepeatDriver(options);
    }
  }
  return null;
}

async function clickAndObserveSpotifyRepeatTransition(
  currentState: VoiceSpotifyRepeatState,
  options: VoiceSpotifyRepeatDriverOptions
): Promise<{ clicked: boolean; state: VoiceSpotifyRepeatState | null }> {
  const ready = await settledSpotifyRepeatState(
    options,
    (observed) => observed.enabled && observed.state === currentState
  );
  if (ready === null) return { clicked: false, state: null };

  options.signal?.throwIfAborted();
  const clicked = await options.clickTransition(currentState);
  options.signal?.throwIfAborted();
  if (!clicked) return { clicked: false, state: null };

  const changed = await settledSpotifyRepeatState(
    options,
    (observed) => observed.state !== currentState
  );
  return { clicked: true, state: changed?.state ?? null };
}

async function recoverSpotifyRepeatState(
  originalState: VoiceSpotifyRepeatState,
  targetState: VoiceSpotifyRepeatState,
  options: VoiceSpotifyRepeatDriverOptions
): Promise<VoiceSemanticControlResult> {
  const seen = new Set<VoiceSpotifyRepeatState>();
  for (let transition = 0; transition < SPOTIFY_REPEAT_MAX_TRANSITIONS; transition += 1) {
    const current = await settledSpotifyRepeatState(options, () => true);
    if (current === null) return "partial-mutation";
    if (current.state === targetState) return "verified";
    if (current.state === originalState) return "recovered";
    if (seen.has(current.state)) return "partial-mutation";
    seen.add(current.state);

    const advanced = await clickAndObserveSpotifyRepeatTransition(current.state, options);
    if (!advanced.clicked || advanced.state === null) return "partial-mutation";
    if (advanced.state === targetState) return "verified";
    if (advanced.state === originalState) return "recovered";
  }
  return "partial-mutation";
}

/**
 * Drives Spotify's three-state repeat cycle with one host-authorized click per
 * round trip. Any failure after the first owned click is either recovered to
 * the original verified state or surfaced as an honest partial mutation.
 */
export async function executeSpotifyRepeatStateChange(
  request: VoiceSemanticControlRequest,
  options: VoiceSpotifyRepeatDriverOptions
): Promise<VoiceSemanticControlResult> {
  const targetState = spotifyRepeatTargetState(request);
  if (targetState === null) return "unsupported";
  const initial = await settledSpotifyRepeatState(options, () => true);
  if (initial === null) return "unavailable";
  if (initial.state === targetState) return "complete";

  const originalState = initial.state;
  const seen = new Set<VoiceSpotifyRepeatState>([originalState]);
  let currentState = originalState;
  for (let transition = 0; transition < SPOTIFY_REPEAT_MAX_TRANSITIONS; transition += 1) {
    const advanced = await clickAndObserveSpotifyRepeatTransition(currentState, options);
    if (!advanced.clicked) {
      return transition === 0
        ? "unavailable"
        : recoverSpotifyRepeatState(originalState, targetState, options);
    }
    if (advanced.state === null) {
      // A dispatched click may still apply asynchronously after polling ends.
      // Without an observed state transition there is no safe basis for a
      // recovery click or a claim that the original state was restored.
      return "partial-mutation";
    }
    currentState = advanced.state;
    if (currentState === targetState) return "verified";
    if (currentState === originalState) return "recovered";
    if (seen.has(currentState)) {
      return recoverSpotifyRepeatState(originalState, targetState, options);
    }
    seen.add(currentState);
  }
  return recoverSpotifyRepeatState(originalState, targetState, options);
}

function serviceId(value: unknown): VoiceSemanticServiceId | null {
  return value === "netflix" || value === "spotify" || value === "youtube"
    ? value
    : null;
}

/**
 * Builds a closed provider-page command. Only the normalized action and its
 * bounded number are serialized. Selectors, URLs, labels, and executable text
 * are all fixed inside this module.
 */
export function buildVoiceSemanticControlScript(
  rawServiceId: unknown,
  rawRequest: unknown
): string | null {
  const request = normalizeVoiceSemanticControlRequest(rawRequest);
  if (request === null) return null;
  const provider = serviceId(rawServiceId);
  if (provider === null) return `(() => "unsupported")()`;
  if (spotifyRepeatTargetState(request) !== null) {
    return provider === "spotify"
      ? `(() => "needs-follow-up")()`
      : `(() => "unsupported")()`;
  }

  return `(() => {
    const provider = ${JSON.stringify(provider)};
    const request = ${JSON.stringify(request)};
    const visible = (element) => {
      if (!(element instanceof HTMLElement) || element.hidden === true) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
        style.visibility !== "hidden" && Number(style.opacity || 1) > 0.05;
    };
    const enabled = (element) => element.isConnected !== false && visible(element) &&
      element.disabled !== true && element.getAttribute("disabled") === null &&
      element.getAttribute("aria-disabled") !== "true";
    const label = (element) => [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-uia"),
      element.getAttribute("data-testid"),
      element.textContent
    ].filter(Boolean).join(" ").replace(/\\s+/g, " ").trim().toLocaleLowerCase("en-US");
    const selectorList = (selectors) => Array.isArray(selectors) ? selectors : [selectors];
    const firstControl = (selectors) => {
      for (const selector of selectorList(selectors)) {
        const control = [...document.querySelectorAll(selector)].find(enabled);
        if (control !== undefined) return control;
      }
      return null;
    };
    const clickControl = (selectors) => {
      const control = firstControl(selectors);
      if (control === null) return "unavailable";
      control.click();
      return "acted";
    };
    const activeVideo = () => [...document.querySelectorAll("video")]
      .filter((video) => video instanceof HTMLVideoElement && video.isConnected !== false &&
        !video.ended && (visible(video) || !video.paused))
      .sort((left, right) => Number(left.paused) - Number(right.paused))[0] ?? null;
    const seekVideo = (targetForVideo) => {
      const video = activeVideo();
      if (video === null || !Number.isFinite(video.duration) || video.duration <= 0) {
        return "unavailable";
      }
      const target = Math.min(
        Math.max(0, targetForVideo(video)),
        Math.max(0, video.duration - 0.25)
      );
      if (!Number.isFinite(target)) return "unavailable";
      if (Math.abs(video.currentTime - target) <= 0.5) return "complete";
      try {
        video.currentTime = target;
        return Math.abs(video.currentTime - target) <= 0.5 ? "verified" : "acted";
      } catch {
        return "unavailable";
      }
    };
    const youtubeFullscreen = () => document.querySelector(
      ".html5-video-player.ytp-fullscreen,#movie_player.ytp-fullscreen"
    ) !== null;
    const activeVideoIsFullscreen = () => {
      const fullscreen = document.fullscreenElement;
      const video = activeVideo();
      return youtubeFullscreen() || (fullscreen !== null && video !== null &&
        (fullscreen === video || (typeof fullscreen.contains === "function" && fullscreen.contains(video))));
    };

    const controls = {
      netflix: {
        next: '[data-uia="control-next"],button[aria-label^="Next Episode" i],button[title^="Next Episode" i]',
        previous: '[data-uia="control-previous"],button[aria-label^="Previous Episode" i],button[title^="Previous Episode" i]',
        skipIntro: '[data-uia="player-skip-intro"],[data-uia="control-skip-intro"],button[aria-label*="Skip Intro" i]',
        skipRecap: '[data-uia="player-skip-recap"],[data-uia="control-skip-recap"],button[aria-label*="Skip Recap" i]',
        skipAd: '[data-uia*="skip-ad"],button[aria-label^="Skip Ad" i],button[title^="Skip Ad" i]',
        captionsMenu: '[data-uia="control-audio-subtitle"],button[aria-label*="Audio & Subtitles" i]',
        captionOptions: '[data-uia*="subtitle-item"],[data-uia*="subtitle-option"]',
        fullscreenEnter: '[data-uia="control-fullscreen-enter"],button[aria-label^="Full screen" i],button[title^="Full screen" i]',
        fullscreenExit: '[data-uia="control-fullscreen-exit"],button[aria-label^="Exit full screen" i],button[title^="Exit full screen" i]'
      },
      spotify: {
        next: [
          '[data-nhdtv-spotify-control="next"]',
          '[data-testid="control-button-skip-forward"],button[aria-label^="Next" i],button[title^="Next" i]'
        ],
        previous: [
          '[data-nhdtv-spotify-control="previous"]',
          '[data-testid="control-button-skip-back"],button[aria-label^="Previous" i],button[title^="Previous" i]'
        ],
        shuffle: [
          '[data-nhdtv-spotify-control="shuffle"][role="switch"]',
          '[data-testid="control-button-shuffle"][role="switch"]'
        ]
      },
      youtube: {
        next: 'button.ytp-next-button,button[aria-label^="Next video" i],button[title^="Next" i]',
        previous: 'button.ytp-prev-button,button[aria-label^="Previous video" i],button[title^="Previous" i]',
        skipAd: 'button.ytp-ad-skip-button-modern,button.ytp-ad-skip-button,button.ytp-skip-ad-button,button[aria-label^="Skip ad" i],button[aria-label^="Skip ads" i]',
        captions: 'button.ytp-subtitles-button,button[aria-label*="Subtitles" i],button[aria-label*="captions" i]',
        fullscreenEnter: 'button.ytp-fullscreen-button,button[aria-label^="Full screen" i],button[title^="Full screen" i]',
        fullscreenExit: 'button.ytp-fullscreen-button,button[aria-label^="Exit full screen" i],button[title^="Exit full screen" i]'
      }
    };
    const providerControls = controls[provider];
    const spotifyControl = (selectors) => {
      for (const selector of selectorList(selectors)) {
        const control = [...document.querySelectorAll(selector)]
          .find((element) => element instanceof HTMLElement && element.isConnected !== false);
        if (control !== undefined) return control;
      }
      return null;
    };
    const waitForSpotifyStateChange = (selectors, readState, previousState) =>
      new Promise((resolve) => {
        let polls = 0;
        const poll = () => {
          const control = spotifyControl(selectors);
          if (control !== null) {
            const state = readState(control);
            if (state === null) {
              resolve(null);
              return;
            }
            if (state !== previousState) {
              resolve({ control, state });
              return;
            }
          }
          polls += 1;
          if (polls >= ${SPOTIFY_STATE_POLL_LIMIT}) {
            resolve(null);
            return;
          }
          setTimeout(poll, ${SPOTIFY_STATE_POLL_INTERVAL_MS});
        };
        setTimeout(poll, ${SPOTIFY_STATE_POLL_INTERVAL_MS});
      });
    const spotifyTargetSettled = (selectors, readState, targetState) =>
      new Promise((resolve) => {
        setTimeout(() => {
          const control = spotifyControl(selectors);
          resolve(control !== null && readState(control) === targetState);
        }, ${SPOTIFY_STATE_SETTLE_MS});
      });
    const applySpotifyShuffleState = () => {
      if (provider !== "spotify") return "unsupported";
      const control = firstControl(providerControls.shuffle);
      if (control === null) return "unavailable";
      const readState = (element) => {
        const state = element.getAttribute("aria-checked");
        return state === "true" || state === "false" ? state : null;
      };
      const currentState = readState(control);
      if (currentState === null) return "unavailable";
      const targetState = request.action === "shuffle-on" ? "true" : "false";
      if (currentState === targetState) return "complete";
      control.click();
      return waitForSpotifyStateChange(providerControls.shuffle, readState, currentState)
        .then(async (observed) => observed?.state === targetState &&
          await spotifyTargetSettled(providerControls.shuffle, readState, targetState)
          ? "verified"
          : "unavailable");
    };
    if (request.action === "set-playback-rate") {
      if (provider !== "netflix" && provider !== "youtube") return "unsupported";
      const video = activeVideo();
      if (
        video === null ||
        video.isConnected !== true ||
        video.ended ||
        video.readyState < 1 ||
        !Number.isFinite(video.duration) ||
        video.duration <= 0
      ) {
        return "unavailable";
      }
      const target = request.playbackRate;
      if (Math.abs(video.playbackRate - target) <= 0.001) return "complete";
      try {
        video.playbackRate = target;
      } catch {
        return "unavailable";
      }
      return new Promise((resolve) => {
        setTimeout(() => {
          const unchangedVideo = video.isConnected === true && !video.ended &&
            activeVideo() === video && Number.isFinite(video.duration) && video.duration > 0;
          resolve(unchangedVideo && Math.abs(video.playbackRate - target) <= 0.001
            ? "verified"
            : "unavailable");
        }, ${PLAYBACK_RATE_SETTLE_MS});
      });
    }
    if (request.action === "shuffle-on" || request.action === "shuffle-off") {
      return applySpotifyShuffleState();
    }
    if (request.action === "seek-relative") {
      if (provider === "spotify") return "unsupported";
      return seekVideo((video) => video.currentTime + request.offsetSeconds);
    }
    if (request.action === "seek-absolute") {
      if (provider === "spotify") return "unsupported";
      return seekVideo(() => request.positionSeconds);
    }
    if (request.action === "restart") {
      if (provider === "spotify") return "unsupported";
      return seekVideo(() => 0);
    }
    if (request.action === "next" || request.action === "previous") {
      return clickControl(providerControls[request.action]);
    }
    if (request.action === "skip-intro") {
      return provider === "netflix"
        ? clickControl(providerControls.skipIntro)
        : "unsupported";
    }
    if (request.action === "skip-recap") {
      return provider === "netflix"
        ? clickControl(providerControls.skipRecap)
        : "unsupported";
    }
    if (request.action === "skip-ad") {
      if (provider === "spotify") return "unsupported";
      return clickControl(providerControls.skipAd);
    }
    if (request.action === "captions-on" || request.action === "captions-off") {
      const desired = request.action === "captions-on";
      if (provider === "spotify") return "unsupported";
      if (provider === "youtube") {
        const button = firstControl(providerControls.captions);
        if (button === null) return "unavailable";
        const pressed = button.getAttribute("aria-pressed");
        const copy = label(button);
        const current = pressed === "true" ? true : pressed === "false" ? false
          : /(?:turn off|disable|hide) (?:subtitles|captions)/.test(copy) ? true
            : /(?:turn on|enable|show) (?:subtitles|captions)/.test(copy) ? false : null;
        if (current === null) return "unavailable";
        if (current === desired) return "complete";
        button.click();
        return button.getAttribute("aria-pressed") === String(desired)
          ? "verified"
          : "acted";
      }
      const options = [...document.querySelectorAll(providerControls.captionOptions)].filter(enabled);
      const optionState = (option) => option.getAttribute("aria-checked") === "true" ||
        option.getAttribute("aria-selected") === "true" || option.getAttribute("data-selected") === "true";
      const offOption = options.find((option) => /(?:^|\\b)(?:off|none|subtitles off|captions off)(?:\\b|$)/.test(label(option)));
      const onOptions = options.filter((option) => option !== offOption);
      const selectedOff = offOption !== undefined && optionState(offOption);
      const selectedOn = onOptions.some(optionState);
      if ((desired && selectedOn) || (!desired && selectedOff)) return "complete";
      const target = desired ? onOptions[0] ?? null : offOption ?? null;
      if (target !== null) {
        target.click();
        return optionState(target) ? "verified" : "acted";
      }
      const menu = firstControl(providerControls.captionsMenu);
      if (menu === null || menu.getAttribute("aria-expanded") === "true") return "unavailable";
      menu.click();
      return "needs-follow-up";
    }
    if (request.action === "fullscreen-enter") {
      if (provider === "spotify") return "unsupported";
      if (activeVideoIsFullscreen()) return "complete";
      const control = firstControl(providerControls.fullscreenEnter);
      if (control !== null) {
        control.click();
        return activeVideoIsFullscreen() ? "verified" : "acted";
      }
      const video = activeVideo();
      if (video === null || typeof video.requestFullscreen !== "function") return "unavailable";
      try {
        const pending = video.requestFullscreen();
        if (pending && typeof pending.catch === "function") pending.catch(() => undefined);
        return "acted";
      } catch {
        return "unavailable";
      }
    }
    if (request.action === "fullscreen-exit") {
      if (provider === "spotify") return "unsupported";
      if (!activeVideoIsFullscreen()) return "complete";
      const control = firstControl(providerControls.fullscreenExit);
      if (control !== null) {
        control.click();
        return !activeVideoIsFullscreen() ? "verified" : "acted";
      }
      if (typeof document.exitFullscreen !== "function") return "unavailable";
      try {
        const pending = document.exitFullscreen();
        if (pending && typeof pending.catch === "function") pending.catch(() => undefined);
        return "acted";
      } catch {
        return "unavailable";
      }
    }
    return "unsupported";
  })()`;
}
