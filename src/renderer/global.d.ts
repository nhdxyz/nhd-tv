import type {
  CatalogSearchResult,
  ContinueWatchingItem,
  DevicePreferences,
  HostStatus,
  LocalAppState,
  OpenAiCredentialStatus,
  ProfilePreferences,
  RemoteAction,
  RemoteStatus,
  ServiceRecoveryMode,
  ServiceRecoveryRequest,
  ServiceQuitRequest,
  ServiceSummary,
  SpotifyPlaybackPresentation,
  VoicePresentationState
} from "../main/contracts";

declare global {
  interface Window {
    nhd: {
      addCustomService: (name: string, startUrl: string) => Promise<LocalAppState>;
      approveRemotePairing: () => Promise<RemoteStatus>;
      cancelServiceQuit: () => Promise<void>;
      clearServiceData: (serviceId: string) => Promise<void>;
      clearOpenAiApiKey: () => Promise<OpenAiCredentialStatus>;
      cycleDisplay: () => Promise<LocalAppState>;
      closeService: () => Promise<void>;
      confirmServiceQuit: () => Promise<void>;
      createProfile: (name: string) => Promise<LocalAppState>;
      denyRemotePairing: () => Promise<RemoteStatus>;
      dismissAmbientDisplay: () => Promise<void>;
      getContinueWatching: () => Promise<readonly ContinueWatchingItem[]>;
      getServices: () => Promise<readonly ServiceSummary[]>;
      getHostStatus: () => Promise<HostStatus>;
      getLocalAppState: () => Promise<LocalAppState>;
      getOpenAiCredentialStatus: () => Promise<OpenAiCredentialStatus>;
      getRemoteStatus: () => Promise<RemoteStatus>;
      getSpotifyPlayback: () => Promise<SpotifyPlaybackPresentation>;
      sendInputAction: (action: RemoteAction) => Promise<boolean>;
      onAmbientDisplayChanged: (callback: (visible: boolean) => void) => void;
      onHostStatusChanged: (callback: (status: HostStatus) => void) => void;
      onContinueWatchingChanged: (
        callback: (items: readonly ContinueWatchingItem[]) => void
      ) => void;
      onRemoteAction: (callback: (action: RemoteAction) => void) => void;
      onRemotePrecisionMoved: (callback: () => void) => void;
      onRemoteSearchRequested: (callback: (query: string) => void) => void;
      onRemoteStatusChanged: (callback: (status: RemoteStatus) => void) => void;
      onSpotifyPlaybackChanged: (
        callback: (presentation: SpotifyPlaybackPresentation) => void
      ) => void;
      onVoicePresentationChanged: (
        callback: (presentation: VoicePresentationState) => void
      ) => void;
      onServiceQuitRequested: (callback: (request: ServiceQuitRequest) => void) => void;
      onServiceRecoveryRequested: (
        callback: (request: ServiceRecoveryRequest) => void
      ) => void;
      openService: (serviceId: string) => Promise<void>;
      previewAmbientDisplay: () => Promise<boolean>;
      removeContinueWatching: (itemId: string) => Promise<boolean>;
      removeCustomService: (serviceId: string) => Promise<LocalAppState>;
      recoverService: (mode: ServiceRecoveryMode) => Promise<boolean>;
      resumeContinueWatching: (itemId: string) => Promise<void>;
      searchCatalog: (query: string) => Promise<readonly CatalogSearchResult[]>;
      searchService: (serviceId: string, query: string) => Promise<void>;
      saveOpenAiApiKey: (apiKey: string) => Promise<OpenAiCredentialStatus>;
      selectProfile: (profileId: string) => Promise<LocalAppState>;
      startRemotePairing: () => Promise<RemoteStatus>;
      updateProfilePreferences: (preferences: ProfilePreferences) => Promise<LocalAppState>;
      updateDevicePreferences: (preferences: Partial<DevicePreferences>) => Promise<LocalAppState>;
    };
  }
}

export {};
