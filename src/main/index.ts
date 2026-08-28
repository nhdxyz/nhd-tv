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
  powerMonitor,
  protocol,
  safeStorage,
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
  type RemoteControlContext,
  type RemotePointerInput,
  type RemotePointerResult,
  type RemoteServiceShortcut,
  type RemoteStatus,
  type RemoteTextInput,
  type ServiceRecoveryMode,
  type ServiceRecoveryRequest,
  type SpotifyPlaybackPresentation,
  type WidevineState
} from "./contracts";
import {
  normalizeCatalogQuery,
  parseTvmazeSearchPayload
} from "./catalog-search";
import {
  AMBIENT_IDLE_POLL_MS,
  shouldActivateAmbientDisplay
} from "./ambient-display";
import { ContinueWatchingStore } from "./continue-watching-store";
import {
  buildRasterTranscodeScript,
  validateJpegDataUrl
} from "./image-transcode";
import { LocalStateStore } from "./local-state-store";
import {
  type CredentialCipher,
  OpenAiCredentialStore
} from "./openai-credential-store";
import { isMediaAction } from "./media-actions";
import {
  PhoneRemoteServer,
  type PhoneRemoteVoiceResult,
  type PhoneRemoteVoiceStatus
} from "./remote/phone-remote-server";
import { TailscaleSecureRemote } from "./remote/tailscale-secure-remote";
import { dispatchPrecisionPointer } from "./precision-pointer";
import { buildRemoteTextEntryScript } from "./remote-text-entry";
import { providerArtworkFallbackUrls } from "./provider-artwork";
import {
  getServiceDefinition,
  getServiceDefinitions,
  getServiceSummaries,
  setCustomServiceManifests
} from "./service-registry";
import { ServiceHost, type PlaybackObservation } from "./service-host";
import type { SpotifyPlaybackSnapshot } from "./spotify-playback";
import {
  isSystemVolumeAction,
  SystemVolumeController
} from "./system-volume";
import { isTrustedShellUrl } from "./security/sender-policy";
import { resolveRemoteSearchDestination } from "./search-routing";
import {
  buildServiceSearchUrl,
  isAllowedArtworkUrl,
  sanitizePlaybackUrl,
  type ServiceDefinition
} from "./security/navigation-policy";
import {
  OpenAiVoiceClient,
  OpenAiVoiceError,
  type VoiceAudioClip
} from "./voice/openai-voice-client";
import type {
  VoiceCommandContext,
  VoiceCommandPlan
} from "./voice/voice-command-router";
import { VoiceCommandSession } from "./voice/voice-command-session";
import {
  isVoiceDiscoveryIntent,
  resolveVoiceMediaDestination,
  voiceDiscoveryOpenedDetail
} from "./voice/voice-media-destination";
import { GoogleWatchCache } from "./voice/google-watch-cache";
import {
  GoogleWatchResolver,
  googleWatchLookupFromIntent
} from "./voice/google-watch-resolver";
import {
  selectEnabledWatchOffer,
  watchAvailabilityDetail
} from "./voice/google-watch-selection";
import { applyYouTubeLatestSort } from "./voice/voice-provider-automation";

const SHELL_HOST = "shell";
const WIDEVINE_TIMEOUT_MS = 30_000;
const MAX_ARTWORK_BYTES = 5 * 1024 * 1024;
const MAX_CACHED_ARTWORK_BYTES = 3 * 1024 * 1024;
const MAX_CATALOG_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_CATALOG_RESPONSE_BYTES = 2 * 1024 * 1024;
const CATALOG_CACHE_MS = 15 * 60 * 1_000;
const SHELL_REMOTE_TEXT_ENTRY_SELECTORS = [
  "#search-input",
  "#store-search"
] as const;

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

