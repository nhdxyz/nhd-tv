import type {
  CatalogSearchResult,
  ContinueWatchingItem,
  DevicePreferences,
  HostStatus,
  LocalAppState,
  ProfilePreferences,
  RemoteAction,
  RemoteStatus,
  ServiceQuitRequest,
  ServiceSummary
} from "../main/contracts";

declare global {
  interface Window {
    nhd: {
      addCustomService: (name: string, startUrl: string) => Promise<LocalAppState>;
      approveRemotePairing: () => Promise<RemoteStatus>;
      cancelServiceQuit: () => Promise<void>;
      clearServiceData: (serviceId: string) => Promise<void>;
      cycleDisplay: () => Promise<LocalAppState>;
      closeService: () => Promise<void>;
      confirmServiceQuit: () => Promise<void>;
      createProfile: (name: string) => Promise<LocalAppState>;
      denyRemotePairing: () => Promise<RemoteStatus>;
      getContinueWatching: () => Promise<readonly ContinueWatchingItem[]>;
      getServices: () => Promise<readonly ServiceSummary[]>;
      getHostStatus: () => Promise<HostStatus>;
      getLocalAppState: () => Promise<LocalAppState>;
      getRemoteStatus: () => Promise<RemoteStatus>;
      sendInputAction: (action: RemoteAction) => Promise<boolean>;
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
      removeCustomService: (serviceId: string) => Promise<LocalAppState>;
      resumeContinueWatching: (itemId: string) => Promise<void>;
      searchCatalog: (query: string) => Promise<readonly CatalogSearchResult[]>;
      searchService: (serviceId: string, query: string) => Promise<void>;
      selectProfile: (profileId: string) => Promise<LocalAppState>;
      startRemotePairing: () => Promise<RemoteStatus>;
      updateProfilePreferences: (preferences: ProfilePreferences) => Promise<LocalAppState>;
      updateDevicePreferences: (preferences: DevicePreferences) => Promise<LocalAppState>;
    };
  }
}

export {};
