import {
  BrowserWindow,
  session,
  type Session,
  WebContentsView
} from "electron";
import {
  isAllowedServiceUrl,
  isExpectedAllowedNavigationAbort,
  isServiceRootUrl,
  originForDiagnostics,
  sanitizePlaybackUrl,
  type ServiceDefinition
} from "./security/navigation-policy";
import type { NavigationDiagnostic, RemoteAction } from "./contracts";

export type ServiceStateListener = (activeServiceId: string | null) => void;
export type ServiceQuitListener = (request: {
  serviceId: string;
  serviceName: string;
}) => void;
export interface PlaybackObservation {
  artworkUrl: string | null;
  durationSeconds: number;
  ended: boolean;
  positionSeconds: number;
  serviceId: string;
  serviceName: string;
  title: string;
  watchUrl: string;
}
export type PlaybackListener = (observation: PlaybackObservation) => void | Promise<void>;

type ServiceSpatialAction = Exclude<RemoteAction, "back" | "home">;

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
const SERVICE_FOCUS_STYLE = `
  [data-nhd-tv-focus="true"] {
    outline: 4px solid #63e6ff !important;
    outline-offset: 5px !important;
    box-shadow: 0 0 0 2px rgb(2 8 23 / 88%), 0 0 28px rgb(34 211 238 / 82%) !important;
    border-radius: 8px !important;
    transform: scale(1.025) !important;
    transition: outline-color 140ms ease, box-shadow 140ms ease, transform 140ms ease !important;
  }
`;

interface PlaybackSnapshot {
  artworkUrl: string | null;
  currentTime: number;
  duration: number;
  ended: boolean;
  title: string;
  url: string;
}

