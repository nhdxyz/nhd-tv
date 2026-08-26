import type { HostStatus, ServiceSummary } from "../main/contracts";

declare global {
  interface Window {
    nhd: {
      closeService: () => Promise<void>;
      getServices: () => Promise<readonly ServiceSummary[]>;
      getHostStatus: () => Promise<HostStatus>;
      onHostStatusChanged: (callback: (status: HostStatus) => void) => void;
      openService: (serviceId: string) => Promise<void>;
    };
  }
}

export {};
