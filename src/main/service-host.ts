import {
  BrowserWindow,
  net,
  session,
  type Session,
  WebContentsView
} from "electron";
import {
  isAllowedServiceUrl,
  isAllowedArtworkUrl,
  isExpectedAllowedNavigationAbort,
  isAllowedServicePermission,
  isServiceRootUrl,
  originForDiagnostics,
  sanitizePlaybackUrl,
  type ServiceDefinition
} from "./security/navigation-policy";
import {
  buildPlaybackActivationTrackerScript,
  buildPlaybackSnapshotScript,
  qualifyPlaybackSnapshot
} from "./playback-observer";
import type {
  NavigationDiagnostic,
  RemoteAction,
  RemotePointerInput,
  RemotePointerResult,
  RemoteTextInput,
  ServiceFailureKind,
  ServiceRecoveryMode,
  ServiceRecoveryRequest,
  ServiceQuitRequest
} from "./contracts";
import {
  classifyServiceFailure,
  serviceRecoveryRequest
} from "./service-recovery";
import { dispatchPrecisionPointer } from "./precision-pointer";
import {
  buildRemoteTextEntryAvailabilityScript,
  buildRemoteTextEntryScript
} from "./remote-text-entry";
import {
  serviceConsumedBack,
  type ServiceBackState
} from "./service-navigation";
import { scoreSpatialCandidate } from "./spatial-navigation";

export type ServiceStateListener = (activeServiceId: string | null) => void;
export type ServiceQuitListener = (request: ServiceQuitRequest) => void;
export type ServiceRecoveryListener = (request: ServiceRecoveryRequest) => void;
export interface PlaybackObservation {
  artworkUrl: string | null;
  durationSeconds: number;
  ended: boolean;
  positionSeconds: number;
  serviceId: string;
  serviceName: string;
  subtitle: string | null;
  title: string;
  watchUrl: string;
}
export type PlaybackListener = (observation: PlaybackObservation) => void | Promise<void>;

type ServiceSpatialAction = Exclude<RemoteAction, "back" | "force-home" | "home">;

interface ServiceRecoveryTarget {
  definition: ServiceDefinition;
  url: string;
}

export interface NetflixSmokeResult {
  detail: string;
  status: "auth-required" | "failed" | "inconclusive" | "passed" | "profile-required";
}

export interface YouTubeAuthSmokeResult {
  detail: string;
  status: "already-signed-in" | "failed" | "inconclusive" | "passed";
}

interface NetflixSmokeSnapshot {
  currentTime: number;
  errorCode: number | null;
  hasE100: boolean;
  hasPardonInterruption: boolean;
  hasPlayControl: boolean;
  isLogin: boolean;
  isPlaying: boolean;
  isProfileGate: boolean;
  readyState: number;
}

const configuredSessions = new WeakSet<Session>();
const NETFLIX_TEST_TITLE_URL = "https://www.netflix.com/title/80018499";
const NETFLIX_SMOKE_TIMEOUT_MS = 45_000;
const YOUTUBE_AUTH_SMOKE_TIMEOUT_MS = 15_000;
const PLAYBACK_CHECKPOINT_INTERVAL_MS = 10_000;
const PLAYBACK_QUALIFICATION_DELAY_MS = 5_500;
const REMOTE_TEXT_ENTRY_SETTLE_DELAYS_MS = [0, 45, 120] as const;
const SERVICE_FOCUS_STYLE = `
  html[data-nhd-tv-has-focus="true"]::after {
    position: fixed !important;
    z-index: 2147483647 !important;
    top: var(--nhd-tv-focus-top) !important;
    left: var(--nhd-tv-focus-left) !important;
    width: var(--nhd-tv-focus-width) !important;
    height: var(--nhd-tv-focus-height) !important;
    box-sizing: border-box !important;
    border: 4px solid #63e6ff !important;
    border-radius: 10px !important;
    box-shadow: 0 0 0 2px rgb(2 8 23 / 88%), 0 0 28px rgb(34 211 238 / 82%) !important;
    content: "" !important;
    pointer-events: none !important;
    transform: scale(1.025) !important;
    transform-origin: center !important;
    transition: top 70ms ease-out, left 70ms ease-out, width 70ms ease-out, height 70ms ease-out !important;
  }
`;

const serviceBackStateScript = `(() => {
  const visible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      Number(style.opacity) > 0.05 && rect.width > 0 && rect.height > 0;
  };
  const active = document.activeElement;
  return {
    editable: active instanceof HTMLElement &&
      (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)),
    expanded: [...document.querySelectorAll('[aria-expanded="true"]')].filter(visible).length,
    overlays: [...document.querySelectorAll('dialog[open],[role="dialog"],[aria-modal="true"]')].filter(visible).length,
    url: location.href
  };
})()`;

const serviceClearSpatialFocusScript = `(() => {
  document.querySelectorAll('[data-nhd-tv-focus="true"]').forEach((element) => {
    element.removeAttribute('data-nhd-tv-focus');
  });
  document.documentElement.removeAttribute('data-nhd-tv-has-focus');
})()`;

function shouldUseDomSpatialNavigation(
  definition: ServiceDefinition,
  currentUrl: string,
  htmlFullscreen: boolean
): boolean {
  if (definition.spatialNavigation !== "dom" || htmlFullscreen) {
    return false;
  }

  try {
    const path = new URL(currentUrl).pathname;
    return !/(?:^|\/)(?:play|player|video|watch)(?:\/|$)/i.test(path);
  } catch {
    return false;
  }
}

