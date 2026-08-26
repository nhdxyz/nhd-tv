import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  components,
  ipcMain,
  nativeImage,
  net,
  protocol,
  session
} from "electron";
import {
  IPC_CHANNELS,
  type HostStatus,
  type ContinueWatchingItem,
  type ProcessDiagnostics,
  type RemoteAction,
  type RemoteStatus,
  type WidevineState
} from "./contracts";
import { ContinueWatchingStore } from "./continue-watching-store";
import { PhoneRemoteServer } from "./remote/phone-remote-server";
import { getServiceDefinition, getServiceSummaries } from "./service-registry";
import { ServiceHost, type PlaybackObservation } from "./service-host";
import { isTrustedShellUrl } from "./security/sender-policy";
import {
  buildServiceSearchUrl,
  isAllowedArtworkUrl,
  normalizeSearchQuery,
  sanitizePlaybackUrl
} from "./security/navigation-policy";

const SHELL_HOST = "shell";
const WIDEVINE_TIMEOUT_MS = 30_000;
const MAX_ARTWORK_BYTES = 5 * 1024 * 1024;

protocol.registerSchemesAsPrivileged([
  {
    privileges: {
      codeCache: true,
      secure: true,
      standard: true,
      supportFetchAPI: true
    },
    scheme: "app"
  }
]);

app.enableSandbox();

let mainWindow: BrowserWindow | null = null;
let continueWatchingStore: ContinueWatchingStore | null = null;
let phoneRemote: PhoneRemoteServer | null = null;
let serviceHost: ServiceHost | null = null;
let gpuInfoReady = false;
let widevineState: WidevineState = "checking";
let widevineDetails = "Waiting for the Widevine component updater.";
const artworkRequests = new Set<string>();

type AppMetric = ReturnType<typeof app.getAppMetrics>[number];

function processDiagnostics(metric: AppMetric | undefined): ProcessDiagnostics | null {
  if (metric === undefined) {
    return null;
  }

  return {
    cpuPercent: Math.round(metric.cpu.percentCPUUsage * 10) / 10,
    memoryMegabytes: Math.round((metric.memory.workingSetSize / 1024) * 10) / 10,
    sandboxed: metric.sandboxed ?? null
  };
}

function runtimeDiagnostics(): HostStatus["diagnostics"] {
  const metrics = app.getAppMetrics();
  const serviceProcessId = serviceHost?.activeProcessId ?? null;
  const gpuFeatures: Partial<ReturnType<typeof app.getGPUFeatureStatus>> =
    gpuInfoReady ? app.getGPUFeatureStatus() : {};

  return {
    gpuProcess: processDiagnostics(metrics.find((metric) => metric.type === "GPU")),
    hardwareAcceleration: gpuInfoReady ? app.isHardwareAccelerationEnabled() : null,
    serviceRenderer: processDiagnostics(
      serviceProcessId === null
        ? undefined
        : metrics.find((metric) => metric.pid === serviceProcessId)
    ),
    videoDecode: gpuFeatures.video_decode ?? "checking",
    vpxDecode: gpuFeatures.vpx_decode ?? "checking"
  };
}

function hostStatus(): HostStatus {
  return {
    activeServiceId: serviceHost?.activeServiceId ?? null,
    diagnostics: runtimeDiagnostics(),
    fullscreen: {
      serviceHtml: serviceHost?.isHtmlFullscreen ?? false,
      window: mainWindow?.isFullScreen() ?? false
    },
    navigation: {
      lastBlocked: serviceHost?.lastBlockedNavigation ?? null
    },
    runtime: {
      chrome: process.versions.chrome ?? "unknown",
      electron: process.versions.electron ?? "unknown",
      node: process.versions.node
    },
    widevine: {
      details: widevineDetails,
      state: widevineState
    }
  };
}

function publishHostStatus(): void {
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.hostStatusChanged, hostStatus());
  }
}

function inactiveRemoteStatus(): RemoteStatus {
  return {
    connectedControllers: 0,
    detail: "Start pairing to create a short-lived local QR code.",
    expiresAt: null,
    networkAddress: null,
    qrDataUrl: null,
    state: "inactive"
  };
}