const ownsSingleInstanceLock = app.requestSingleInstanceLock();
if (!ownsSingleInstanceLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let continueWatchingStore: ContinueWatchingStore | null = null;
let googleWatchCache: GoogleWatchCache | null = null;
let googleWatchResolver: GoogleWatchResolver | null = null;
let localStateStore: LocalStateStore | null = null;
let openAiCredentialStore: OpenAiCredentialStore | null = null;
let phoneRemote: PhoneRemoteServer | null = null;
let tailscaleSecureRemote: TailscaleSecureRemote | null = null;
let voiceCommandSession: VoiceCommandSession | null = null;
let serviceHost: ServiceHost | null = null;
let shellPointerSnapKey: string | null = null;
let ambientDisplayPreview = false;
let ambientLastSystemIdleSeconds = 0;
let ambientDisplayVisible = false;
let ambientIdleTimer: NodeJS.Timeout | null = null;
let ambientLastActivityAt = Date.now();
let lastServicePlaybackActive = false;
let spotifyArtworkSourceUrl: string | null = null;
let spotifyPlaybackPresentation: SpotifyPlaybackPresentation = {
  album: null,
  artist: null,
  artworkDataUrl: null,
  durationSeconds: null,
  playing: false,
  positionSeconds: null,
  signedIn: false,
  title: null
};
let gpuInfoReady = false;
let widevineState: WidevineState = "checking";
let widevineDetails = "Waiting for the Widevine component updater.";
const systemVolumeController = new SystemVolumeController();
interface ArtworkCacheState {
  readonly requests: Set<string>;
  readonly sourceUrls: Map<string, string>;
}

const artworkCacheStates = new WeakMap<ContinueWatchingStore, ArtworkCacheState>();
const catalogCache = new Map<string, {
  expiresAt: number;
  results: readonly CatalogSearchResult[];
}>();
const catalogImageCache = new Map<string, string | null>();
const spotifyArtworkCache = new Map<string, string>();
const spotifyArtworkRequests = new Set<string>();

function presentMainWindow(): void {
  const window = mainWindow;
  if (window === null || window.isDestroyed()) {
    return;
  }

  if (window.isMinimized()) {
    window.restore();
  }

  // Fullscreen windows can be created on a remembered television display or
  // macOS Space without becoming the foreground application. Explicitly
  // activate and focus the host so a launch request always presents NHD-TV.
  if (process.platform === "darwin") {
    app.focus({ steal: true });
  }
  window.show();
  window.focus();
  markAmbientActivity();
}

function youtubeTvPreferencesFor(
  preferences: LocalAppState["devicePreferences"] | undefined
) {
  return {
    enabled: preferences?.youtubeTvModeEnabled !== false,
    safeArea: preferences?.safeArea ?? "standard",
    scale: preferences?.youtubeTvScale ?? "standard"
  } as const;
}

function dismissAmbientDisplay(): void {
  if (!ambientDisplayVisible) {
    return;
  }

  ambientDisplayVisible = false;
  ambientDisplayPreview = false;
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.ambientDisplayChanged, false);
    serviceHost?.restoreFromAmbientDisplay();
  }
}

function markAmbientActivity(): void {
  ambientLastActivityAt = Date.now();
  dismissAmbientDisplay();
}

function presentAmbientDisplay(preview = false): boolean {
  const window = mainWindow;
  const preferences = localStateStore?.snapshot().devicePreferences;
  if (
    window === null ||
    window.isDestroyed() ||
    (!preview && preferences?.ambientDisplayEnabled !== true) ||
    serviceHost?.hasRecoveryTarget === true ||
    serviceHost?.presentAmbientDisplay() === false
  ) {
    return false;
  }

  ambientDisplayVisible = true;
  ambientDisplayPreview = preview;
  try {
    ambientLastSystemIdleSeconds = powerMonitor.getSystemIdleTime();
  } catch {
    ambientLastSystemIdleSeconds = 0;
  }
  window.webContents.send(IPC_CHANNELS.ambientDisplayChanged, true);
  window.webContents.focus();
  return true;
}

function pollAmbientDisplay(): void {
  const window = mainWindow;
  const preferences = localStateStore?.snapshot().devicePreferences;
  if (window === null || window.isDestroyed() || preferences === undefined) {
    return;
  }

  let systemIdleSeconds: number;
  try {
    systemIdleSeconds = powerMonitor.getSystemIdleTime();
  } catch {
    return;
  }

  if (ambientDisplayVisible) {
    const systemActivityObserved = systemIdleSeconds + 1 < ambientLastSystemIdleSeconds;
    ambientLastSystemIdleSeconds = systemIdleSeconds;
    if (
      (!preferences.ambientDisplayEnabled && !ambientDisplayPreview) ||
      serviceHost?.isPlaybackActive === true ||
      serviceHost?.hasRecoveryTarget === true ||
      systemActivityObserved
    ) {
      markAmbientActivity();
    }
    return;
  }

  if (shouldActivateAmbientDisplay({
    appIdleMilliseconds: Date.now() - ambientLastActivityAt,
    playbackActive: serviceHost?.isPlaybackActive ?? false,
    preferences,
    presentationBlocked: serviceHost?.isQuitPromptVisible === true ||
      serviceHost?.hasRecoveryTarget === true,
    systemIdleSeconds,
    windowVisible: window.isVisible() && !window.isMinimized()
  })) {
    presentAmbientDisplay();
  }
}

function startAmbientDisplayMonitor(): void {
  if (ambientIdleTimer !== null) {
    clearInterval(ambientIdleTimer);
  }
  ambientLastActivityAt = Date.now();
  ambientIdleTimer = setInterval(pollAmbientDisplay, AMBIENT_IDLE_POLL_MS);
}

function stopAmbientDisplayMonitor(): void {
  if (ambientIdleTimer !== null) {
    clearInterval(ambientIdleTimer);
    ambientIdleTimer = null;
  }
  dismissAmbientDisplay();
}

function handleServiceStateChanged(): void {
  const playbackActive = serviceHost?.isPlaybackActive ?? false;
  if (playbackActive || (lastServicePlaybackActive && !playbackActive)) {
    markAmbientActivity();
  }
  lastServicePlaybackActive = playbackActive;
  publishHostStatus();
}

