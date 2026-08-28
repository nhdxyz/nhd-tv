import { contextBridge, ipcRenderer } from "electron";
import type {
  CatalogSearchResult,
  ContinueWatchingItem,
  DevicePreferences,
  HostStatus,
  LocalAppState,
  OpenAiCredentialStatus,
  ProfilePreferences,
  RemoteAction,
  RemoteStatus,
  ServiceRecoveryMode,
  ServiceRecoveryRequest,
  ServiceQuitRequest,
  ServiceSummary,
  SpotifyPlaybackPresentation,
  VoicePresentationState
} from "./contracts";

// Sandboxed preloads receive a restricted `require` implementation and must not
// load local CommonJS modules at runtime. Keep channel names self-contained here;
// the HostStatus import is type-only and is erased by TypeScript.
const IPC_CHANNELS = {
  addCustomService: "nhd:custom-service:add",
  ambientDisplayChanged: "nhd:ambient-display:changed",
  approveRemotePairing: "nhd:remote:pairing:approve",
  cancelServiceQuit: "nhd:service:quit:cancel",
  clearOpenAiApiKey: "nhd:openai:credential:clear",
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
  getOpenAiCredentialStatus: "nhd:openai:credential:status",
  getRemoteStatus: "nhd:remote:status:get",
  getSpotifyPlayback: "nhd:spotify:playback:get",
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
  saveOpenAiApiKey: "nhd:openai:credential:save",
  selectProfile: "nhd:profile:select",
  serviceRecoveryRequested: "nhd:service:recovery:requested",
  serviceQuitRequested: "nhd:service:quit:requested",
  spotifyPlaybackChanged: "nhd:spotify:playback:changed",
  startRemotePairing: "nhd:remote:pairing:start",
  updateDevicePreferences: "nhd:device:preferences:update",
  updateProfilePreferences: "nhd:profile:preferences:update",
  voicePresentationChanged: "nhd:voice:presentation:changed"
} as const;

const VOICE_PRESENTATION_PHASES = new Set([
  "error",
  "hidden",
  "listening",
  "success",
  "transcript",
  "understanding"
]);

function isBoundedNullableText(value: unknown, maximumLength: number): boolean {
  return value === null || (
    typeof value === "string" &&
    value.length <= maximumLength &&
    !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)
  );
}

function isVoicePresentationState(value: unknown): value is VoicePresentationState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<VoicePresentationState>;
  return typeof candidate.phase === "string" &&
    VOICE_PRESENTATION_PHASES.has(candidate.phase) &&
    isBoundedNullableText(candidate.detail, 280) &&
    isBoundedNullableText(candidate.transcript, 320) &&
    (candidate.phase === "transcript" || candidate.transcript === null) &&
    (candidate.phase !== "hidden" || (candidate.detail === null && candidate.transcript === null));
}