function publishRemoteStatus(status: RemoteStatus): void {
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.remoteStatusChanged, status);
  }
}

function publishContinueWatching(): void {
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(
      IPC_CHANNELS.continueWatchingChanged,
      continueWatchingStore?.list() ?? []
    );
  }
}

async function cacheArtwork(
  item: ContinueWatchingItem,
  artworkUrl: string,
  serviceId: string
): Promise<void> {
  const definition = getServiceDefinition(serviceId);
  const store = continueWatchingStore;
  if (
    definition === null ||
    store === null ||
    item.artworkDataUrl !== null ||
    artworkRequests.has(item.id) ||
    !isAllowedArtworkUrl(artworkUrl, definition.artworkHosts)
  ) {
    return;
  }

  artworkRequests.add(item.id);

  try {
    const serviceSession = session.fromPartition(definition.partition, { cache: true });
    const response = await serviceSession.fetch(artworkUrl, { redirect: "follow" });
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    const contentType = response.headers.get("content-type") ?? "";

    if (
      !response.ok ||
      !contentType.toLowerCase().startsWith("image/") ||
      contentLength > MAX_ARTWORK_BYTES ||
      !isAllowedArtworkUrl(response.url, definition.artworkHosts)
    ) {
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_ARTWORK_BYTES) {
      return;
    }

    const source = nativeImage.createFromBuffer(buffer);
    if (source.isEmpty()) {
      return;
    }

    const size = source.getSize();
    const resized = size.width > 640
      ? source.resize({ quality: "good", width: 640 })
      : source;
    const artworkDataUrl = `data:image/jpeg;base64,${resized.toJPEG(78).toString("base64")}`;

    if (await store.updateArtwork(item.id, artworkDataUrl)) {
      publishContinueWatching();
    }
  } catch {
    // Artwork is optional. Playback progress remains useful if a provider
    // rejects, redirects, or removes an image.
  } finally {
    artworkRequests.delete(item.id);
  }
}

async function handlePlaybackObservation(observation: PlaybackObservation): Promise<void> {
  if (
    continueWatchingStore === null ||
    process.argv.includes("--netflix-smoke-test") ||
    process.argv.includes("--youtube-auth-smoke-test")
  ) {
    return;
  }

  const item = await continueWatchingStore.upsert(observation);
  publishContinueWatching();

  if (item !== null && observation.artworkUrl !== null) {
    void cacheArtwork(item, observation.artworkUrl, observation.serviceId);
  }
}

async function handleRemoteSearch(query: string): Promise<void> {
  const normalizedQuery = normalizeSearchQuery(query);
  if (normalizedQuery === null) {
    return;
  }

  await serviceHost?.closeWithCheckpoint();

  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.remoteSearchRequested, normalizedQuery);
  }
}

function handleRemoteAction(action: RemoteAction): void {
  if (serviceHost?.activeServiceId !== null && serviceHost !== null) {
    if (serviceHost.isQuitPromptVisible) {
      if (mainWindow !== null && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.remoteAction, action);
      }
      return;
    }

    if (action === "home") {
      void serviceHost.closeWithCheckpoint();
      return;
    }

    void serviceHost.sendRemoteAction(action);
    return;
  }

  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.remoteAction, action);
  }
}

function registerShellProtocol(): void {
  const rendererRoot = path.resolve(__dirname, "../renderer");

  protocol.handle("app", (request) => {
    const url = new URL(request.url);

    if (url.hostname !== SHELL_HOST) {
      return new Response("Unknown application host", { status: 404 });
    }

    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const candidate = path.resolve(rendererRoot, relativePath);
    const isInsideRendererRoot =
      candidate === rendererRoot || candidate.startsWith(`${rendererRoot}${path.sep}`);

    if (!isInsideRendererRoot) {
      return new Response("Invalid application path", { status: 400 });
    }

    return net.fetch(pathToFileURL(candidate).toString());
  });
}