function artworkCacheState(store: ContinueWatchingStore): ArtworkCacheState {
  const existing = artworkCacheStates.get(store);
  if (existing !== undefined) {
    return existing;
  }

  const state: ArtworkCacheState = {
    requests: new Set<string>(),
    sourceUrls: new Map<string, string>()
  };
  artworkCacheStates.set(store, state);
  return state;
}

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
  void backfillMissingArtwork(nextStore);
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
    playback: {
      active: serviceHost?.isPlaybackActive ?? false,
      backgrounded: serviceHost?.isBackgrounded ?? false
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

function publishSpotifyPlayback(): void {
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(
      IPC_CHANNELS.spotifyPlaybackChanged,
      spotifyPlaybackPresentation
    );
  }
}

async function fetchSpotifyArtworkDataUrl(artworkUrl: string): Promise<string | null> {
  const cached = spotifyArtworkCache.get(artworkUrl);
  if (cached !== undefined) return cached;

  const definition = getServiceDefinition("spotify");
  if (definition === null || !isAllowedArtworkUrl(artworkUrl, definition.artworkHosts)) {
    return null;
  }

  try {
    const serviceSession = session.fromPartition(definition.partition, { cache: true });
    const response = await serviceSession.fetch(artworkUrl, { redirect: "error" });
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    const contentType = response.headers.get("content-type") ?? "";
    if (
      !response.ok ||
      !contentType.toLocaleLowerCase().startsWith("image/") ||
      contentLength > MAX_ARTWORK_BYTES ||
      (response.url.length > 0 && !isAllowedArtworkUrl(response.url, definition.artworkHosts))
    ) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_ARTWORK_BYTES) return null;
    const source = nativeImage.createFromBuffer(buffer);
    if (source.isEmpty()) return null;
    const size = source.getSize();
    const resized = Math.max(size.width, size.height) > 1_200
      ? source.resize({
        quality: "good",
        width: Math.max(1, Math.round(size.width * 1_200 / Math.max(size.width, size.height)))
      })
      : source;
    const dataUrl = `data:image/jpeg;base64,${resized.toJPEG(92).toString("base64")}`;
    spotifyArtworkCache.set(artworkUrl, dataUrl);
    if (spotifyArtworkCache.size > 12) {
      spotifyArtworkCache.delete(spotifyArtworkCache.keys().next().value ?? artworkUrl);
    }
    return dataUrl;
  } catch {
    return null;
  }
}

function handleSpotifyPlayback(snapshot: SpotifyPlaybackSnapshot | null): void {
  spotifyArtworkSourceUrl = snapshot?.artworkUrl ?? null;
  spotifyPlaybackPresentation = snapshot === null
    ? {
      album: null,
      artist: null,
      artworkDataUrl: null,
      durationSeconds: null,
      playing: false,
      positionSeconds: null,
      signedIn: false,
      title: null
    }
    : {
      album: snapshot.album,
      artist: snapshot.artist,
      artworkDataUrl: snapshot.artworkUrl === null
        ? null
        : spotifyArtworkCache.get(snapshot.artworkUrl) ?? null,
      durationSeconds: snapshot.durationSeconds,
      playing: snapshot.playing,
      positionSeconds: snapshot.positionSeconds,
      signedIn: snapshot.signedIn,
      title: snapshot.title
    };
  publishSpotifyPlayback();

  if (snapshot?.artworkUrl !== null && snapshot?.artworkUrl !== undefined &&
    spotifyPlaybackPresentation.artworkDataUrl === null &&
    !spotifyArtworkRequests.has(snapshot.artworkUrl)) {
    const expectedUrl = snapshot.artworkUrl;
    spotifyArtworkRequests.add(expectedUrl);
    void fetchSpotifyArtworkDataUrl(expectedUrl).then((artworkDataUrl) => {
      if (artworkDataUrl === null || spotifyArtworkSourceUrl !== expectedUrl) return;
      spotifyPlaybackPresentation = { ...spotifyPlaybackPresentation, artworkDataUrl };
      publishSpotifyPlayback();
    }).finally(() => {
      spotifyArtworkRequests.delete(expectedUrl);
    });
  }
}

function publishServiceRecovery(request: ServiceRecoveryRequest): void {
  markAmbientActivity();
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.serviceRecoveryRequested, request);
  }
}

