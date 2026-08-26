import type {
  ContinueWatchingItem,
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
      getContinueWatching: () => Promise<readonly ContinueWatchingItem[]>;
      getServices: () => Promise<readonly ServiceSummary[]>;
      getHostStatus: () => Promise<HostStatus>;
      getRemoteStatus: () => Promise<RemoteStatus>;
      onHostStatusChanged: (callback: (status: HostStatus) => void) => void;
      onContinueWatchingChanged: (
        callback: (items: readonly ContinueWatchingItem[]) => void
      ) => void;
      onRemoteAction: (callback: (action: RemoteAction) => void) => void;
      onRemoteSearchRequested: (callback: (query: string) => void) => void;
      onRemoteStatusChanged: (callback: (status: RemoteStatus) => void) => void;
      onServiceQuitRequested: (callback: (request: ServiceQuitRequest) => void) => void;
      openService: (serviceId: string) => Promise<void>;
      removeContinueWatching: (itemId: string) => Promise<boolean>;
      resumeContinueWatching: (itemId: string) => Promise<void>;
      searchService: (serviceId: string, query: string) => Promise<void>;
      startRemotePairing: () => Promise<RemoteStatus>;
    };
  }
}

export {};
