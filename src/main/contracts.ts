export const IPC_CHANNELS = {
  approveRemotePairing: "nhd:remote:pairing:approve",
  cancelServiceQuit: "nhd:service:quit:cancel",
  closeService: "nhd:service:close",
  continueWatchingChanged: "nhd:continue-watching:changed",
  confirmServiceQuit: "nhd:service:quit:confirm",
  denyRemotePairing: "nhd:remote:pairing:deny",
  getContinueWatching: "nhd:continue-watching:list",
  getServices: "nhd:service:list",
  getHostStatus: "nhd:host:status:get",
  getRemoteStatus: "nhd:remote:status:get",
  hostStatusChanged: "nhd:host:status:changed",
  openService: "nhd:service:open",
  remoteAction: "nhd:remote:action",
  remoteSearchRequested: "nhd:remote:search:requested",
  remoteStatusChanged: "nhd:remote:status:changed",
  removeContinueWatching: "nhd:continue-watching:remove",
  resumeContinueWatching: "nhd:continue-watching:resume",
  searchService: "nhd:service:search",
  serviceQuitRequested: "nhd:service:quit:requested",
  startRemotePairing: "nhd:remote:pairing:start"
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

export type ServiceKind = "commercial" | "test";

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

export interface ServiceQuitRequest {
  serviceId: string;
  serviceName: string;
}

export type WidevineState = "checking" | "ready" | "timed-out" | "unavailable";

export interface HostStatus {
  activeServiceId: string | null;
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
