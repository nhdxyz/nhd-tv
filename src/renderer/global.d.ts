import type { HostStatus } from "../main/contracts";

declare global {
  interface Window {
    nhd: {
      closeService: () => Promise<void>;
      getHostStatus: () => Promise<HostStatus>;
      onHostStatusChanged: (callback: (status: HostStatus) => void) => void;
      openService: (serviceId: string) => Promise<void>;
    };
  }
}

export {};
