import path from "node:path";
import { constants as fsConstants } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  components,
  ipcMain,
  nativeImage,
  net,
  protocol,
  screen,
  session
} from "electron";
import {
  IPC_CHANNELS,
  REMOTE_ACTIONS,
  type CatalogSearchResult,
  type HostStatus,
  type ContinueWatchingItem,
  type LocalAppState,
  type ProfilePreferences,
  type ProcessDiagnostics,
  type RemoteAction,
  type RemoteStatus,
  type WidevineState
} from "./contracts";
import {
  normalizeCatalogQuery,
  parseTvmazeSearchPayload
} from "./catalog-search";
import { ContinueWatchingStore } from "./continue-watching-store";
import { LocalStateStore } from "./local-state-store";
import { PhoneRemoteServer } from "./remote/phone-remote-server";
import {
  getServiceDefinition,
  getServiceDefinitions,
  getServiceSummaries,
  setCustomServiceManifests
} from "./service-registry";
import { ServiceHost, type PlaybackObservation } from "./service-host";
import { isTrustedShellUrl } from "./security/sender-policy";
import { resolveRemoteSearchDestination } from "./search-routing";
import {
  buildServiceSearchUrl,
  isAllowedArtworkUrl,
  sanitizePlaybackUrl
} from "./security/navigation-policy";

const SHELL_HOST = "shell";
const WIDEVINE_TIMEOUT_MS = 30_000;
const MAX_ARTWORK_BYTES = 5 * 1024 * 1024;
const MAX_CATALOG_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_CATALOG_RESPONSE_BYTES = 2 * 1024 * 1024;
const CATALOG_CACHE_MS = 15 * 60 * 1_000;

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
let localStateStore: LocalStateStore | null = null;
let phoneRemote: PhoneRemoteServer | null = null;
let serviceHost: ServiceHost | null = null;
let gpuInfoReady = false;
let widevineState: WidevineState = "checking";
let widevineDetails = "Waiting for the Widevine component updater.";
const artworkRequests = new Set<string>();
const catalogCache = new Map<string, {
  expiresAt: number;
  results: readonly CatalogSearchResult[];
}>();
const catalogImageCache = new Map<string, string | null>();

async function initializeContinueWatchingForProfile(
  profileId: string,
  migrateLegacy = false
): Promise<void> {
  const userDataPath = app.getPath("userData");
  const profileDirectory = path.join(userDataPath, "profiles", profileId);
  const profilePath = path.join(profileDirectory, "continue-watching.json");
  await mkdir(profileDirectory, { recursive: true });

  if (migrateLegacy) {
    try {
      await copyFile(
        path.join(userDataPath, "continue-watching.json"),
        profilePath,
        fsConstants.COPYFILE_EXCL
      );
    } catch {
      // A missing legacy file or an existing profile file needs no migration.
    }
  }

  const nextStore = new ContinueWatchingStore(profilePath);
  await nextStore.initialize();
  continueWatchingStore = nextStore;
}

async function activateProfile(
  operation: () => Promise<LocalAppState>
): Promise<LocalAppState> {
  await serviceHost?.closeWithCheckpoint();
  const state = await operation();
  await initializeContinueWatchingForProfile(state.activeProfileId);
  publishContinueWatching();
  return state;
}

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
  const displays = screen.getAllDisplays();
  const activeDisplay = mainWindow === null || mainWindow.isDestroyed()
    ? null
    : screen.getDisplayMatching(mainWindow.getBounds());
  return {
    activeServiceId: serviceHost?.activeServiceId ?? null,
    display: {
      count: displays.length,
      id: activeDisplay === null ? null : String(activeDisplay.id),
      label: activeDisplay?.label || (activeDisplay === null ? "No display" : `Display ${activeDisplay.id}`)
    },
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

function isAllowedCatalogImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "static.tvmaze.com" &&
      url.pathname.startsWith("/uploads/");
  } catch {
    return false;
  }
}

async function cacheCatalogImage(imageUrl: string | null): Promise<string | null> {
  if (imageUrl === null || !isAllowedCatalogImageUrl(imageUrl)) {
    return null;
  }
  if (catalogImageCache.has(imageUrl)) {
    return catalogImageCache.get(imageUrl) ?? null;
  }

  try {
    const response = await net.fetch(imageUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(8_000)
    });
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    const contentType = response.headers.get("content-type") ?? "";
    if (
      !response.ok ||
      !contentType.toLowerCase().startsWith("image/") ||
      contentLength > MAX_CATALOG_IMAGE_BYTES ||
      !isAllowedCatalogImageUrl(response.url)
    ) {
      catalogImageCache.set(imageUrl, null);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_CATALOG_IMAGE_BYTES) {
      catalogImageCache.set(imageUrl, null);
      return null;
    }
    const source = nativeImage.createFromBuffer(buffer);
    if (source.isEmpty()) {
      catalogImageCache.set(imageUrl, null);
      return null;
    }
    const size = source.getSize();
    const resized = size.width > 320
      ? source.resize({ quality: "good", width: 320 })
      : source;
    const dataUrl = "data:image/jpeg;base64," + resized.toJPEG(80).toString("base64");
    catalogImageCache.set(imageUrl, dataUrl);
    return dataUrl;
  } catch {
    catalogImageCache.set(imageUrl, null);
    return null;
  }
}

