import type {
  HostStatus,
  RemoteAction,
  RemoteStatus,
  ServiceQuitRequest,
  ServiceSummary
} from "../main/contracts";

declare global {
  interface Window {
    nhd: {
      approveRemotePairing: () => Promise<RemoteStatus>;
      cancelServiceQuit: () => Promise<void>;
      closeService: () => Promise<void>;
      confirmServiceQuit: () => Promise<void>;
      denyRemotePairing: () => Promise<RemoteStatus>;
      getServices: () => Promise<readonly ServiceSummary[]>;
      getHostStatus: () => Promise<HostStatus>;
      getRemoteStatus: () => Promise<RemoteStatus>;
      onHostStatusChanged: (callback: (status: HostStatus) => void) => void;
      onRemoteAction: (callback: (action: RemoteAction) => void) => void;
      onRemoteStatusChanged: (callback: (status: RemoteStatus) => void) => void;
      onServiceQuitRequested: (callback: (request: ServiceQuitRequest) => void) => void;
      openService: (serviceId: string) => Promise<void>;
      startRemotePairing: () => Promise<RemoteStatus>;
    };
  }
}

export {};