async function cacheArtwork(
  item: ContinueWatchingItem,
  artworkUrl: string,
  serviceId: string
): Promise<void> {
  const definition = getServiceDefinition(serviceId);
  const store = continueWatchingStore;
  const cacheState = store === null ? null : artworkCacheState(store);
  if (
    definition === null ||
    store === null ||
    cacheState === null ||
    cacheState.requests.has(item.id) ||
    cacheState.sourceUrls.get(item.id) === artworkUrl ||
    !isAllowedArtworkUrl(artworkUrl, definition.artworkHosts)
  ) {
    return;
  }

  cacheState.requests.add(item.id);

  try {
    const serviceSession = session.fromPartition(definition.partition, { cache: true });
    const response = await serviceSession.fetch(artworkUrl, { redirect: "error" });
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    const contentType = response.headers.get("content-type") ?? "";

    if (
      !response.ok ||
      !contentType.toLowerCase().startsWith("image/") ||
      contentLength > MAX_ARTWORK_BYTES ||
      (response.url.length > 0 &&
        !isAllowedArtworkUrl(response.url, definition.artworkHosts))
    ) {
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_ARTWORK_BYTES) {
      return;
    }

    const source = nativeImage.createFromBuffer(buffer);
    let artworkDataUrl: string | null;

    if (source.isEmpty()) {
      const script = buildRasterTranscodeScript(buffer, contentType, 1_280, 0.9);
      const window = mainWindow;
      if (script === null || window === null || window.isDestroyed()) {
        return;
      }
      const converted = await window.webContents.executeJavaScript(script, true) as unknown;
      artworkDataUrl = validateJpegDataUrl(converted, MAX_CACHED_ARTWORK_BYTES);
      const convertedImage = artworkDataUrl === null
        ? nativeImage.createEmpty()
        : nativeImage.createFromDataURL(artworkDataUrl);
      if (
        artworkDataUrl === null ||
        convertedImage.isEmpty()
      ) {
        return;
      }
    } else {
      const size = source.getSize();
      const resized = Math.max(size.width, size.height) > 1_280
        ? source.resize({
          quality: "good",
          width: Math.max(1, Math.round(size.width * 1_280 / Math.max(size.width, size.height)))
        })
        : source;
      artworkDataUrl = `data:image/jpeg;base64,${resized.toJPEG(90).toString("base64")}`;
    }

    const cachedImage = nativeImage.createFromDataURL(artworkDataUrl);
    if (cachedImage.isEmpty()) {
      return;
    }
    cacheState.sourceUrls.set(item.id, artworkUrl);
    if (await store.updateArtwork(item.id, artworkDataUrl, cachedImage.getSize().width)) {
      publishContinueWatching();
    }
  } catch {
    // Artwork is optional. Playback progress remains useful if a provider
    // rejects, redirects, or removes an image.
  } finally {
    cacheState.requests.delete(item.id);
  }
}

async function backfillMissingArtwork(store: ContinueWatchingStore): Promise<void> {
  for (const item of store.list()) {
    if (continueWatchingStore !== store) {
      return;
    }
    if (item.artworkDataUrl !== null) {
      continue;
    }

    const resumeTarget = store.resumeTarget(item.id);
    if (resumeTarget === null) {
      continue;
    }

    for (const artworkUrl of providerArtworkFallbackUrls(
      resumeTarget.serviceId,
      resumeTarget.watchUrl
    )) {
      if (continueWatchingStore !== store) {
        return;
      }

      await cacheArtwork(item, artworkUrl, resumeTarget.serviceId);
      if (store.list().find((candidate) => candidate.id === item.id)?.artworkDataUrl != null) {
        break;
      }
    }
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
      redirect: "error",
      signal: AbortSignal.timeout(8_000)
    });
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    const contentType = response.headers.get("content-type") ?? "";
    if (
      !response.ok ||
      !contentType.toLowerCase().startsWith("image/") ||
      contentLength > MAX_CATALOG_IMAGE_BYTES ||
      (response.url.length > 0 && !isAllowedCatalogImageUrl(response.url))
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

async function openTrackedService(
  definition: ServiceDefinition,
  initialUrl = definition.startUrl
): Promise<void> {
  if (serviceHost === null) {
    throw new Error("The service host is not ready.");
  }

  await serviceHost.open(definition, initialUrl);
  await localStateStore?.recordServiceLaunch(definition.id).catch(() => undefined);
}

function recentRemoteServices(): RemoteServiceShortcut[] {
  const state = localStateStore?.snapshot();
  if (state === undefined) return [];

  const enabled = new Set(state.preferences.enabledServiceIds);
  return state.recentServiceIds
    .filter((serviceId) => enabled.has(serviceId))
    .map((serviceId) => getServiceDefinition(serviceId))
    .filter((definition): definition is ServiceDefinition => definition !== null)
    .slice(0, 3)
    .map(({ id, name }) => ({ id, name }));
}

function remoteControlContext(): RemoteControlContext {
  const activeServiceId = serviceHost?.activeServiceId ?? null;
  const definition = activeServiceId === null ? null : getServiceDefinition(activeServiceId);
  const activeServiceName = definition?.name ?? "NHD Home";

  return {
    activeServiceId,
    activeServiceName,
    searchLabel: serviceHost?.isBackgrounded === true ||
      definition?.search === null ||
      definition === null
      ? "Search NHD-TV"
      : `Search ${activeServiceName}`
  };
}

async function handleRemoteServiceLaunch(serviceId: string): Promise<boolean> {
  if (ambientDisplayVisible) {
    markAmbientActivity();
    return true;
  }
  markAmbientActivity();
  if (!recentRemoteServices().some((service) => service.id === serviceId)) {
    return false;
  }

  const definition = getServiceDefinition(serviceId);
  if (definition === null) return false;
  await openTrackedService(definition);
  return true;
}

async function handleRemoteSearch(query: string): Promise<void> {
  if (ambientDisplayVisible) {
    markAmbientActivity();
    return;
  }
  markAmbientActivity();
  const destination = resolveRemoteSearchDestination(
    serviceHost?.isBackgrounded === true ? null : serviceHost?.activeServiceId ?? null,
    query
  );
  if (destination === null) {
    return;
  }

  if (destination.kind === "active-service" && serviceHost !== null) {
    await serviceHost.navigate(destination.url);
    return;
  }

  if (serviceHost?.isBackgrounded !== true) {
    await serviceHost?.closeWithCheckpoint();
  }

  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.remoteSearchRequested, destination.query);
  }
}