contextBridge.exposeInMainWorld("nhd", {
  addCustomService: (name: string, startUrl: string): Promise<LocalAppState> =>
    ipcRenderer.invoke(IPC_CHANNELS.addCustomService, name, startUrl),
  approveRemotePairing: (): Promise<RemoteStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.approveRemotePairing),
  cancelServiceQuit: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.cancelServiceQuit),
  clearServiceData: (serviceId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.clearServiceData, serviceId),
  clearOpenAiApiKey: (): Promise<OpenAiCredentialStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.clearOpenAiApiKey),
  cycleDisplay: (): Promise<LocalAppState> =>
    ipcRenderer.invoke(IPC_CHANNELS.cycleDisplay),
  closeService: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.closeService),
  confirmServiceQuit: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.confirmServiceQuit),
  createProfile: (name: string): Promise<LocalAppState> =>
    ipcRenderer.invoke(IPC_CHANNELS.createProfile, name),
  denyRemotePairing: (): Promise<RemoteStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.denyRemotePairing),
  dismissAmbientDisplay: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.dismissAmbientDisplay),
  getServices: (): Promise<readonly ServiceSummary[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.getServices),
  getContinueWatching: (): Promise<readonly ContinueWatchingItem[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.getContinueWatching),
  getHostStatus: (): Promise<HostStatus> => ipcRenderer.invoke(IPC_CHANNELS.getHostStatus),
  getLocalAppState: (): Promise<LocalAppState> =>
    ipcRenderer.invoke(IPC_CHANNELS.getLocalAppState),
  getOpenAiCredentialStatus: (): Promise<OpenAiCredentialStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.getOpenAiCredentialStatus),
  getRemoteStatus: (): Promise<RemoteStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.getRemoteStatus),
  getSpotifyPlayback: (): Promise<SpotifyPlaybackPresentation> =>
    ipcRenderer.invoke(IPC_CHANNELS.getSpotifyPlayback),
  sendInputAction: (action: RemoteAction): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.inputAction, action),
  onHostStatusChanged: (callback: (status: HostStatus) => void): void => {
    ipcRenderer.on(IPC_CHANNELS.hostStatusChanged, (_event, status: HostStatus) => {
      callback(status);
    });
  },
  onContinueWatchingChanged: (
    callback: (items: readonly ContinueWatchingItem[]) => void
  ): void => {
    ipcRenderer.on(
      IPC_CHANNELS.continueWatchingChanged,
      (_event, items: readonly ContinueWatchingItem[]) => callback(items)
    );
  },
  onAmbientDisplayChanged: (callback: (visible: boolean) => void): void => {
    ipcRenderer.on(IPC_CHANNELS.ambientDisplayChanged, (_event, visible: boolean) => {
      callback(visible);
    });
  },
  onRemoteAction: (callback: (action: RemoteAction) => void): void => {
    ipcRenderer.on(IPC_CHANNELS.remoteAction, (_event, action: RemoteAction) => {
      callback(action);
    });
  },
  onRemotePrecisionMoved: (callback: () => void): void => {
    ipcRenderer.on(IPC_CHANNELS.remotePrecisionMoved, () => callback());
  },
  onRemoteSearchRequested: (callback: (query: string) => void): void => {
    ipcRenderer.on(IPC_CHANNELS.remoteSearchRequested, (_event, query: string) => {
      callback(query);
    });
  },
  onRemoteStatusChanged: (callback: (status: RemoteStatus) => void): void => {
    ipcRenderer.on(IPC_CHANNELS.remoteStatusChanged, (_event, status: RemoteStatus) => {
      callback(status);
    });
  },
  onSpotifyPlaybackChanged: (
    callback: (presentation: SpotifyPlaybackPresentation) => void
  ): void => {
    ipcRenderer.on(
      IPC_CHANNELS.spotifyPlaybackChanged,
      (_event, presentation: SpotifyPlaybackPresentation) => callback(presentation)
    );
  },
  onVoicePresentationChanged: (
    callback: (presentation: VoicePresentationState) => void
  ): void => {
    ipcRenderer.on(
      IPC_CHANNELS.voicePresentationChanged,
      (_event, presentation: unknown) => {
        if (isVoicePresentationState(presentation)) callback(presentation);
      }
    );
  },
  onServiceQuitRequested: (callback: (request: ServiceQuitRequest) => void): void => {
    ipcRenderer.on(IPC_CHANNELS.serviceQuitRequested, (_event, request: ServiceQuitRequest) => {
      callback(request);
    });
  },
  onServiceRecoveryRequested: (
    callback: (request: ServiceRecoveryRequest) => void
  ): void => {
    ipcRenderer.on(
      IPC_CHANNELS.serviceRecoveryRequested,
      (_event, request: ServiceRecoveryRequest) => callback(request)
    );
  },
  openService: (serviceId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.openService, serviceId),
  previewAmbientDisplay: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.previewAmbientDisplay),
  removeContinueWatching: (itemId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.removeContinueWatching, itemId),
  removeCustomService: (serviceId: string): Promise<LocalAppState> =>
    ipcRenderer.invoke(IPC_CHANNELS.removeCustomService, serviceId),
  recoverService: (mode: ServiceRecoveryMode): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.recoverService, mode),
  resumeContinueWatching: (itemId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.resumeContinueWatching, itemId),
  searchCatalog: (query: string): Promise<readonly CatalogSearchResult[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.searchCatalog, query),
  searchService: (serviceId: string, query: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.searchService, serviceId, query),
  saveOpenAiApiKey: (apiKey: string): Promise<OpenAiCredentialStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.saveOpenAiApiKey, apiKey),
  selectProfile: (profileId: string): Promise<LocalAppState> =>
    ipcRenderer.invoke(IPC_CHANNELS.selectProfile, profileId),
  startRemotePairing: (): Promise<RemoteStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.startRemotePairing),
  updateProfilePreferences: (preferences: ProfilePreferences): Promise<LocalAppState> =>
    ipcRenderer.invoke(IPC_CHANNELS.updateProfilePreferences, preferences),
  updateDevicePreferences: (preferences: DevicePreferences): Promise<LocalAppState> =>
    ipcRenderer.invoke(IPC_CHANNELS.updateDevicePreferences, preferences)
});