function configureShellSession(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

function validateShellSender(senderUrl: string): void {
  if (!isTrustedShellUrl(senderUrl)) {
    throw new Error("Rejected IPC from an untrusted renderer");
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.getContinueWatching, (event) => {
    validateShellSender(event.senderFrame?.url ?? "");
    return continueWatchingStore?.list() ?? [];
  });

  ipcMain.handle(IPC_CHANNELS.getServices, (event) => {
    validateShellSender(event.senderFrame?.url ?? "");
    return getServiceSummaries();
  });

  ipcMain.handle(IPC_CHANNELS.getHostStatus, (event) => {
    validateShellSender(event.senderFrame?.url ?? "");
    return hostStatus();
  });

  ipcMain.handle(IPC_CHANNELS.getRemoteStatus, (event) => {
    validateShellSender(event.senderFrame?.url ?? "");
    return phoneRemote?.status ?? inactiveRemoteStatus();
  });

  ipcMain.handle(IPC_CHANNELS.startRemotePairing, async (event) => {
    validateShellSender(event.senderFrame?.url ?? "");

    if (phoneRemote === null) {
      throw new Error("The phone remote is not ready yet.");
    }

    return phoneRemote.startPairing();
  });

  ipcMain.handle(IPC_CHANNELS.approveRemotePairing, (event) => {
    validateShellSender(event.senderFrame?.url ?? "");

    if (phoneRemote === null) {
      throw new Error("The phone remote is not ready yet.");
    }

    return phoneRemote.approvePending();
  });

  ipcMain.handle(IPC_CHANNELS.denyRemotePairing, (event) => {
    validateShellSender(event.senderFrame?.url ?? "");

    if (phoneRemote === null) {
      throw new Error("The phone remote is not ready yet.");
    }

    return phoneRemote.denyPending();
  });

  ipcMain.handle(IPC_CHANNELS.openService, async (event, serviceId: unknown) => {
    validateShellSender(event.senderFrame?.url ?? "");

    if (typeof serviceId !== "string") {
      throw new TypeError("Service id must be a string");
    }

    const definition = getServiceDefinition(serviceId);

    if (definition === null || serviceHost === null) {
      throw new Error(`Unknown service: ${serviceId}`);
    }

    await serviceHost.open(definition);
  });

  ipcMain.handle(
    IPC_CHANNELS.searchService,
    async (event, serviceId: unknown, query: unknown) => {
      validateShellSender(event.senderFrame?.url ?? "");

      if (typeof serviceId !== "string" || serviceHost === null) {
        throw new TypeError("A known service id is required for search.");
      }

      const definition = getServiceDefinition(serviceId);
      if (definition === null) {
        throw new Error(`Unknown service: ${serviceId}`);
      }

      const searchUrl = buildServiceSearchUrl(definition, query);
      if (searchUrl === null) {
        throw new Error(`${definition.name} does not support this search.`);
      }

      await serviceHost.open(definition, searchUrl);
    }
  );

  ipcMain.handle(IPC_CHANNELS.resumeContinueWatching, async (event, itemId: unknown) => {
    validateShellSender(event.senderFrame?.url ?? "");

    const target = continueWatchingStore?.resumeTarget(itemId) ?? null;
    const definition = target === null ? null : getServiceDefinition(target.serviceId);
    const watchUrl = target === null || definition === null
      ? null
      : sanitizePlaybackUrl(target.watchUrl, definition);

    if (definition === null || watchUrl === null || serviceHost === null) {
      throw new Error("That Continue Watching item is no longer available.");
    }

    await serviceHost.open(definition, watchUrl);
  });

  ipcMain.handle(IPC_CHANNELS.closeService, async (event) => {
    validateShellSender(event.senderFrame?.url ?? "");
    await serviceHost?.closeWithCheckpoint();
  });

  ipcMain.handle(IPC_CHANNELS.cancelServiceQuit, (event) => {
    validateShellSender(event.senderFrame?.url ?? "");
    serviceHost?.cancelQuit();
  });

  ipcMain.handle(IPC_CHANNELS.confirmServiceQuit, async (event) => {
    validateShellSender(event.senderFrame?.url ?? "");
    await serviceHost?.confirmQuit();
  });
}

async function initializeWidevine(): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      components.whenReady(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Widevine initialization timed out")), WIDEVINE_TIMEOUT_MS);
      })
    ]);

    widevineState = "ready";
    widevineDetails = JSON.stringify(components.status());
  } catch (error) {
    widevineState = error instanceof Error && error.message.includes("timed out")
      ? "timed-out"
      : "unavailable";
    widevineDetails = error instanceof Error ? error.message : String(error);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }

    publishHostStatus();
  }
}