interface RemoteActionOutcome {
  detail?: string;
  handled: boolean;
}

async function handleRemoteAction(action: RemoteAction): Promise<RemoteActionOutcome> {
  if (ambientDisplayVisible && action !== "force-home") {
    markAmbientActivity();
    return { handled: true };
  }
  markAmbientActivity();

  if (action === "force-home") {
    if (serviceHost?.activeServiceId !== null && serviceHost !== null) {
      await serviceHost.forceReturnHome();
    } else if (serviceHost?.hasRecoveryTarget) {
      await serviceHost.recover("home");
    }
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.remoteAction, "home");
    }
    return { handled: true };
  }

  if (isMediaAction(action) && isSystemVolumeAction(action)) {
    return systemVolumeController.apply(action);
  }

  if (serviceHost?.activeServiceId !== null && serviceHost !== null) {
    if (serviceHost.isQuitPromptVisible) {
      if (mainWindow !== null && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.remoteAction, action);
      }
      return { detail: "Close the app prompt before using playback controls", handled: false };
    }

    if (serviceHost.isBackgrounded) {
      if (isMediaAction(action)) {
        return { handled: await serviceHost.sendRemoteAction(action) };
      }
      if (mainWindow !== null && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.remoteAction, action);
      }
      return { handled: true };
    }

    if (action === "home") {
      if (!serviceHost.returnHomeInBackground()) {
        await serviceHost.closeWithCheckpoint();
      }
      if (mainWindow !== null && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.remoteAction, "home");
      }
      return { handled: true };
    }

    return { handled: await serviceHost.sendRemoteAction(action) };
  }

  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.remoteAction, action);
  }
  return isMediaAction(action)
    ? { detail: "Open an app to use playback controls", handled: false }
    : { handled: true };
}

function remoteVoiceStatus(): PhoneRemoteVoiceStatus {
  const state = localStateStore?.snapshot();
  if (state === undefined || !state.devicePreferences.voiceControlEnabled) {
    return {
      available: false,
      detail: "Enable AI voice control in NHD-TV Settings."
    };
  }

  const credentialStatus = openAiCredentialStore?.status();
  if (credentialStatus?.state !== "configured") {
    return {
      available: false,
      detail: credentialStatus?.detail ?? "Add an OpenAI API key in NHD-TV Settings."
    };
  }
  if (voiceCommandSession === null) {
    return { available: false, detail: "Voice control is still starting." };
  }
  return { available: true, detail: "Hold the microphone button and speak." };
}

function voiceCommandContext(): VoiceCommandContext {
  const state = localStateStore?.snapshot();
  const enabledServiceIds = state?.preferences.enabledServiceIds ?? [];
  const serviceOrder = state?.preferences.serviceOrder ?? enabledServiceIds;
  return {
    activeServiceId: serviceHost?.activeServiceId ?? null,
    enabledServiceIds,
    muted: null,
    playbackMode: state?.preferences.voicePlaybackMode ?? "confirm",
    playing: serviceHost?.activeServiceId === null || serviceHost === null
      ? false
      : serviceHost.isPlaybackActive,
    serviceOrder
  };
}

function activeVoiceRegion(): string {
  const explicitRegion = localStateStore?.snapshot().devicePreferences.voiceRegion;
  if (explicitRegion !== null && explicitRegion !== undefined) return explicitRegion;
  try {
    const detected = app.getLocaleCountryCode().toUpperCase();
    return /^[A-Z]{2}$/.test(detected) ? detected : "US";
  } catch {
    return "US";
  }
}

function usesGoogleWatchDiscovery(
  plan: Extract<VoiceCommandPlan, { kind: "resolve-media" }>
): boolean {
  return ["episode", "movie", "show", "title"].includes(plan.intent.mediaType);
}