function serviceSpatialNavigationScript(action: ServiceSpatialAction): string {
  return `(() => {
    const action = ${JSON.stringify(action)};
    const scoreCandidate = (${scoreSpatialCandidate.toString()});
    const clearFocus = () => {
      document.querySelectorAll('[data-nhd-tv-focus="true"]').forEach((element) => {
        element.removeAttribute('data-nhd-tv-focus');
      });
      document.documentElement.removeAttribute('data-nhd-tv-has-focus');
    };
    if (document.fullscreenElement !== null) {
      clearFocus();
      return false;
    }

    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))
    ) {
      clearFocus();
      return false;
    }

    const selectors = [
      'a[href]',
      'button',
      '[role="button"]',
      '[role="link"]',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');
    let candidates = [...document.querySelectorAll(selectors)].filter((element) => {
      if (
        !(element instanceof HTMLElement) ||
        element.matches(':disabled,[aria-disabled="true"],[aria-hidden="true"],[inert]') ||
        element.closest('[aria-hidden="true"],[inert]') !== null
      ) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0.05 &&
        rect.width >= 12 &&
        rect.height >= 12 &&
        rect.bottom >= -24 &&
        rect.top <= innerHeight + 24 &&
        rect.right >= -24 &&
        rect.left <= innerWidth + 24
      );
    });

    const youtubeCardTargets = new Set();
    if (location.hostname === 'www.youtube.com' || location.hostname.endsWith('.youtube.com')) {
      const cardSelector = [
        'ytd-rich-item-renderer',
        'ytd-video-renderer',
        'ytd-grid-video-renderer',
        'ytd-compact-video-renderer',
        'yt-lockup-view-model'
      ].join(',');
      for (const card of document.querySelectorAll(cardSelector)) {
        const target = [...card.querySelectorAll(
          'a[href^="/watch"], a[href^="/shorts/"]'
        )].find((element) => candidates.includes(element));
        if (target instanceof HTMLElement) youtubeCardTargets.add(target);
      }
      candidates = candidates.filter((element) => {
        const card = element.closest(cardSelector);
        return card === null || youtubeCardTargets.has(element);
      });
    }

    candidates = candidates.filter((element, index, all) =>
      youtubeCardTargets.has(element) || !all.some((other, otherIndex) =>
        otherIndex < index && other.contains(element) &&
          other.getBoundingClientRect().width === element.getBoundingClientRect().width
      )
    );

    if (candidates.length === 0) {
      clearFocus();
      return false;
    }

    let current = candidates.includes(active)
      ? active
      : candidates.find((candidate) => candidate.dataset.nhdTvFocus === 'true');

    const applyFocus = (element) => {
      document.querySelectorAll('[data-nhd-tv-focus="true"]').forEach((focused) => {
        focused.removeAttribute('data-nhd-tv-focus');
      });
      element.dataset.nhdTvFocus = 'true';
      element.focus({ preventScroll: true });
      const focusFrame = youtubeCardTargets.has(element)
        ? element.closest('ytd-rich-item-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer,yt-lockup-view-model') || element
        : element;
      focusFrame.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
      const updateOverlay = () => {
        const rect = focusFrame.getBoundingClientRect();
        document.documentElement.dataset.nhdTvHasFocus = 'true';
        document.documentElement.style.setProperty('--nhd-tv-focus-top', rect.top + 'px');
        document.documentElement.style.setProperty('--nhd-tv-focus-left', rect.left + 'px');
        document.documentElement.style.setProperty('--nhd-tv-focus-width', rect.width + 'px');
        document.documentElement.style.setProperty('--nhd-tv-focus-height', rect.height + 'px');
      };
      updateOverlay();
      setTimeout(updateOverlay, 80);
    };

    if (!(current instanceof HTMLElement)) {
      const initialTargets = [...youtubeCardTargets]
        .filter((element) =>
          candidates.includes(element) && element.closest('ytd-ad-slot-renderer') === null
        );
      current = (initialTargets.length > 0 ? initialTargets : candidates).sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return leftRect.top - rightRect.top || leftRect.left - rightRect.left;
      })[0];
      applyFocus(current);
      return true;
    }

    if (action === 'select') {
      applyFocus(current);
      current.click();
      return true;
    }

    const currentRect = current.getBoundingClientRect();
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      if (candidate === current) continue;
      const rect = candidate.getBoundingClientRect();
      const score = scoreCandidate(action, currentRect, rect);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    if (!(best instanceof HTMLElement)) return false;
    applyFocus(best);
    return true;
  })()`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const netflixSnapshotScript = `(() => {
  const bodyText = document.body?.innerText ?? "";
  const video = document.querySelector("video");
  const playControl = [...document.querySelectorAll("button, a")].find((element) => {
    const label = [
      element.getAttribute("aria-label") ?? "",
      element.getAttribute("data-uia") ?? "",
      element.textContent ?? ""
    ].join(" ").trim();

    return /(^|\\s)play(\\s|$)|play-button/i.test(label);
  });

  return {
    currentTime: video?.currentTime ?? 0,
    errorCode: video?.error?.code ?? null,
    hasE100: /(^|\\s)E100(\\s|$)/i.test(bodyText),
    hasPardonInterruption: /pardon the interruption/i.test(bodyText),
    hasPlayControl: Boolean(playControl),
    isLogin: location.pathname.includes("/login"),
    isPlaying: Boolean(video && !video.paused && !video.ended),
    isProfileGate: /who(?:'|’)s watching/i.test(bodyText),
    readyState: video?.readyState ?? 0
  };
})()`;

const netflixClickPlayScript = `(() => {
  const playControl = [...document.querySelectorAll("button, a")].find((element) => {
    const label = [
      element.getAttribute("aria-label") ?? "",
      element.getAttribute("data-uia") ?? "",
      element.textContent ?? ""
    ].join(" ").trim();

    return /(^|\\s)play(\\s|$)|play-button/i.test(label);
  });

  if (!(playControl instanceof HTMLElement)) {
    return false;
  }

  playControl.click();
  return true;
})()`;

const youtubeSignInSnapshotScript = `(() => {
  const controls = [...document.querySelectorAll("a, button, [role=button]")];
  const signIn = controls.find((element) => {
    const label = [
      element.getAttribute("aria-label") ?? "",
      element.textContent ?? ""
    ].join(" ").trim();
    const href = element instanceof HTMLAnchorElement ? element.href : "";
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const visible =
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden";
    return visible && (/sign in/i.test(label) || href.startsWith("https://accounts.google.com/"));
  });

  return {
    hasAccount: Boolean(document.querySelector('#avatar-btn, button[aria-label^="Account menu"]')),
    hasSignIn: Boolean(signIn),
    isGoogleAccounts: location.origin === "https://accounts.google.com"
  };
})()`;

const youtubeClickSignInScript = `(() => {
  const controls = [...document.querySelectorAll("a, button, [role=button]")];
  const signIn = controls.find((element) => {
    const label = [
      element.getAttribute("aria-label") ?? "",
      element.textContent ?? ""
    ].join(" ").trim();
    const href = element instanceof HTMLAnchorElement ? element.href : "";
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const visible =
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden";
    return visible && (/sign in/i.test(label) || href.startsWith("https://accounts.google.com/"));
  });

  if (!(signIn instanceof HTMLElement)) return false;
  signIn.click();
  return true;
})()`;

function configureServiceSession(serviceSession: Session, definition: ServiceDefinition): void {
  if (configuredSessions.has(serviceSession)) {
    return;
  }

  serviceSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) =>
    isAllowedServicePermission(permission, requestingOrigin, definition)
  );

  serviceSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || webContents.getURL();
    callback(isAllowedServicePermission(permission, requestingUrl, definition));
  });

  serviceSession.on("will-download", (event) => {
    event.preventDefault();
  });

  configuredSessions.add(serviceSession);
}

