export const IPC_CHANNELS = {
  addCustomService: "nhd:custom-service:add",
  approveRemotePairing: "nhd:remote:pairing:approve",
  cancelServiceQuit: "nhd:service:quit:cancel",
  clearServiceData: "nhd:service:data:clear",
  cycleDisplay: "nhd:display:cycle",
  closeService: "nhd:service:close",
  continueWatchingChanged: "nhd:continue-watching:changed",
  confirmServiceQuit: "nhd:service:quit:confirm",
  createProfile: "nhd:profile:create",
  denyRemotePairing: "nhd:remote:pairing:deny",
  getContinueWatching: "nhd:continue-watching:list",
  getServices: "nhd:service:list",
  getHostStatus: "nhd:host:status:get",
  getLocalAppState: "nhd:local-state:get",
  getRemoteStatus: "nhd:remote:status:get",
  hostStatusChanged: "nhd:host:status:changed",
  inputAction: "nhd:input:action",
  openService: "nhd:service:open",
  remoteAction: "nhd:remote:action",
  remoteSearchRequested: "nhd:remote:search:requested",
  remoteStatusChanged: "nhd:remote:status:changed",
  removeContinueWatching: "nhd:continue-watching:remove",
  removeCustomService: "nhd:custom-service:remove",
  resumeContinueWatching: "nhd:continue-watching:resume",
  searchService: "nhd:service:search",
  selectProfile: "nhd:profile:select",
  serviceQuitRequested: "nhd:service:quit:requested",
  startRemotePairing: "nhd:remote:pairing:start",
  updateDevicePreferences: "nhd:device:preferences:update",
  updateProfilePreferences: "nhd:profile:preferences:update"
} as const;

export const REMOTE_ACTIONS = [
  "back",
  "down",
  "home",
  "left",
  "right",
  "select",
  "up"
] as const;

export type RemoteAction = (typeof REMOTE_ACTIONS)[number];

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

export interface LocalProfile {
  id: string;
  name: string;
}

export interface ProfilePreferences {
  enabledServiceIds: string[];
  favoriteServiceIds: string[];
  serviceOrder: string[];
}

export interface DevicePreferences {
  fullscreen: boolean;
  reducedMotion: boolean;
  safeArea: "compact" | "standard" | "wide";
  selectedDisplayId: string | null;
}

export interface LocalAppState {
  activeProfileId: string;
  customServices: CustomServiceManifest[];
  devicePreferences: DevicePreferences;
  preferences: ProfilePreferences;
  profiles: LocalProfile[];
}

export interface CustomServiceManifest {
  id: string;
  name: string;
  startUrl: string;
}

export interface ServiceQuitRequest {
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