const playbackSnapshotScript = `(() => {
  const videos = [...document.querySelectorAll("video")]
    .filter((video) => Number.isFinite(video.duration) && video.duration >= 60)
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
    });
  const video = videos[0];
  if (!(video instanceof HTMLVideoElement) || video.currentTime < 5) return null;

  const titleCandidates = [
    document.querySelector('[data-uia="video-title"]')?.textContent,
    document.querySelector('h1.ytd-watch-metadata')?.textContent,
    document.querySelector('meta[property="og:title"]')?.getAttribute("content"),
    document.title
  ];
  const title = titleCandidates
    .find((candidate) => typeof candidate === "string" && candidate.trim().length > 0)
    ?.replace(/\\s+/g, " ").trim() ?? "";
  const artworkCandidates = [
    document.querySelector('meta[property="og:image"]')?.getAttribute("content"),
    video.poster
  ];
  const artworkUrl = artworkCandidates.find((candidate) => {
    if (typeof candidate !== "string" || candidate.length === 0) return false;
    try { return new URL(candidate, location.href).protocol === "https:"; } catch { return false; }
  });

  return {
    artworkUrl: artworkUrl ? new URL(artworkUrl, location.href).toString() : null,
    currentTime: video.currentTime,
    duration: video.duration,
    ended: video.ended,
    title,
    url: location.href
  };
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
    if (document.fullscreenElement !== null) return false;

    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))
    ) {
      return false;
    }

    const selectors = [
      'a[href]',
      'button',
      '[role="button"]',
      '[role="link"]',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');
    const candidates = [...document.querySelectorAll(selectors)].filter((element) => {
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
    }).filter((element, index, all) => !all.some((other, otherIndex) =>
      otherIndex < index && other.contains(element) && other.getBoundingClientRect().width === element.getBoundingClientRect().width
    ));

    if (candidates.length === 0) return false;

    let current = candidates.includes(active)
      ? active
      : candidates.find((candidate) => candidate.dataset.nhdTvFocus === 'true');

    const applyFocus = (element) => {
      document.querySelectorAll('[data-nhd-tv-focus="true"]').forEach((focused) => {
        focused.removeAttribute('data-nhd-tv-focus');
      });
      element.dataset.nhdTvFocus = 'true';
      element.focus({ preventScroll: true });
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    };

    if (!(current instanceof HTMLElement)) {
      current = candidates.sort((left, right) => {
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
    const currentX = currentRect.left + currentRect.width / 2;
    const currentY = currentRect.top + currentRect.height / 2;
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      if (candidate === current) continue;
      const rect = candidate.getBoundingClientRect();
      const deltaX = rect.left + rect.width / 2 - currentX;
      const deltaY = rect.top + rect.height / 2 - currentY;
      const horizontal = action === 'left' || action === 'right';
      const directional =
        (action === 'left' && deltaX < -8) ||
        (action === 'right' && deltaX > 8) ||
        (action === 'up' && deltaY < -8) ||
        (action === 'down' && deltaY > 8);
      if (!directional) continue;

      if (horizontal) {
        const overlap = Math.min(currentRect.bottom, rect.bottom) - Math.max(currentRect.top, rect.top);
        const requiredOverlap = Math.min(currentRect.height, rect.height) * 0.3;
        if (overlap < requiredOverlap) continue;
      }

      const primary = horizontal ? Math.abs(deltaX) : Math.abs(deltaY);
      const cross = horizontal ? Math.abs(deltaY) : Math.abs(deltaX);
      const score = primary * 3 + cross;
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

  serviceSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || webContents.getURL();
    const allowMediaKeySystem =
      permission === "mediaKeySystem" &&
      isAllowedServiceUrl(requestingUrl, definition.mediaKeySystemOrigins);

    callback(allowMediaKeySystem);
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
  readonly #onPlayback: PlaybackListener;
  #activeDefinition: ServiceDefinition | null = null;
  #htmlFullscreen = false;
  #lastBlockedNavigation: NavigationDiagnostic | null = null;
  #popupWindow: BrowserWindow | null = null;
  #quitPromptVisible = false;
  #replayingInput = false;
  #playbackCheckpoint: Promise<void> | null = null;
  #playbackTimer: NodeJS.Timeout | null = null;
  #view: WebContentsView | null = null;
  #windowWasFullScreenOnOpen = false;

  constructor(
    window: BrowserWindow,
    onStateChanged: ServiceStateListener,
    onQuitRequested: ServiceQuitListener,
    onPlayback: PlaybackListener = () => undefined
  ) {
    this.#window = window;
    this.#onStateChanged = onStateChanged;
    this.#onQuitRequested = onQuitRequested;
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

  get lastBlockedNavigation(): NavigationDiagnostic | null {
    return this.#lastBlockedNavigation;
  }

  async open(definition: ServiceDefinition, initialUrl = definition.startUrl): Promise<void> {
    if (!isAllowedServiceUrl(initialUrl, definition.allowedOrigins)) {
      throw new Error(`Initial service URL is outside the ${definition.name} boundary.`);
    }

    await this.closeWithCheckpoint();
    this.#lastBlockedNavigation = null;
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
      if (input.type !== "keyDown" || this.#replayingInput) {
        return;
      }

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
      if (this.#view === view && definition.spatialNavigation === "dom") {
        void view.webContents.insertCSS(SERVICE_FOCUS_STYLE).catch(() => undefined);
      }

      if (this.#view === view) {
        void this.#checkpointPlayback();
      }
    });

    view.webContents.on("did-navigate-in-page", () => {
      if (this.#view === view) {
        void this.#checkpointPlayback();
      }
    });

    view.webContents.on("media-paused", () => {
      if (this.#view === view) {
        void this.#checkpointPlayback();
      }
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

    view.webContents.on("render-process-gone", () => {
      if (this.#view === view) {
        this.close();
      }
    });

    this.#view = view;
    this.#activeDefinition = definition;
    this.#window.contentView.addChildView(view);
    this.#resize();
    this.#onStateChanged(definition.id);
    this.#playbackTimer = setInterval(() => {
      void this.#checkpointPlayback();
    }, PLAYBACK_CHECKPOINT_INTERVAL_MS);

    try {
      await view.webContents.loadURL(initialUrl);
    } catch (error) {
      if (
        isExpectedAllowedNavigationAbort(
          error,
          view.webContents.getURL(),
          definition.allowedOrigins
        )
      ) {
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

    if (this.#popupWindow !== null && !this.#popupWindow.isDestroyed()) {
      this.#popupWindow.close();
    }

    this.#view = null;
    this.#activeDefinition = null;
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
      this.#requestQuit();
      return true;
    }

    await this.#checkpointPlayback();

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

    if (
      shouldUseDomSpatialNavigation(definition, view.webContents.getURL(), this.#htmlFullscreen) &&
      await this.#runDomSpatialNavigation(action)
    ) {
      return true;
    }

    this.#sendKey(action);
    return true;
  }

  async runNetflixSmokeTest(): Promise<NetflixSmokeResult> {
    const view = this.#view;

    if (view === null || view.webContents.isDestroyed() || this.activeServiceId !== "netflix") {
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
          this.#activeDefinition?.allowedOrigins ?? []
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

      if (snapshot.isPlaying && snapshot.readyState >= 3 && snapshot.currentTime >= 2) {
        return {
          detail: "Netflix test video decoded and advanced beyond two seconds.",
          status: "passed"
        };
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

  #requestQuit(): void {
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
    this.#window.contentView.removeChildView(view);
    this.#window.webContents.focus();
    this.#onQuitRequested({
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
    if (
      view === null ||
      definition === null ||
      definition.playback === null
    ) {
      return;
    }

    const webContents = view.webContents;
    if (webContents === undefined || webContents.isDestroyed()) {
      return;
    }

    this.#playbackCheckpoint = (async () => {
      try {
        const snapshot = await webContents.executeJavaScript(
          playbackSnapshotScript,
          true
        ) as PlaybackSnapshot | null;
        if (snapshot === null || this.#view !== view) {
          return;
        }

        const watchUrl = sanitizePlaybackUrl(snapshot.url, definition);
        if (
          watchUrl === null ||
          !Number.isFinite(snapshot.currentTime) ||
          !Number.isFinite(snapshot.duration) ||
          snapshot.currentTime < 5 ||
          snapshot.duration < 60
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

  #sendKey(action: Exclude<RemoteAction, "home">): void {
    const view = this.#view;

    if (view === null || view.webContents.isDestroyed()) {
      return;
    }

    const keyCode: Record<Exclude<RemoteAction, "home">, string> = {
      back: "Escape",
      down: "Down",
      left: "Left",
      right: "Right",
      select: "Enter",
      up: "Up"
    };

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