async function searchCatalog(value: unknown): Promise<readonly CatalogSearchResult[]> {
  const query = normalizeCatalogQuery(value);
  if (query === null) {
    return [];
  }
  const cacheKey = query.toLocaleLowerCase();
  const cached = catalogCache.get(cacheKey);
  if (cached !== undefined && cached.expiresAt > Date.now()) {
    return cached.results;
  }

  const url = new URL("https://api.tvmaze.com/search/shows");
  url.searchParams.set("q", query);
  const response = await net.fetch(url.toString(), {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(8_000)
  });
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (!response.ok || contentLength > MAX_CATALOG_RESPONSE_BYTES) {
    throw new Error(response.status === 429
      ? "Show search is busy. Please wait a moment and try again."
      : "Show search is temporarily unavailable.");
  }
  const text = await response.text();
  if (text.length === 0 || Buffer.byteLength(text) > MAX_CATALOG_RESPONSE_BYTES) {
    throw new Error("Show search returned an invalid response.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Show search returned an invalid response.");
  }
  const candidates = parseTvmazeSearchPayload(payload);
  const results = await Promise.all(candidates.map(async ({ imageUrl, ...candidate }) => ({
    ...candidate,
    imageDataUrl: await cacheCatalogImage(imageUrl)
  })));
  catalogCache.set(cacheKey, {
    expiresAt: Date.now() + CATALOG_CACHE_MS,
    results
  });
  return results;
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
  const destination = resolveRemoteSearchDestination(
    serviceHost?.activeServiceId ?? null,
    query
  );
  if (destination === null) {
    return;
  }

  if (destination.kind === "active-service" && serviceHost !== null) {
    await serviceHost.navigate(destination.url);
    return;
  }

  await serviceHost?.closeWithCheckpoint();

  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.remoteSearchRequested, destination.query);
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

  ipcMain.handle(IPC_CHANNELS.searchCatalog, (event, query: unknown) => {
    validateShellSender(event.senderFrame?.url ?? "");
    return searchCatalog(query);
  });

  ipcMain.handle(IPC_CHANNELS.getLocalAppState, (event) => {
    validateShellSender(event.senderFrame?.url ?? "");
    if (localStateStore === null) {
      throw new Error("Local profile state is not ready.");
    }
    return localStateStore.snapshot();
  });

  ipcMain.handle(
    IPC_CHANNELS.addCustomService,
    async (event, name: unknown, startUrl: unknown) => {
      validateShellSender(event.senderFrame?.url ?? "");
      if (localStateStore === null) {
        throw new Error("Local service state is not ready.");
      }
      const state = await localStateStore.addCustomService(name, startUrl);
      setCustomServiceManifests(state.customServices);
      return state;
    }
  );

  ipcMain.handle(IPC_CHANNELS.removeCustomService, async (event, serviceId: unknown) => {
    validateShellSender(event.senderFrame?.url ?? "");
    if (localStateStore === null || typeof serviceId !== "string") {
      throw new Error("That custom service does not exist.");
    }

    const definition = getServiceDefinition(serviceId);
    if (definition === null || definition.kind !== "custom") {
      throw new Error("That custom service does not exist.");
    }

    if (serviceHost?.activeServiceId === serviceId) {
      await serviceHost.closeWithCheckpoint();
    }
    await session.fromPartition(definition.partition, { cache: true }).clearStorageData();
    const state = await localStateStore.removeCustomService(serviceId);
    setCustomServiceManifests(state.customServices);
    return state;
  });

  ipcMain.handle(IPC_CHANNELS.createProfile, async (event, name: unknown) => {
    validateShellSender(event.senderFrame?.url ?? "");
    if (localStateStore === null) {
      throw new Error("Local profile state is not ready.");
    }
    return activateProfile(() => localStateStore!.createProfile(name));
  });

  ipcMain.handle(IPC_CHANNELS.selectProfile, async (event, profileId: unknown) => {
    validateShellSender(event.senderFrame?.url ?? "");
    if (localStateStore === null) {
      throw new Error("Local profile state is not ready.");
    }
    return activateProfile(() => localStateStore!.selectProfile(profileId));
  });

  ipcMain.handle(
    IPC_CHANNELS.updateProfilePreferences,
    (event, preferences: ProfilePreferences) => {
      validateShellSender(event.senderFrame?.url ?? "");
      if (localStateStore === null) {
        throw new Error("Local profile state is not ready.");
      }
      return localStateStore.updatePreferences(preferences);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.updateDevicePreferences,
    async (event, preferences: unknown) => {
      validateShellSender(event.senderFrame?.url ?? "");
      if (localStateStore === null) {
        throw new Error("Local device state is not ready.");
      }

      const state = await localStateStore.updateDevicePreferences(preferences);
      mainWindow?.setFullScreen(state.devicePreferences.fullscreen);
      publishHostStatus();
      return state;
    }
  );

  ipcMain.handle(IPC_CHANNELS.cycleDisplay, async (event) => {
    validateShellSender(event.senderFrame?.url ?? "");
    if (localStateStore === null || mainWindow === null || mainWindow.isDestroyed()) {
      throw new Error("Display settings are not ready.");
    }

    const displays = screen.getAllDisplays();
    if (displays.length === 0) {
      throw new Error("No displays are available.");
    }

    const current = screen.getDisplayMatching(mainWindow.getBounds());
    const currentIndex = Math.max(0, displays.findIndex((display) => display.id === current.id));
    const next = displays[(currentIndex + 1) % displays.length] ?? displays[0]!;
    const preferences = localStateStore.snapshot().devicePreferences;
    const state = await localStateStore.updateDevicePreferences({
      ...preferences,
      selectedDisplayId: String(next.id)
    });

    mainWindow.setFullScreen(false);
    mainWindow.setBounds(next.bounds);
    mainWindow.setFullScreen(state.devicePreferences.fullscreen);
    publishHostStatus();
    return state;
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

  ipcMain.handle(IPC_CHANNELS.inputAction, (event, action: unknown) => {
    validateShellSender(event.senderFrame?.url ?? "");

    if (
      typeof action !== "string" ||
      !(REMOTE_ACTIONS as readonly string[]).includes(action)
    ) {
      throw new TypeError("Input action is not supported.");
    }

    handleRemoteAction(action as RemoteAction);
    return true;
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

  ipcMain.handle(IPC_CHANNELS.removeContinueWatching, async (event, itemId: unknown) => {
    validateShellSender(event.senderFrame?.url ?? "");

    const removed = await continueWatchingStore?.remove(itemId) ?? false;
    if (removed) {
      publishContinueWatching();
    }

    return removed;
  });

  ipcMain.handle(IPC_CHANNELS.closeService, async (event) => {
    validateShellSender(event.senderFrame?.url ?? "");
    await serviceHost?.closeWithCheckpoint();
  });

  ipcMain.handle(IPC_CHANNELS.clearServiceData, async (event, serviceId: unknown) => {
    validateShellSender(event.senderFrame?.url ?? "");
    if (typeof serviceId !== "string") {
      throw new TypeError("Service id must be a string.");
    }

    const definition = getServiceDefinition(serviceId);
    if (definition === null) {
      throw new Error(`Unknown service: ${serviceId}`);
    }

    if (serviceHost?.activeServiceId === serviceId) {
      await serviceHost.closeWithCheckpoint();
    }

    await session.fromPartition(definition.partition, { cache: true }).clearStorageData();
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

  const devicePreferences = localStateStore?.snapshot().devicePreferences;
  const displays = screen.getAllDisplays();
  const selectedDisplay = displays.find(
    (display) => String(display.id) === devicePreferences?.selectedDisplayId
  );

  mainWindow = new BrowserWindow({
    backgroundColor: "#05070d",
    height: 720,
    fullscreen: devicePreferences?.fullscreen ?? true,
    minHeight: 540,
    minWidth: 960,
    show: false,
    title: "NHD-TV Feasibility Host",
    width: 1280,
    ...(selectedDisplay === undefined ? {} : {
      x: selectedDisplay.bounds.x,
      y: selectedDisplay.bounds.y
    }),
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
  const serviceDefinitions = getServiceDefinitions();
  localStateStore = new LocalStateStore(
    path.join(app.getPath("userData"), "local-state.json"),
    serviceDefinitions.map((service) => service.id),
    serviceDefinitions
      .filter((service) => service.kind === "commercial")
      .map((service) => service.id)
  );
  await localStateStore.initialize();
  setCustomServiceManifests(localStateStore.snapshot().customServices);
  await initializeContinueWatchingForProfile(
    localStateStore.snapshot().activeProfileId,
    true
  );
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
