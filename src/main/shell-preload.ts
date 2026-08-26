import { contextBridge, ipcRenderer } from "electron";
import type { HostStatus, ServiceSummary } from "./contracts";

// Sandboxed preloads receive a restricted `require` implementation and must not
// load local CommonJS modules at runtime. Keep channel names self-contained here;
// the HostStatus import is type-only and is erased by TypeScript.
const IPC_CHANNELS = {
  closeService: "nhd:service:close",
  getServices: "nhd:service:list",
  getHostStatus: "nhd:host:status:get",
  hostStatusChanged: "nhd:host:status:changed",
  openService: "nhd:service:open"
} as const;

contextBridge.exposeInMainWorld("nhd", {
  closeService: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.closeService),
  getServices: (): Promise<readonly ServiceSummary[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.getServices),
  getHostStatus: (): Promise<HostStatus> => ipcRenderer.invoke(IPC_CHANNELS.getHostStatus),
  onHostStatusChanged: (callback: (status: HostStatus) => void): void => {
    ipcRenderer.on(IPC_CHANNELS.hostStatusChanged, (_event, status: HostStatus) => {
      callback(status);
    });
  },
  openService: (serviceId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.openService, serviceId)
});
