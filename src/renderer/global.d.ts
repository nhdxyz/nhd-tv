import type {
  HostStatus,
  RemoteAction,
  RemoteStatus,
  ServiceSummary
} from "../main/contracts";

declare global {
  interface Window {
    nhd: {
      approveRemotePairing: () => Promise<RemoteStatus>;
      closeService: () => Promise<void>;
      denyRemotePairing: () => Promise<RemoteStatus>;
      getServices: () => Promise<readonly ServiceSummary[]>;
      getHostStatus: () => Promise<HostStatus>;
      getRemoteStatus: () => Promise<RemoteStatus>;
      onHostStatusChanged: (callback: (status: HostStatus) => void) => void;
      onRemoteAction: (callback: (action: RemoteAction) => void) => void;
      onRemoteStatusChanged: (callback: (status: RemoteStatus) => void) => void;
      openService: (serviceId: string) => Promise<void>;
      startRemotePairing: () => Promise<RemoteStatus>;
    };
  }
}

export {};