async function executeGoogleWatchPlan(
  plan: Extract<VoiceCommandPlan, { kind: "resolve-media" }>
): Promise<(RemoteActionOutcome & { detail: string }) | null> {
  const resolver = googleWatchResolver;
  if (resolver === null || !usesGoogleWatchDiscovery(plan)) return null;

  const lookup = googleWatchLookupFromIntent(plan.intent, activeVoiceRegion());
  let result = await resolver.resolve(lookup, {
    completeOffers: plan.intent.action === "lookup"
  });
  if (plan.intent.action === "lookup") {
    return {
      detail: watchAvailabilityDetail(result, plan.candidateServiceIds),
      handled: true
    };
  }

  let selected = selectEnabledWatchOffer(result, plan.candidateServiceIds);
  if (selected === null && !result.offersComplete) {
    result = await resolver.resolve(lookup, { completeOffers: true });
    selected = selectEnabledWatchOffer(result, plan.candidateServiceIds);
  }
  if (selected === null) {
    return {
      detail: watchAvailabilityDetail(result, plan.candidateServiceIds),
      handled: false
    };
  }

  const definition = getServiceDefinition(selected.serviceId);
  if (definition === null) return null;
  const playbackUrl = sanitizePlaybackUrl(selected.offer.watchUrl, definition);
  if (playbackUrl === null) return null;

  await openTrackedService(definition, playbackUrl);
  return {
    detail: `Opening ${result.resolvedTitle ?? plan.intent.title} on ${definition.name}.`,
    handled: true
  };
}

async function executeVoiceCommandPlan(
  plan: VoiceCommandPlan
): Promise<RemoteActionOutcome & { detail: string }> {
  if (plan.kind === "no-op") {
    return { detail: plan.detail, handled: true };
  }
  if (plan.kind === "remote-action") {
    const result = await handleRemoteAction(plan.action);
    return {
      detail: result.detail ?? "Voice control sent to the TV.",
      handled: result.handled
    };
  }
  if (plan.kind === "close-service") {
    if (serviceHost === null || serviceHost.activeServiceId === null) {
      return { detail: "Nothing is currently open.", handled: true };
    }
    await serviceHost.closeWithCheckpoint();
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.remoteAction, "home");
    }
    return { detail: "Closed the current app.", handled: true };
  }

  try {
    const googleResult = await executeGoogleWatchPlan(plan);
    if (googleResult !== null) return googleResult;
  } catch {
    // Google discovery is a best-effort private-project adapter. A provider's
    // own search page remains available if its markup, network, or rate limit changes.
  }

  const destination = resolveVoiceMediaDestination(plan.intent, plan.candidateServiceIds);
  if (destination === null) {
    return {
      detail: isVoiceDiscoveryIntent(plan.intent)
        ? "Netflix is not enabled in this profile, so recommendations cannot be opened yet."
        : "That title is not on a service enabled in this profile.",
      handled: false
    };
  }
  if (!plan.launchAllowed) {
    const serviceName = getServiceDefinition(destination.serviceId)?.name ?? destination.serviceId;
    return {
      detail: `${plan.intent.title} can be looked up on ${serviceName}.`,
      handled: true
    };
  }

  const definition = getServiceDefinition(destination.serviceId);
  const baseSearchUrl = definition === null
    ? null
    : buildServiceSearchUrl(definition, destination.query);
  if (definition === null || baseSearchUrl === null) {
    return { detail: "That service cannot search for this request.", handled: false };
  }
  const searchUrl = destination.serviceId === "youtube"
    ? applyYouTubeLatestSort(baseSearchUrl, plan.intent)
    : baseSearchUrl;
  await openTrackedService(definition, searchUrl);
  const automated = await serviceHost?.executeVoiceMediaIntent(plan.intent) ?? false;
  const exactEpisode = plan.intent.mediaType === "episode"
    ? ` season ${plan.intent.season}, episode ${plan.intent.episode}`
    : "";
  const discoveryDetail = voiceDiscoveryOpenedDetail(plan.intent, definition.name);
  return {
    detail: discoveryDetail ?? (automated
      ? `${plan.intent.action === "play" ? "Playing" : "Opening"} ${plan.intent.title} on ${definition.name}.`
      : `Opened ${definition.name} results for ${plan.intent.title}${exactEpisode}.`),
    handled: true
  };
}

function voiceFailure(error: unknown): PhoneRemoteVoiceResult {
  return {
    detail: error instanceof OpenAiVoiceError
      ? error.message
      : "Voice control could not process that request.",
    outcome: "failed"
  };
}

async function handleRemoteVoice(clip: VoiceAudioClip): Promise<PhoneRemoteVoiceResult> {
  if (!remoteVoiceStatus().available || voiceCommandSession === null) {
    return { detail: remoteVoiceStatus().detail, outcome: "failed" };
  }
  try {
    return await voiceCommandSession.process(clip);
  } catch (error) {
    return voiceFailure(error);
  }
}

async function confirmRemoteVoice(confirmationId: string): Promise<PhoneRemoteVoiceResult> {
  if (voiceCommandSession === null) {
    return { detail: "Voice control is still starting.", outcome: "failed" };
  }
  try {
    return await voiceCommandSession.confirm(confirmationId);
  } catch (error) {
    return voiceFailure(error);
  }
}

