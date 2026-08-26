import { contextBridge, ipcRenderer } from "electron";
import type {
  ContinueWatchingItem,
  HostStatus,
  LocalAppState,
  ProfilePreferences,
  RemoteAction,
  RemoteStatus,
  ServiceQuitRequest,
  ServiceSummary
} from "./contracts";

// Sandboxed preloads receive a restricted `require` implementation and must not
// load local CommonJS modules at runtime. Keep channel names self-contained here;
// the HostStatus import is type-only and is erased by TypeScript.
const IPC_CHANNELS = {
  approveRemotePairing: "nhd:remote:pairing:approve",
  cancelServiceQuit: "nhd:service:quit:cancel",
  clearServiceData: "nhd:service:data:clear",
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
  resumeContinueWatching: "nhd:continue-watching:resume",
  searchService: "nhd:service:search",
  selectProfile: "nhd:profile:select",
  serviceQuitRequested: "nhd:service:quit:requested",
  startRemotePairing: "nhd:remote:pairing:start",
  updateProfilePreferences: "nhd:profile:preferences:update"
} as const;

contextBridge.exposeInMainWorld("nhd", {
  approveRemotePairing: (): Promise<RemoteStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.approveRemotePairing),
  cancelServiceQuit: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.cancelServiceQuit),
  clearServiceData: (serviceId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.clearServiceData, serviceId),
  closeService: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.closeService),
  confirmServiceQuit: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.confirmServiceQuit),
  createProfile: (name: string): Promise<LocalAppState> =>
    ipcRenderer.invoke(IPC_CHANNELS.createProfile, name),
  denyRemotePairing: (): Promise<RemoteStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.denyRemotePairing),
  getServices: (): Promise<readonly ServiceSummary[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.getServices),
  getContinueWatching: (): Promise<readonly ContinueWatchingItem[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.getContinueWatching),
  getHostStatus: (): Promise<HostStatus> => ipcRenderer.invoke(IPC_CHANNELS.getHostStatus),
  getLocalAppState: (): Promise<LocalAppState> =>
    ipcRenderer.invoke(IPC_CHANNELS.getLocalAppState),
  getRemoteStatus: (): Promise<RemoteStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.getRemoteStatus),
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
  onRemoteAction: (callback: (action: RemoteAction) => void): void => {
    ipcRenderer.on(IPC_CHANNELS.remoteAction, (_event, action: RemoteAction) => {
      callback(action);
    });
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
  onServiceQuitRequested: (callback: (request: ServiceQuitRequest) => void): void => {
    ipcRenderer.on(IPC_CHANNELS.serviceQuitRequested, (_event, request: ServiceQuitRequest) => {
      callback(request);
    });
  },
  openService: (serviceId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.openService, serviceId),
  removeContinueWatching: (itemId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.removeContinueWatching, itemId),
  resumeContinueWatching: (itemId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.resumeContinueWatching, itemId),
  searchService: (serviceId: string, query: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.searchService, serviceId, query),
  selectProfile: (profileId: string): Promise<LocalAppState> =>
    ipcRenderer.invoke(IPC_CHANNELS.selectProfile, profileId),
  startRemotePairing: (): Promise<RemoteStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.startRemotePairing),
  updateProfilePreferences: (preferences: ProfilePreferences): Promise<LocalAppState> =>
    ipcRenderer.invoke(IPC_CHANNELS.updateProfilePreferences, preferences)
});
