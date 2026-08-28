import {
  VOICE_PLAYBACK_RATES,
  type VoicePlaybackRate
} from "./voice-intent";

export const MAX_VOICE_RELATIVE_SEEK_SECONDS = 60 * 60;
export const MAX_VOICE_ABSOLUTE_SEEK_SECONDS = 24 * 60 * 60;
const PLAYBACK_RATE_SETTLE_MS = 200;

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
  | { action: "fullscreen-exit" };

export type VoiceSemanticControlResult =
  | "complete"
  | "verified"
  | "acted"
  | "needs-follow-up"
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
  "fullscreen-exit"
]);
const RESULT_VALUES: readonly VoiceSemanticControlResult[] = [
  "complete",
  "verified",
  "acted",
  "needs-follow-up",
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
    const enabled = (element) => visible(element) &&
      element.disabled !== true && element.getAttribute("disabled") === null &&
      element.getAttribute("aria-disabled") !== "true";
    const label = (element) => [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-uia"),
      element.getAttribute("data-testid"),
      element.textContent
    ].filter(Boolean).join(" ").replace(/\\s+/g, " ").trim().toLocaleLowerCase("en-US");
    const firstControl = (selector) => [...document.querySelectorAll(selector)].find(enabled) ?? null;
    const clickControl = (selector) => {
      const control = firstControl(selector);
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
        next: '[data-testid="control-button-skip-forward"],button[aria-label^="Next" i],button[title^="Next" i]',
        previous: '[data-testid="control-button-skip-back"],button[aria-label^="Previous" i],button[title^="Previous" i]'
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