export class ServiceHost {
  readonly #window: BrowserWindow;
  readonly #onStateChanged: ServiceStateListener;
  readonly #onQuitRequested: ServiceQuitListener;
  readonly #onRecoveryRequested: ServiceRecoveryListener;
  readonly #onPlayback: PlaybackListener;
  #activeDefinition: ServiceDefinition | null = null;
  #htmlFullscreen = false;
  #lastBlockedNavigation: NavigationDiagnostic | null = null;
  #popupWindow: BrowserWindow | null = null;
  #quitPromptVisible = false;
  #recoveryTarget: ServiceRecoveryTarget | null = null;
  #replayingInput = false;
  #playbackCheckpoint: Promise<void> | null = null;
  #playbackQualificationTimer: NodeJS.Timeout | null = null;
  #playbackTimer: NodeJS.Timeout | null = null;
  #pointerSnapKey: string | null = null;
  #view: WebContentsView | null = null;
  #windowWasFullScreenOnOpen = false;

  constructor(
    window: BrowserWindow,
    onStateChanged: ServiceStateListener,
    onQuitRequested: ServiceQuitListener,
    onRecoveryRequested: ServiceRecoveryListener,
    onPlayback: PlaybackListener = () => undefined
  ) {
    this.#window = window;
    this.#onStateChanged = onStateChanged;
    this.#onQuitRequested = onQuitRequested;
    this.#onRecoveryRequested = onRecoveryRequested;
    this.#onPlayback = onPlayback;
    this.#window.on("resize", () => this.#resize());
  }

  get activeServiceId(): string | null {
    return this.#activeDefinition?.id ?? null;
  }

  get activeProcessId(): number | null {
    if (this.#view === null || this.#view.webContents.isDestroyed()) {
      return null;
    }

    const processId = this.#view.webContents.getOSProcessId();
    return processId > 0 ? processId : null;
  }

  get isHtmlFullscreen(): boolean {
    return this.#htmlFullscreen;
  }

  get isQuitPromptVisible(): boolean {
    return this.#quitPromptVisible;
  }

  get hasRecoveryTarget(): boolean {
    return this.#recoveryTarget !== null;
  }

  get lastBlockedNavigation(): NavigationDiagnostic | null {
    return this.#lastBlockedNavigation;
  }

