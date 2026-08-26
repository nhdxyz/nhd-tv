export const IPC_CHANNELS = {
  closeService: "nhd:service:close",
  getServices: "nhd:service:list",
  getHostStatus: "nhd:host:status:get",
  hostStatusChanged: "nhd:host:status:changed",
  openService: "nhd:service:open"
} as const;

export type ServiceKind = "commercial" | "test";

export interface ServiceSummary {
  authenticationNote?: string;
  id: string;
  kind: ServiceKind;
  name: string;
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