async function createMainWindow(): Promise<void> {
  let windowCloseCheckpointed = false;

  mainWindow = new BrowserWindow({
    backgroundColor: "#05070d",
    height: 720,
    minHeight: 540,
    minWidth: 960,
    show: false,
    title: "NHD-TV Feasibility Host",
    width: 1280,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "shell-preload.js"),
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedShellUrl(url)) {
      event.preventDefault();
    }
  });

  serviceHost = new ServiceHost(
    mainWindow,
    publishHostStatus,
    (request) => {
      if (mainWindow !== null && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.serviceQuitRequested, request);
      }
    },
    handlePlaybackObservation
  );
  phoneRemote = new PhoneRemoteServer({
    onAction: handleRemoteAction,
    onSearch: handleRemoteSearch,
    onStatusChanged: publishRemoteStatus
  });

  mainWindow.on("close", (event) => {
    if (
      windowCloseCheckpointed ||
      serviceHost === null ||
      serviceHost.activeServiceId === null
    ) {
      return;
    }

    event.preventDefault();
    windowCloseCheckpointed = true;
    const windowToClose = mainWindow;
    void serviceHost.closeWithCheckpoint().finally(() => {
      if (windowToClose !== null && !windowToClose.isDestroyed()) {
        windowToClose.close();
      }
    });
  });

  mainWindow.on("closed", () => {
    const remoteToStop = phoneRemote;

    phoneRemote = null;
    serviceHost = null;
    mainWindow = null;
    void remoteToStop?.stop();
  });

  await mainWindow.loadURL("app://shell/index.html");
  mainWindow.show();

  if (process.argv.includes("--devtools")) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(async () => {
  registerShellProtocol();
  configureShellSession();
  continueWatchingStore = new ContinueWatchingStore(
    path.join(app.getPath("userData"), "continue-watching.json")
  );
  await continueWatchingStore.initialize();
  registerIpc();

  // ECS requires Widevine component initialization to finish before any
  // BrowserWindow or service session is created. Creating the host first can
  // leave commercial services with an unusable media-key-system context even
  // after the component updater later reports ready.
  await initializeWidevine();
  await createMainWindow();
  publishHostStatus();

  if (process.argv.includes("--netflix-smoke-test")) {
    const netflix = getServiceDefinition("netflix");

    if (netflix === null || serviceHost === null) {
      console.log(JSON.stringify({
        detail: "Netflix is not registered in the service host.",
        status: "inconclusive"
      }));
      app.exit(2);
      return;
    }

    try {
      await serviceHost.open(netflix);
      const result = await serviceHost.runNetflixSmokeTest();
      console.log(`[netflix-smoke] ${JSON.stringify(result)}`);
      app.exit(result.status === "passed" ? 0 : 2);
    } catch {
      console.log(`[netflix-smoke] ${JSON.stringify({
        detail: "The playback check failed unexpectedly.",
        status: "failed"
      })}`);
      app.exit(2);
    }
  }

  if (process.argv.includes("--youtube-auth-smoke-test")) {
    const youtube = getServiceDefinition("youtube");

    if (youtube === null || serviceHost === null) {
      console.log(`[youtube-auth-smoke] ${JSON.stringify({
        detail: "YouTube is not registered in the service host.",
        status: "inconclusive"
      })}`);
      app.exit(2);
      return;
    }

    try {
      await serviceHost.open(youtube);
      const result = await serviceHost.runYouTubeAuthSmokeTest();
      console.log(`[youtube-auth-smoke] ${JSON.stringify(result)}`);
      app.exit(result.status === "passed" || result.status === "already-signed-in" ? 0 : 2);
    } catch {
      console.log(`[youtube-auth-smoke] ${JSON.stringify({
        detail: "The YouTube authentication check failed unexpectedly.",
        status: "failed"
      })}`);
      app.exit(2);
    }
  }
});

app.on("gpu-info-update", () => {
  gpuInfoReady = true;
  publishHostStatus();
});

app.on("window-all-closed", () => {
  app.quit();
});