  async open(definition: ServiceDefinition, initialUrl = definition.startUrl): Promise<void> {
    if (!isAllowedServiceUrl(initialUrl, definition.allowedOrigins)) {
      throw new Error(`Initial service URL is outside the ${definition.name} boundary.`);
    }

    await this.closeWithCheckpoint();
    this.#recoveryTarget = null;
    this.#lastBlockedNavigation = null;
    this.#pointerSnapKey = null;
    this.#windowWasFullScreenOnOpen = this.#window.isFullScreen();

    const serviceSession = session.fromPartition(definition.partition, { cache: true });
    configureServiceSession(serviceSession, definition);

    const view = new WebContentsView({
      webPreferences: {
        allowRunningInsecureContent: false,
        contextIsolation: true,
        devTools: process.argv.includes("--devtools"),
        nodeIntegration: false,
        sandbox: true,
        session: serviceSession,
        webSecurity: true
      }
    });

    view.setBackgroundColor("#05070d");
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedServiceUrl(url, definition.allowedOrigins)) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            backgroundColor: "#05070d",
            fullscreenable: false,
            height: 760,
            modal: true,
            parent: this.#window,
            show: true,
            title: `${definition.name} sign in`,
            webPreferences: {
              allowRunningInsecureContent: false,
              contextIsolation: true,
              devTools: process.argv.includes("--devtools"),
              nodeIntegration: false,
              sandbox: true,
              session: serviceSession,
              webSecurity: true
            },
            width: 620
          }
        };
      }

      this.#recordBlockedNavigation("popup", url, definition);
      return { action: "deny" };
    });

    view.webContents.on("did-create-window", (popup) => {
      if (this.#popupWindow !== null && !this.#popupWindow.isDestroyed()) {
        this.#popupWindow.close();
      }

      this.#popupWindow = popup;
      popup.setMenuBarVisibility(false);
      popup.webContents.setWindowOpenHandler(({ url }) => {
        this.#recordBlockedNavigation("popup", url, definition);
        return { action: "deny" };
      });
      popup.webContents.on("will-navigate", (event, url) => {
        if (!isAllowedServiceUrl(url, definition.allowedOrigins)) {
          event.preventDefault();
          this.#recordBlockedNavigation("navigation", url, definition);
        }
      });
      popup.webContents.on("will-redirect", (event, url) => {
        if (!isAllowedServiceUrl(url, definition.allowedOrigins)) {
          event.preventDefault();
          this.#recordBlockedNavigation("redirect", url, definition);
        }
      });
      popup.on("closed", () => {
        if (this.#popupWindow === popup) {
          this.#popupWindow = null;
        }
      });
    });

    view.webContents.on("before-input-event", (event, input) => {
      if (this.#replayingInput) {
        return;
      }

      if (
        input.type === "keyDown" &&
        input.control &&
        input.shift &&
        input.key.toLocaleLowerCase() === "h"
      ) {
        event.preventDefault();
        void this.forceReturnHome();
        return;
      }

      if (input.type !== "keyDown") return;

      if (input.key === "Escape") {
        if (this.#htmlFullscreen) {
          return;
        }

        event.preventDefault();
        void this.requestBack();
        return;
      }

      const spatialAction: Readonly<Record<string, ServiceSpatialAction>> = {
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        Enter: "select"
      };
      const action = spatialAction[input.key];

      if (
        action !== undefined &&
        shouldUseDomSpatialNavigation(definition, view.webContents.getURL(), this.#htmlFullscreen)
      ) {
        event.preventDefault();
        void this.#runDomSpatialNavigation(action).then((handled) => {
          if (!handled) {
            this.#sendKey(action);
          }
        });
      }
    });

    view.webContents.on("did-finish-load", () => {
      this.#pointerSnapKey = null;
      if (this.#view === view && definition.spatialNavigation === "dom") {
        void view.webContents.insertCSS(SERVICE_FOCUS_STYLE).catch(() => undefined);
      }

      if (this.#view === view) {
        if (definition.playback !== null) {
          void view.webContents.executeJavaScript(
            buildPlaybackActivationTrackerScript(definition.playback.pathPrefixes),
            true
          ).catch(() => undefined);
        }
        void this.#checkpointPlayback();
      }
    });

    view.webContents.on("did-navigate-in-page", () => {
      if (this.#view === view) {
        if (!shouldUseDomSpatialNavigation(
          definition,
          view.webContents.getURL(),
          this.#htmlFullscreen
        )) {
          void view.webContents.executeJavaScript(
            serviceClearSpatialFocusScript,
            true
          ).catch(() => undefined);
        }
        void this.#checkpointPlayback();
      }
    });

    view.webContents.on("media-paused", () => {
      if (this.#view === view) {
        void this.#checkpointPlayback();
      }
    });

    view.webContents.on("media-started-playing", () => {
      if (this.#view !== view) {
        return;
      }

      if (this.#playbackQualificationTimer !== null) {
        clearTimeout(this.#playbackQualificationTimer);
      }

      this.#playbackQualificationTimer = setTimeout(() => {
        this.#playbackQualificationTimer = null;
        if (this.#view === view) {
          void this.#checkpointPlayback();
        }
      }, PLAYBACK_QUALIFICATION_DELAY_MS);
    });

    view.webContents.on("enter-html-full-screen", () => {
      if (this.#view === view) {
        this.#htmlFullscreen = true;
        this.#window.setFullScreen(true);
        this.#onStateChanged(this.activeServiceId);
      }
    });

    view.webContents.on("leave-html-full-screen", () => {
      if (this.#view === view) {
        this.#htmlFullscreen = false;
        this.#window.setFullScreen(this.#windowWasFullScreenOnOpen);
        this.#onStateChanged(this.activeServiceId);
      }
    });

    view.webContents.on("will-navigate", (event, url) => {
      if (!isAllowedServiceUrl(url, definition.allowedOrigins)) {
        event.preventDefault();
        this.#recordBlockedNavigation("navigation", url, definition);
      } else {
        void this.#checkpointPlayback();
      }
    });

    view.webContents.on("will-redirect", (event, url) => {
      if (!isAllowedServiceUrl(url, definition.allowedOrigins)) {
        event.preventDefault();
        this.#recordBlockedNavigation("redirect", url, definition);
      }
    });

    view.webContents.on(
      "did-fail-load",
      (_event, errorCode, _errorDescription, _validatedUrl, isMainFrame) => {
        if (this.#view !== view || !isMainFrame || errorCode === -3) return;
        this.#failActiveService(
          classifyServiceFailure("load-failed", net.isOnline(), errorCode)
        );
      }
    );

    view.webContents.on("render-process-gone", () => {
      if (this.#view === view) {
        this.#failActiveService("crashed");
      }
    });

    view.webContents.on("unresponsive", () => {
      if (this.#view === view) {
        this.#failActiveService("unresponsive");
      }
    });

    this.#view = view;
    this.#activeDefinition = definition;
    this.#window.contentView.addChildView(view);
    this.#resize();
    view.webContents.focus();
    this.#onStateChanged(definition.id);
    this.#playbackTimer = setInterval(() => {
      void this.#checkpointPlayback();
    }, PLAYBACK_CHECKPOINT_INTERVAL_MS);

    try {
      await view.webContents.loadURL(initialUrl);
      if (this.#view === view && !view.webContents.isDestroyed()) {
        view.webContents.focus();
      }
    } catch (error) {
      const currentUrl = view.webContents.isDestroyed()
        ? initialUrl
        : view.webContents.getURL();
      if (
        isExpectedAllowedNavigationAbort(
          error,
          currentUrl,
          definition.allowedOrigins
        )
      ) {
        if (this.#view === view && !view.webContents.isDestroyed()) {
          view.webContents.focus();
        }
        return;
      }

      this.close();
      throw error;
    }
  }

  close(): void {
    const view = this.#view;
    const viewWasAttached = view !== null && !this.#quitPromptVisible;

    if (this.#playbackTimer !== null) {
      clearInterval(this.#playbackTimer);
      this.#playbackTimer = null;
    }

    if (this.#playbackQualificationTimer !== null) {
      clearTimeout(this.#playbackQualificationTimer);
      this.#playbackQualificationTimer = null;
    }

    if (this.#popupWindow !== null && !this.#popupWindow.isDestroyed()) {
      this.#popupWindow.close();
    }

    this.#view = null;
    this.#activeDefinition = null;
    this.#pointerSnapKey = null;
    this.#popupWindow = null;
    this.#quitPromptVisible = false;

    if (this.#htmlFullscreen) {
      this.#htmlFullscreen = false;
      this.#window.setFullScreen(this.#windowWasFullScreenOnOpen);
    }

    if (view !== null) {
      if (viewWasAttached) {
        this.#window.contentView.removeChildView(view);
      }

      if (!view.webContents.isDestroyed()) {
        view.webContents.close();
      }
    }

    this.#onStateChanged(null);
  }

  async closeWithCheckpoint(): Promise<void> {
    await this.#checkpointPlayback();
    this.close();
  }

  async forceReturnHome(): Promise<void> {
    this.#recoveryTarget = null;
    await Promise.race([
      this.#checkpointPlayback(),
      delay(350)
    ]).catch(() => undefined);
    this.close();
  }

  async prepareForSuspend(): Promise<void> {
    await Promise.race([
      this.#checkpointPlayback(),
      delay(750)
    ]).catch(() => undefined);
  }

  async recover(mode: ServiceRecoveryMode): Promise<boolean> {
    const target = this.#recoveryTarget;
    if (mode === "home") {
      this.#recoveryTarget = null;
      this.close();
      return true;
    }
    if (target === null) return false;

    this.#recoveryTarget = null;
    await this.open(
      target.definition,
      mode === "retry" ? target.url : target.definition.startUrl
    );
    return true;
  }

  async resumeAfterSuspend(): Promise<void> {
    const view = this.#view;
    if (view === null || view.webContents.isDestroyed()) return;

    try {
      await Promise.race([
        view.webContents.executeJavaScript("document.readyState", true),
        delay(2_000).then(() => Promise.reject(new Error("resume probe timed out")))
      ]);
    } catch {
      if (this.#view === view) this.#failActiveService("resume-failed");
    }
  }

  async navigate(url: string): Promise<void> {
    const view = this.#view;
    const definition = this.#activeDefinition;

    if (
      view === null ||
      definition === null ||
      view.webContents.isDestroyed() ||
      !isAllowedServiceUrl(url, definition.allowedOrigins)
    ) {
      throw new Error("The active service cannot open that search destination.");
    }

    if (this.#popupWindow !== null && !this.#popupWindow.isDestroyed()) {
      this.#popupWindow.close();
    }

    if (this.#quitPromptVisible) {
      this.cancelQuit();
    }

    await this.#checkpointPlayback();

    try {
      await view.webContents.loadURL(url);
    } catch (error) {
      if (
        !isExpectedAllowedNavigationAbort(
          error,
          view.webContents.getURL(),
          definition.allowedOrigins
        )
      ) {
        throw error;
      }
    }
  }

  cancelQuit(): void {
    const view = this.#view;

    if (!this.#quitPromptVisible || view === null || view.webContents.isDestroyed()) {
      return;
    }

    this.#quitPromptVisible = false;
    this.#window.contentView.addChildView(view);
    this.#resize();
    view.webContents.focus();
    this.#onStateChanged(this.activeServiceId);
  }

  async confirmQuit(): Promise<void> {
    if (this.#quitPromptVisible) {
      await this.closeWithCheckpoint();
    }
  }

  async requestBack(): Promise<boolean> {
    const view = this.#view;
    const definition = this.#activeDefinition;

    if (view === null || definition === null || view.webContents.isDestroyed()) {
      return false;
    }

    if (this.#popupWindow !== null && !this.#popupWindow.isDestroyed()) {
      this.#popupWindow.close();
      return true;
    }

    if (this.#quitPromptVisible) {
      return true;
    }

    if (this.#htmlFullscreen) {
      this.#sendKey("back");
      return true;
    }

    if (isServiceRootUrl(view.webContents.getURL(), definition.rootUrls)) {
      await this.#requestQuit();
      return true;
    }

    await this.#checkpointPlayback();

    const beforeBackUrl = view.webContents.getURL();
    let beforeBack: ServiceBackState | null = null;
    try {
      beforeBack = await view.webContents.executeJavaScript(
        serviceBackStateScript,
        true
      ) as ServiceBackState;
    } catch {
      // A native key fallback still works when the document cannot be sampled.
    }

    this.#sendKey("back");
    await delay(120);

    if (!view.webContents.isDestroyed() && view.webContents.getURL() !== beforeBackUrl) {
      return true;
    }

    if (beforeBack !== null && !view.webContents.isDestroyed()) {
      try {
        const afterBack = await view.webContents.executeJavaScript(
          serviceBackStateScript,
          true
        ) as ServiceBackState;
        if (serviceConsumedBack(beforeBack, afterBack)) {
          return true;
        }
      } catch {
        // Continue to navigation history if the service did not visibly consume Back.
      }
    }

    if (view.webContents.navigationHistory.canGoBack()) {
      view.webContents.navigationHistory.goBack();
      return true;
    }

    try {
      await view.webContents.loadURL(definition.startUrl);
      return true;
    } catch (error) {
      return isExpectedAllowedNavigationAbort(
        error,
        view.webContents.getURL(),
        definition.allowedOrigins
      );
    }
  }

  async sendRemoteAction(action: Exclude<RemoteAction, "home">): Promise<boolean> {
    const view = this.#view;
    const definition = this.#activeDefinition;

    if (view === null || definition === null || view.webContents.isDestroyed()) {
      return false;
    }

    if (action === "back") {
      return this.requestBack();
    }

    if (action === "force-home") {
      await this.forceReturnHome();
      return true;
    }

    if (
      shouldUseDomSpatialNavigation(definition, view.webContents.getURL(), this.#htmlFullscreen) &&
      await this.#runDomSpatialNavigation(action)
    ) {
      return true;
    }

    this.#sendKey(action);
    return true;
  }

  async sendRemotePointer(input: RemotePointerInput): Promise<RemotePointerResult> {
    const view = this.#view;
    const definition = this.#activeDefinition;

    if (
      view === null ||
      definition === null ||
      view.webContents.isDestroyed() ||
      (input.phase !== "hide" && (
        this.#quitPromptVisible ||
        (this.#popupWindow !== null && !this.#popupWindow.isDestroyed())
      ))
    ) {
      return { snapChanged: false, snapped: false, textEntryAvailable: false };
    }

    try {
      this.#window.focus();
      const result = await dispatchPrecisionPointer(
        view.webContents,
        input,
        this.#pointerSnapKey,
        definition.remoteTextEntrySelectors,
        definition.remoteTextEntryTriggerSelectors
      );
      this.#pointerSnapKey = result.snapKey;

      let textEntryAvailable = result.textEntryAvailable;
      if (
        input.phase === "tap" &&
        result.textEntryAvailable &&
        definition.remoteTextEntrySelectors.length > 0
      ) {
        // A launcher can be a valid text-entry trigger before its actual input
        // exists. Do not report readiness until a declared field is visible and
        // has been bound for remote entry.
        textEntryAvailable = false;
        for (const delayMs of REMOTE_TEXT_ENTRY_SETTLE_DELAYS_MS) {
          if (delayMs > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
          }
          if (
            this.#view !== view ||
            view.webContents.isDestroyed() ||
            this.#quitPromptVisible
          ) {
            break;
          }
          const ready = await view.webContents.executeJavaScript(
            buildRemoteTextEntryAvailabilityScript(definition.remoteTextEntrySelectors),
            true
          ) as unknown;
          if (ready === true) {
            textEntryAvailable = true;
            break;
          }
        }
      }

      return {
        snapChanged: result.snapChanged,
        snapped: result.snapped,
        textEntryAvailable
      };
    } catch {
      this.#pointerSnapKey = null;
      return { snapChanged: false, snapped: false, textEntryAvailable: false };
    }
  }

  async sendRemoteText(input: RemoteTextInput): Promise<boolean> {
    const view = this.#view;
    const definition = this.#activeDefinition;

    if (
      view === null ||
      definition === null ||
      definition.remoteTextEntrySelectors.length === 0 ||
      view.webContents.isDestroyed() ||
      this.#quitPromptVisible ||
      (this.#popupWindow !== null && !this.#popupWindow.isDestroyed())
    ) {
      return false;
    }

    try {
      const accepted = await view.webContents.executeJavaScript(
        buildRemoteTextEntryScript(input.text, definition.remoteTextEntrySelectors),
        true
      ) as unknown;
      if (accepted !== true) {
        return false;
      }

      if (input.submit) {
        this.#window.focus();
        view.webContents.focus();
        view.webContents.sendInputEvent({ keyCode: "Enter", type: "keyDown" });
        view.webContents.sendInputEvent({ keyCode: "Enter", type: "keyUp" });
      }
      return true;
    } catch {
      return false;
    }
  }

  async runNetflixSmokeTest(): Promise<NetflixSmokeResult> {
    const view = this.#view;
    const definition = this.#activeDefinition;

    if (
      view === null ||
      definition === null ||
      view.webContents.isDestroyed() ||
      definition.id !== "netflix"
    ) {
      return {
        detail: "Netflix is not open in the service host.",
        status: "inconclusive"
      };
    }

    try {
      await view.webContents.loadURL(NETFLIX_TEST_TITLE_URL);
    } catch (error) {
      if (
        !isExpectedAllowedNavigationAbort(
          error,
          view.webContents.getURL(),
          definition.allowedOrigins
        )
      ) {
        return {
          detail: "The Netflix test title could not be loaded.",
          status: "failed"
        };
      }
    }

    const deadline = Date.now() + NETFLIX_SMOKE_TIMEOUT_MS;
    let clickedPlay = false;
    let lastSnapshot: NetflixSmokeSnapshot | null = null;

    while (Date.now() < deadline && !view.webContents.isDestroyed()) {
      let snapshot: NetflixSmokeSnapshot;

      try {
        snapshot = await view.webContents.executeJavaScript(
          netflixSnapshotScript,
          true
        ) as NetflixSmokeSnapshot;
      } catch {
        await delay(500);
        continue;
      }

      lastSnapshot = snapshot;

      if (snapshot.hasE100 || snapshot.hasPardonInterruption) {
        return {
          detail: "Netflix returned the E100 playback interruption page.",
          status: "failed"
        };
      }

      if (snapshot.isLogin) {
        return {
          detail: "The saved Netflix session requires sign-in.",
          status: "auth-required"
        };
      }

      if (snapshot.isProfileGate) {
        return {
          detail: "Netflix requires a profile selection before playback can be tested.",
          status: "profile-required"
        };
      }

      if (snapshot.isPlaying && snapshot.readyState >= 3 && snapshot.currentTime >= 6) {
        const playback = definition.playback;

        if (playback !== null) {
          try {
            const observation = qualifyPlaybackSnapshot(
              await view.webContents.executeJavaScript(
                buildPlaybackSnapshotScript(playback, definition.name, definition.artworkHosts),
                true
              ) as unknown
            );
            const watchUrl = observation === null
              ? null
              : sanitizePlaybackUrl(observation.url, definition);

            if (
              observation !== null &&
              watchUrl !== null &&
              observation.artworkUrl !== null &&
              isAllowedArtworkUrl(observation.artworkUrl, definition.artworkHosts)
            ) {
              return {
                detail: "Netflix test video qualified for passive Continue Watching with allowlisted artwork.",
                status: "passed"
              };
            }
          } catch {
            // Keep sampling until the observer can read a stable player document.
          }
        }
      }

      if (!clickedPlay && snapshot.hasPlayControl) {
        clickedPlay = await view.webContents.executeJavaScript(
          netflixClickPlayScript,
          true
        ) as boolean;
      }

      await delay(1_000);
    }

    if (lastSnapshot?.errorCode !== null && lastSnapshot?.errorCode !== undefined) {
      return {
        detail: `The video element reported media error ${lastSnapshot.errorCode}.`,
        status: "failed"
      };
    }

    return {
      detail: "Playback did not start before the smoke-test timeout.",
      status: "inconclusive"
    };
  }

  async runYouTubeAuthSmokeTest(): Promise<YouTubeAuthSmokeResult> {
    const view = this.#view;

    if (view === null || view.webContents.isDestroyed() || this.activeServiceId !== "youtube") {
      return {
        detail: "YouTube is not open in the service host.",
        status: "inconclusive"
      };
    }

    const deadline = Date.now() + YOUTUBE_AUTH_SMOKE_TIMEOUT_MS;
    let clickedSignIn = false;
    let lastOrigin = "unavailable";
    let sawAccountControl = false;

    while (Date.now() < deadline && !view.webContents.isDestroyed()) {
      try {
        const popupOrigin = this.#popupWindow === null || this.#popupWindow.isDestroyed()
          ? null
          : new URL(this.#popupWindow.webContents.getURL()).origin;

        if (popupOrigin === "https://accounts.google.com") {
          return {
            detail: "YouTube Sign in opened Google Accounts in a controlled NHD-TV window.",
            status: "passed"
          };
        }

        const currentOrigin = new URL(view.webContents.getURL()).origin;
        lastOrigin = currentOrigin;

        if (currentOrigin === "https://accounts.google.com") {
          return {
            detail: "YouTube Sign in opened Google Accounts inside the isolated service session.",
            status: "passed"
          };
        }

        const snapshot = await view.webContents.executeJavaScript(
          youtubeSignInSnapshotScript,
          true
        ) as { hasAccount: boolean; hasSignIn: boolean; isGoogleAccounts: boolean };

        sawAccountControl ||= snapshot.hasAccount;

        if (snapshot.isGoogleAccounts) {
          return {
            detail: "YouTube Sign in opened Google Accounts inside the isolated service session.",
            status: "passed"
          };
        }

        if (!clickedSignIn && snapshot.hasSignIn) {
          clickedSignIn = await view.webContents.executeJavaScript(
            youtubeClickSignInScript,
            true
          ) as boolean;
        }
      } catch {
        // Cross-document navigation can invalidate a snapshot while the allowed
        // authentication page replaces YouTube in the same service view.
      }

      await delay(500);
    }

    if (!clickedSignIn) {
      return {
        detail: sawAccountControl
          ? "The saved YouTube session already exposes its account control."
          : "No visible YouTube Sign in or account control appeared before timeout.",
        status: sawAccountControl ? "already-signed-in" : "inconclusive"
      };
    }

    return {
      detail: this.#lastBlockedNavigation === null
        ? `The YouTube Sign in control remained on ${lastOrigin}.`
        : `The YouTube Sign in flow was blocked at ${this.#lastBlockedNavigation.origin}.`,
      status: "failed"
    };
  }

  async #requestQuit(): Promise<void> {
    const view = this.#view;
    const definition = this.#activeDefinition;

    if (
      this.#quitPromptVisible ||
      view === null ||
      definition === null ||
      view.webContents.isDestroyed()
    ) {
      return;
    }

    this.#quitPromptVisible = true;
    let backgroundDataUrl: string | null = null;
    try {
      const capture = await view.webContents.capturePage();
      const size = capture.getSize();
      const preview = size.width > 1_920
        ? capture.resize({ quality: "good", width: 1_920 })
        : capture;
      backgroundDataUrl = preview.toDataURL();
    } catch {
      // The prompt remains usable if a protected surface cannot be captured.
    }

    if (!this.#quitPromptVisible || this.#view !== view) {
      return;
    }

    this.#window.contentView.removeChildView(view);
    this.#window.webContents.focus();
    this.#onQuitRequested({
      backgroundDataUrl,
      serviceId: definition.id,
      serviceName: definition.name
    });
    this.#onStateChanged(definition.id);
  }

  async #runDomSpatialNavigation(action: ServiceSpatialAction): Promise<boolean> {
    const view = this.#view;

    if (view === null || view.webContents.isDestroyed()) {
      return false;
    }

    try {
      const result = await view.webContents.executeJavaScript(
        serviceSpatialNavigationScript(action),
        true
      );
      return result === true;
    } catch {
      return false;
    }
  }

  async #checkpointPlayback(): Promise<void> {
    if (this.#playbackCheckpoint !== null) {
      return this.#playbackCheckpoint;
    }

    const view = this.#view;
    const definition = this.#activeDefinition;
    const playback = definition?.playback ?? null;
    if (
      view === null ||
      definition === null ||
      playback === null
    ) {
      return;
    }

    const webContents = view.webContents;
    if (webContents === undefined || webContents.isDestroyed()) {
      return;
    }

    this.#playbackCheckpoint = (async () => {
      try {
        const rawSnapshot = await webContents.executeJavaScript(
          buildPlaybackSnapshotScript(playback, definition.name, definition.artworkHosts),
          true
        ) as unknown;
        const snapshot = qualifyPlaybackSnapshot(rawSnapshot);
        if (snapshot === null || this.#view !== view) {
          return;
        }

        const watchUrl = sanitizePlaybackUrl(snapshot.url, definition);
        if (
          watchUrl === null ||
          !Number.isFinite(snapshot.currentTime) ||
          !Number.isFinite(snapshot.duration)
        ) {
          return;
        }

        await this.#onPlayback({
          artworkUrl: typeof snapshot.artworkUrl === "string" ? snapshot.artworkUrl : null,
          durationSeconds: snapshot.duration,
          ended: snapshot.ended === true,
          positionSeconds: snapshot.currentTime,
          serviceId: definition.id,
          serviceName: definition.name,
          subtitle: snapshot.subtitle,
          title: typeof snapshot.title === "string" ? snapshot.title : definition.name,
          watchUrl
        });
      } catch {
        // A page navigation can replace the document during a passive snapshot.
      }
    })().finally(() => {
      this.#playbackCheckpoint = null;
    });

    return this.#playbackCheckpoint;
  }

  #failActiveService(kind: ServiceFailureKind): void {
    const view = this.#view;
    const definition = this.#activeDefinition;
    if (view === null || definition === null) return;

    const currentUrl = view.webContents.isDestroyed()
      ? definition.startUrl
      : view.webContents.getURL();
    this.#recoveryTarget = {
      definition,
      url: isAllowedServiceUrl(currentUrl, definition.allowedOrigins)
        ? currentUrl
        : definition.startUrl
    };
    this.close();
    this.#onRecoveryRequested(serviceRecoveryRequest(kind, definition.id, definition.name));
  }

  #sendKey(action: Exclude<RemoteAction, "force-home" | "home">): void {
    const view = this.#view;

    if (view === null || view.webContents.isDestroyed()) {
      return;
    }

    const keyCode: Record<Exclude<RemoteAction, "force-home" | "home">, string> = {
      back: "Escape",
      down: "Down",
      left: "Left",
      right: "Right",
      select: "Enter",
      up: "Up"
    };

    this.#window.focus();
    view.webContents.focus();
    this.#replayingInput = true;

    try {
      view.webContents.sendInputEvent({ keyCode: keyCode[action], type: "keyDown" });
      view.webContents.sendInputEvent({ keyCode: keyCode[action], type: "keyUp" });
    } finally {
      this.#replayingInput = false;
    }
  }

  #resize(): void {
    if (this.#view === null) {
      return;
    }

    const size = this.#window.getContentSize();
    const width = size[0] ?? 0;
    const height = size[1] ?? 0;
    this.#view.setBounds({ height, width, x: 0, y: 0 });
  }

  #recordBlockedNavigation(
    kind: NavigationDiagnostic["kind"],
    url: string,
    definition: ServiceDefinition
  ): void {
    this.#lastBlockedNavigation = {
      kind,
      origin: originForDiagnostics(url),
      serviceId: definition.id
    };
    this.#onStateChanged(this.activeServiceId);
  }
}
