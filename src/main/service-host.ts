import {
  BrowserWindow,
  session,
  type Session,
  WebContentsView
} from "electron";
import {
  isAllowedServiceUrl,
  isExpectedAllowedNavigationAbort,
  type ServiceDefinition
} from "./security/navigation-policy";

export type ServiceStateListener = (activeServiceId: string | null) => void;

const configuredSessions = new WeakSet<Session>();

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

  async open(definition: ServiceDefinition): Promise<void> {
    this.close();
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
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

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
      }
    });

    view.webContents.on("leave-html-full-screen", () => {
      if (this.#view === view) {
        this.#htmlFullscreen = false;
        this.#window.setFullScreen(this.#windowWasFullScreenOnOpen);
      }
    });

    view.webContents.on("will-navigate", (event, url) => {
      if (!isAllowedServiceUrl(url, definition.allowedOrigins)) {
        event.preventDefault();
      }
    });

    view.webContents.on("will-redirect", (event, url) => {
      if (!isAllowedServiceUrl(url, definition.allowedOrigins)) {
        event.preventDefault();
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

  #resize(): void {
    if (this.#view === null) {
      return;
    }

    const size = this.#window.getContentSize();
    const width = size[0] ?? 0;
    const height = size[1] ?? 0;
    this.#view.setBounds({ height, width, x: 0, y: 0 });
  }
}