async function handleRemotePointer(input: RemotePointerInput): Promise<RemotePointerResult> {
  if (input.phase !== "hide") {
    if (ambientDisplayVisible) {
      markAmbientActivity();
      return { snapChanged: false, snapped: false, textEntryAvailable: false };
    }
    markAmbientActivity();
  }

  if (
    serviceHost !== null &&
    serviceHost.activeServiceId !== null &&
    !serviceHost.isBackgrounded &&
    (input.phase === "hide" || !serviceHost.isQuitPromptVisible)
  ) {
    const result = await serviceHost.sendRemotePointer(input);
    if (result.snapChanged && mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.remotePrecisionMoved);
    }
    return result;
  }

  if (mainWindow === null || mainWindow.isDestroyed()) {
    return { snapChanged: false, snapped: false, textEntryAvailable: false };
  }

  try {
    mainWindow.focus();
    const result = await dispatchPrecisionPointer(
      mainWindow.webContents,
      input,
      shellPointerSnapKey,
      SHELL_REMOTE_TEXT_ENTRY_SELECTORS
    );
    shellPointerSnapKey = result.snapKey;
    if (result.snapChanged) {
      mainWindow.webContents.send(IPC_CHANNELS.remotePrecisionMoved);
    }
    return {
      snapChanged: result.snapChanged,
      snapped: result.snapped,
      textEntryAvailable: result.textEntryAvailable
    };
  } catch {
    shellPointerSnapKey = null;
    return { snapChanged: false, snapped: false, textEntryAvailable: false };
  }
}

