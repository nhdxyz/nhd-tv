import {
  BrowserWindow,
  session,
  type Session,
  WebContentsView
} from "electron";
import {
  isAllowedServiceUrl,
  isExpectedAllowedNavigationAbort,
  originForDiagnostics,
  type ServiceDefinition
} from "./security/navigation-policy";
import type { NavigationDiagnostic, RemoteAction } from "./contracts";

export type ServiceStateListener = (activeServiceId: string | null) => void;

export interface NetflixSmokeResult {
  detail: string;
  status: "auth-required" | "failed" | "inconclusive" | "passed" | "profile-required";
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
  #activeDefinition: ServiceDefinition | null = null;
  #htmlFullscreen = false;
  #lastBlockedNavigation: NavigationDiagnostic | null = null;
  #view: WebContentsView | null = null;
  #windowWasFullScreenOnOpen = false;

  constructor(window: BrowserWindow, onStateChanged: ServiceStateListener) {
    this.#window = window;
    this.#onStateChanged = onStateChanged;
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

  get lastBlockedNavigation(): NavigationDiagnostic | null {
    return this.#lastBlockedNavigation;
  }

  async open(definition: ServiceDefinition): Promise<void> {
    this.close();
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
      this.#recordBlockedNavigation("popup", url, definition);
      return { action: "deny" };
    });

    // Temporary feasibility-spike escape path. Issue #4 replaces this with the
    // service-aware nested Back stack and root-level quit confirmation.
    view.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.key === "Escape") {
        if (this.#htmlFullscreen) {
          return;
        }

        event.preventDefault();
        this.close();
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

    try {
      await view.webContents.loadURL(definition.startUrl);
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

    this.#view = null;
    this.#activeDefinition = null;

    if (this.#htmlFullscreen) {
      this.#htmlFullscreen = false;
      this.#window.setFullScreen(this.#windowWasFullScreenOnOpen);
    }

    if (view !== null) {
      this.#window.contentView.removeChildView(view);

      if (!view.webContents.isDestroyed()) {
        view.webContents.close();
      }
    }

    this.#onStateChanged(null);
  }

  sendRemoteAction(action: Exclude<RemoteAction, "home">): boolean {
    const view = this.#view;

    if (view === null || view.webContents.isDestroyed()) {
      return false;
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
    view.webContents.sendInputEvent({ keyCode: keyCode[action], type: "keyDown" });
    view.webContents.sendInputEvent({ keyCode: keyCode[action], type: "keyUp" });
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
