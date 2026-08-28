export const IPC_CHANNELS = {
  addCustomService: "nhd:custom-service:add",
  ambientDisplayChanged: "nhd:ambient-display:changed",
  approveRemotePairing: "nhd:remote:pairing:approve",
  cancelServiceQuit: "nhd:service:quit:cancel",
  clearServiceData: "nhd:service:data:clear",
  cycleDisplay: "nhd:display:cycle",
  closeService: "nhd:service:close",
  continueWatchingChanged: "nhd:continue-watching:changed",
  confirmServiceQuit: "nhd:service:quit:confirm",
  createProfile: "nhd:profile:create",
  denyRemotePairing: "nhd:remote:pairing:deny",
  dismissAmbientDisplay: "nhd:ambient-display:dismiss",
  getContinueWatching: "nhd:continue-watching:list",
  getServices: "nhd:service:list",
  getHostStatus: "nhd:host:status:get",
  getLocalAppState: "nhd:local-state:get",
  getRemoteStatus: "nhd:remote:status:get",
  hostStatusChanged: "nhd:host:status:changed",
  inputAction: "nhd:input:action",
  openService: "nhd:service:open",
  previewAmbientDisplay: "nhd:ambient-display:preview",
  remoteAction: "nhd:remote:action",
  remotePrecisionMoved: "nhd:remote:precision:moved",
  remoteSearchRequested: "nhd:remote:search:requested",
  remoteStatusChanged: "nhd:remote:status:changed",
  removeContinueWatching: "nhd:continue-watching:remove",
  removeCustomService: "nhd:custom-service:remove",
  recoverService: "nhd:service:recover",
  resumeContinueWatching: "nhd:continue-watching:resume",
  searchCatalog: "nhd:catalog:search",
  searchService: "nhd:service:search",
  selectProfile: "nhd:profile:select",
  serviceRecoveryRequested: "nhd:service:recovery:requested",
  serviceQuitRequested: "nhd:service:quit:requested",
  startRemotePairing: "nhd:remote:pairing:start",
  updateDevicePreferences: "nhd:device:preferences:update",
  updateProfilePreferences: "nhd:profile:preferences:update"
} as const;

export const MEDIA_ACTIONS = [
  "fast-forward",
  "mute",
  "play-pause",
  "rewind",
  "volume-down",
  "volume-up"
] as const;

export type MediaAction = (typeof MEDIA_ACTIONS)[number];

export const REMOTE_ACTIONS = [
  "back",
  "down",
  "fast-forward",
  "force-home",
  "home",
  "left",
  "mute",
  "play-pause",
  "rewind",
  "right",
  "select",
  "up",
  "volume-down",
  "volume-up"
] as const;

export type RemoteAction = (typeof REMOTE_ACTIONS)[number];

export type ServiceRecoveryMode = "home" | "reload" | "retry";

export type ServiceFailureKind =
  | "crashed"
  | "load-failed"
  | "offline"
  | "resume-failed"
  | "unresponsive";

export interface ServiceRecoveryRequest {
  detail: string;
  kind: ServiceFailureKind;
  serviceId: string;
  serviceName: string;
}

export interface RemotePointerInput {
  phase: "hide" | "move" | "tap";
  scroll: number;
  scrollX: number;
  x: number;
  y: number;
}

export interface RemotePointerResult {
  snapChanged: boolean;
  snapped: boolean;
  textEntryAvailable: boolean;
}

export interface RemoteTextInput {
  submit: boolean;
  text: string;
}

export interface RemoteControlContext {
  activeServiceId: string | null;
  activeServiceName: string;
  searchLabel: string;
}

export type RemoteState = "awaiting-approval" | "inactive" | "pairing" | "ready";

export interface RemoteStatus {
  connectedControllers: number;
  detail: string;
  expiresAt: number | null;
  networkAddress: string | null;
  qrDataUrl: string | null;
  state: RemoteState;
}

export type ServiceKind = "commercial" | "custom" | "experimental" | "test";

export interface ServiceSummary {
  authenticationNote?: string;
  id: string;
  kind: ServiceKind;
  name: string;
  searchMode: "browse" | "none" | "query";
}

export interface RemoteServiceShortcut {
  id: string;
  name: string;
}

export interface ContinueWatchingItem {
  artworkDataUrl: string | null;
  durationSeconds: number;
  id: string;
  positionSeconds: number;
  serviceId: string;
  serviceName: string;
  subtitle: string | null;
  title: string;
  updatedAt: number;
}

export interface CatalogSearchResult {
  genres: string[];
  id: string;
  imageDataUrl: string | null;
  network: string | null;
  premiered: string | null;
  sourceUrl: string;
  summary: string | null;
  title: string;
}

export interface LocalProfile {
  id: string;
  name: string;
}

export interface ProfilePreferences {
  enabledServiceIds: string[];
  favoriteServiceIds: string[];
  serviceOrder: string[];
}

export const AMBIENT_CLOCK_STYLES = [
  "digital",
  "analog",
  "minimal",
  "flip",
  "neon",
  "orbit"
] as const;

export type AmbientClockStyle = (typeof AMBIENT_CLOCK_STYLES)[number];

export interface DevicePreferences {
  ambientClockStyle: AmbientClockStyle;
  ambientDisplayDelayMinutes: 5 | 10 | 30;
  ambientDisplayEnabled: boolean;
  autoApproveFirstRemote: boolean;
  fullscreen: boolean;
  reducedMotion: boolean;
  safeArea: "compact" | "standard" | "wide";
  selectedDisplayId: string | null;
  youtubeTvModeEnabled: boolean;
  youtubeTvScale: "compact" | "standard" | "large";
}

export interface YouTubeTvModePreferences {
  enabled: boolean;
  safeArea: DevicePreferences["safeArea"];
  scale: DevicePreferences["youtubeTvScale"];
}

export interface LocalAppState {
  activeProfileId: string;
  customServices: CustomServiceManifest[];
  devicePreferences: DevicePreferences;
  preferences: ProfilePreferences;
  profiles: LocalProfile[];
  recentServiceIds: string[];
}

export interface CustomServiceManifest {
  id: string;
  name: string;
  startUrl: string;
}

export interface ServiceQuitRequest {
  backgroundDataUrl: string | null;
  serviceId: string;
  serviceName: string;
}

export type WidevineState = "checking" | "ready" | "timed-out" | "unavailable";

export interface HostStatus {
  activeServiceId: string | null;
  display: {
    count: number;
    id: string | null;
    label: string;
  };
  diagnostics: {
    gpuProcess: ProcessDiagnostics | null;
    hardwareAcceleration: boolean | null;
    serviceRenderer: ProcessDiagnostics | null;
    videoDecode: string;
    vpxDecode: string;
  };
  fullscreen: {
    serviceHtml: boolean;
    window: boolean;
  };
  navigation: {
    lastBlocked: NavigationDiagnostic | null;
  };
  playback: {
    active: boolean;
    backgrounded: boolean;
  };
  runtime: {
    chrome: string;
    electron: string;
    node: string;
  };
  widevine: {
    details: string;
    state: WidevineState;
  };
}

export interface NavigationDiagnostic {
  kind: "navigation" | "popup" | "redirect";
  origin: string;
  serviceId: string;
}

export interface ProcessDiagnostics {
  cpuPercent: number;
  memoryMegabytes: number;
  sandboxed: boolean | null;
}