async function handleRemoteText(input: RemoteTextInput): Promise<boolean> {
  if (ambientDisplayVisible) {
    markAmbientActivity();
    return true;
  }
  markAmbientActivity();

  if (
    serviceHost !== null &&
    serviceHost.activeServiceId !== null &&
    !serviceHost.isBackgrounded &&
    !serviceHost.isQuitPromptVisible
  ) {
    return serviceHost.sendRemoteText(input);
  }

  if (
    mainWindow === null ||
    mainWindow.isDestroyed() ||
    serviceHost?.isQuitPromptVisible === true
  ) {
    return false;
  }

  try {
    const accepted = await mainWindow.webContents.executeJavaScript(
      buildRemoteTextEntryScript(input.text, SHELL_REMOTE_TEXT_ENTRY_SELECTORS),
      true
    ) as unknown;
    if (accepted !== true) return false;

    if (input.submit) {
      mainWindow.focus();
      mainWindow.webContents.focus();
      mainWindow.webContents.sendInputEvent({ keyCode: "Enter", type: "keyDown" });
      mainWindow.webContents.sendInputEvent({ keyCode: "Enter", type: "keyUp" });
    }
    return true;
  } catch {
    return false;
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

function electronCredentialCipher(): CredentialCipher {
  return {
    decryptString: (value) => safeStorage.decryptString(value),
    encryptString: (value) => safeStorage.encryptString(value),
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable() &&
      (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text")
  };
}

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.dismissAmbientDisplay, (event) => {
    validateShellSender(event.senderFrame?.url ?? "");
    markAmbientActivity();
  });

  ipcMain.handle(IPC_CHANNELS.previewAmbientDisplay, (event) => {
    validateShellSender(event.senderFrame?.url ?? "");
    return presentAmbientDisplay(true);
  });

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

  ipcMain.handle(IPC_CHANNELS.getOpenAiCredentialStatus, (event) => {
    validateShellSender(event.senderFrame?.url ?? "");
    if (openAiCredentialStore === null) {
      throw new Error("OpenAI credential storage is not ready.");
    }
    return openAiCredentialStore.status();
  });

  ipcMain.handle(IPC_CHANNELS.saveOpenAiApiKey, (event, apiKey: unknown) => {
    validateShellSender(event.senderFrame?.url ?? "");
    if (openAiCredentialStore === null) {
      throw new Error("OpenAI credential storage is not ready.");
    }
    return openAiCredentialStore.save(apiKey);
  });

  ipcMain.handle(IPC_CHANNELS.clearOpenAiApiKey, (event) => {
    validateShellSender(event.senderFrame?.url ?? "");
    if (openAiCredentialStore === null) {
      throw new Error("OpenAI credential storage is not ready.");
    }
    return openAiCredentialStore.clear();
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
      markAmbientActivity();
      mainWindow?.setFullScreen(state.devicePreferences.fullscreen);
      serviceHost?.setYouTubeTvPreferences(youtubeTvPreferencesFor(state.devicePreferences));
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

  ipcMain.handle(IPC_CHANNELS.getRemoteStatus, async (event) => {
    validateShellSender(event.senderFrame?.url ?? "");
    return phoneRemote === null
      ? inactiveRemoteStatus()
      : phoneRemote.ensurePairing();
  });

  ipcMain.handle(IPC_CHANNELS.getSpotifyPlayback, (event) => {
    validateShellSender(event.senderFrame?.url ?? "");
    return spotifyPlaybackPresentation;
  });

  ipcMain.handle(IPC_CHANNELS.inputAction, async (event, action: unknown) => {
    validateShellSender(event.senderFrame?.url ?? "");

    if (
      typeof action !== "string" ||
      !(REMOTE_ACTIONS as readonly string[]).includes(action)
    ) {
      throw new TypeError("Input action is not supported.");
    }

    return (await handleRemoteAction(action as RemoteAction)).handled;
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

    await openTrackedService(definition);
  });

  ipcMain.handle(IPC_CHANNELS.recoverService, async (event, mode: unknown) => {
    validateShellSender(event.senderFrame?.url ?? "");
    if (
      serviceHost === null ||
      (mode !== "home" && mode !== "reload" && mode !== "retry")
    ) {
      throw new TypeError("A supported service recovery action is required.");
    }
    return serviceHost.recover(mode as ServiceRecoveryMode);
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

      await openTrackedService(definition, searchUrl);
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

    await openTrackedService(definition, watchUrl);
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
    handleServiceStateChanged,
    (request) => {
      if (mainWindow !== null && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.serviceQuitRequested, request);
      }
    },
    publishServiceRecovery,
    handlePlaybackObservation,
    (action) => void systemVolumeController.apply(action),
    youtubeTvPreferencesFor(devicePreferences),
    handleSpotifyPlayback
  );
  phoneRemote = new PhoneRemoteServer({
    onAction: handleRemoteAction,
    onGetContext: remoteControlContext,
    onGetVoiceStatus: remoteVoiceStatus,
    onGetRecentServices: recentRemoteServices,
    onLaunchService: handleRemoteServiceLaunch,
    onPointer: handleRemotePointer,
    onPrepareSecureAccess: (localPort) => {
      if (tailscaleSecureRemote === null) {
        return {
          detail: "Tailscale secure access is still starting.",
          origin: null,
          state: "unavailable"
        };
      }
      return tailscaleSecureRemote.prepare(localPort);
    },
    onSearch: handleRemoteSearch,
    onStatusChanged: publishRemoteStatus,
    onText: handleRemoteText,
    onConfirmVoice: confirmRemoteVoice,
    onVoice: handleRemoteVoice,
    shouldAutoApproveFirstRemote: () =>
      localStateStore?.snapshot().devicePreferences.autoApproveFirstRemote ?? true
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
    const tailscaleToRelease = tailscaleSecureRemote;
    const watchCacheToClose = googleWatchCache;
    const watchResolverToDestroy = googleWatchResolver;

    stopAmbientDisplayMonitor();
    googleWatchCache = null;
    googleWatchResolver = null;
    phoneRemote = null;
    tailscaleSecureRemote = null;
    serviceHost = null;
    mainWindow = null;
    watchResolverToDestroy?.destroy();
    watchCacheToClose?.close();
    void (remoteToStop?.stop() ?? Promise.resolve())
      .finally(() => tailscaleToRelease?.release());
  });

  await mainWindow.loadURL("app://shell/index.html");
  presentMainWindow();
  startAmbientDisplayMonitor();

  if (process.argv.includes("--devtools")) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.on("second-instance", () => {
  presentMainWindow();
});

app.on("activate", () => {
  presentMainWindow();
});

app.whenReady().then(async () => {
  if (!ownsSingleInstanceLock) {
    return;
  }

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
  googleWatchCache = new GoogleWatchCache(
    path.join(app.getPath("userData"), "voice-watch-results.sqlite")
  );
  googleWatchResolver = new GoogleWatchResolver({ cache: googleWatchCache });
  tailscaleSecureRemote = new TailscaleSecureRemote(
    path.join(app.getPath("userData"), "tailscale-serve.json")
  );
  openAiCredentialStore = new OpenAiCredentialStore(
    path.join(app.getPath("userData"), "openai-credential.bin"),
    electronCredentialCipher()
  );
  await openAiCredentialStore.initialize();
  const openAiVoiceClient = new OpenAiVoiceClient({
    getApiKey: () => {
      if (openAiCredentialStore === null) {
        throw new Error("The OpenAI credential store is unavailable.");
      }
      return openAiCredentialStore.getApiKey();
    }
  });
  voiceCommandSession = new VoiceCommandSession({
    execute: executeVoiceCommandPlan,
    getContext: voiceCommandContext,
    understand: (clip, signal) => openAiVoiceClient.understand(clip, signal)
  });
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
  void googleWatchResolver.warm().catch(() => undefined);
  powerMonitor.on("suspend", () => {
    markAmbientActivity();
    void serviceHost?.prepareForSuspend();
  });
  powerMonitor.on("resume", () => {
    markAmbientActivity();
    void serviceHost?.resumeAfterSuspend();
  });
  powerMonitor.on("lock-screen", markAmbientActivity);
  powerMonitor.on("unlock-screen", markAmbientActivity);
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
