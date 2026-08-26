import { contextBridge, ipcRenderer } from "electron";
import type {
  HostStatus,
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
  closeService: "nhd:service:close",
  confirmServiceQuit: "nhd:service:quit:confirm",
  denyRemotePairing: "nhd:remote:pairing:deny",
  getServices: "nhd:service:list",
  getHostStatus: "nhd:host:status:get",
  getRemoteStatus: "nhd:remote:status:get",
  hostStatusChanged: "nhd:host:status:changed",
  openService: "nhd:service:open",
  remoteAction: "nhd:remote:action",
  remoteStatusChanged: "nhd:remote:status:changed",
  serviceQuitRequested: "nhd:service:quit:requested",
  startRemotePairing: "nhd:remote:pairing:start"
} as const;

contextBridge.exposeInMainWorld("nhd", {
  approveRemotePairing: (): Promise<RemoteStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.approveRemotePairing),
  cancelServiceQuit: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.cancelServiceQuit),
  closeService: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.closeService),
  confirmServiceQuit: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.confirmServiceQuit),
  denyRemotePairing: (): Promise<RemoteStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.denyRemotePairing),
  getServices: (): Promise<readonly ServiceSummary[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.getServices),
  getHostStatus: (): Promise<HostStatus> => ipcRenderer.invoke(IPC_CHANNELS.getHostStatus),
  getRemoteStatus: (): Promise<RemoteStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.getRemoteStatus),
  onHostStatusChanged: (callback: (status: HostStatus) => void): void => {
    ipcRenderer.on(IPC_CHANNELS.hostStatusChanged, (_event, status: HostStatus) => {
      callback(status);
    });
  },
  onRemoteAction: (callback: (action: RemoteAction) => void): void => {
    ipcRenderer.on(IPC_CHANNELS.remoteAction, (_event, action: RemoteAction) => {
      callback(action);
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
  startRemotePairing: (): Promise<RemoteStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.startRemotePairing)
});
