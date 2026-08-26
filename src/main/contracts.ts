export const IPC_CHANNELS = {
  closeService: "nhd:service:close",
  getServices: "nhd:service:list",
  getHostStatus: "nhd:host:status:get",
  hostStatusChanged: "nhd:host:status:changed",
  openService: "nhd:service:open"
} as const;

export type ServiceKind = "commercial" | "test";

export interface ServiceSummary {
  id: string;
  kind: ServiceKind;
  name: string;
}

export type WidevineState = "checking" | "ready" | "timed-out" | "unavailable";

export interface HostStatus {
  activeServiceId: string | null;
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
