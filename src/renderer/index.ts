import "./style.css";
import {
  AMBIENT_CLOCK_STYLES,
  type AmbientClockStyle,
  type CatalogSearchResult,
  type ContinueWatchingItem,
  type HostStatus,
  type LocalAppState,
  type OpenAiCredentialStatus,
  type RemoteAction,
  type RemoteStatus,
  type ServiceRecoveryMode,
  type ServiceRecoveryRequest,
  type ServiceSummary,
  type SpotifyPlaybackPresentation,
  type VoicePresentationState,
  type VoiceSetupDiagnostic
} from "../main/contracts";
import {
  isMediaAction,
  mediaActionForKeyInput
} from "../main/media-actions";
import { GamepadInput, type GamepadLike } from "./gamepad-input";
import { NavigationSounds, voiceSoundCue } from "./navigation-sounds";
import { presentContinueWatching } from "./content-presentation";
import { matchContinueWatching } from "./search-history";
import { createServiceLockup, createServiceMark } from "./service-branding";
import {
  findDirectionalTarget,
  type SpatialDirection
} from "./spatial-navigation";
import { voicePresentationCopy } from "./voice-presentation";

type AppView = "apps" | "home" | "settings" | "store";

const REMOTE_ONBOARDING_STORAGE_KEY = "nhd-phone-remote-onboarding-v1";

const AMBIENT_CLOCK_LABELS: Record<AmbientClockStyle, string> = {
  analog: "Analog",
  digital: "Digital",
  flip: "Flip",
  minimal: "Minimal",
  neon: "Neon",
  orbit: "Orbit"
};

function requireElement<T>(selector: string, name: string): T {
  const element = document.querySelector(selector);

  if (element === null) {
    throw new Error(`Missing renderer element: ${name}`);
  }

  return element as T;
}

const elements = {
  actionNotice: requireElement<HTMLElement>("#action-notice", "action-notice"),
  actionNoticeDetail: requireElement<HTMLElement>("#action-notice-detail", "action-notice-detail"),
  actionNoticeDismiss: requireElement<HTMLButtonElement>("#action-notice-dismiss", "action-notice-dismiss"),
  actionNoticeMark: requireElement<HTMLElement>("#action-notice-mark", "action-notice-mark"),
  actionNoticeRetry: requireElement<HTMLButtonElement>("#action-notice-retry", "action-notice-retry"),
  actionNoticeTitle: requireElement<HTMLElement>("#action-notice-title", "action-notice-title"),
  ambientAnalogHour: requireElement<HTMLElement>("#ambient-analog-hour", "ambient-analog-hour"),
  ambientAnalogMinute: requireElement<HTMLElement>("#ambient-analog-minute", "ambient-analog-minute"),
  ambientClockStyle: requireElement<HTMLButtonElement>("#ambient-clock-style", "ambient-clock-style"),
  ambientClockStyleCopy: requireElement<HTMLElement>("#ambient-clock-style-copy", "ambient-clock-style-copy"),
  ambientDates: Array.from(document.querySelectorAll<HTMLElement>(".ambient-date")),
  ambientDigitalTime: requireElement<HTMLTimeElement>("#ambient-digital-time", "ambient-digital-time"),
  ambientDisplay: requireElement<HTMLElement>("#ambient-display", "ambient-display"),
  ambientDisplayCopy: requireElement<HTMLElement>("#ambient-display-copy", "ambient-display-copy"),
  ambientDisplayDelay: requireElement<HTMLButtonElement>("#ambient-display-delay", "ambient-display-delay"),
  ambientDisplayDelayCopy: requireElement<HTMLElement>("#ambient-display-delay-copy", "ambient-display-delay-copy"),
  ambientDisplayPreview: requireElement<HTMLButtonElement>("#ambient-display-preview", "ambient-display-preview"),
  ambientDisplayToggle: requireElement<HTMLButtonElement>("#ambient-display-toggle", "ambient-display-toggle"),
  ambientFlipHour: requireElement<HTMLElement>("#ambient-flip-hour", "ambient-flip-hour"),
  ambientFlipMinute: requireElement<HTMLElement>("#ambient-flip-minute", "ambient-flip-minute"),
  ambientFlipPeriod: requireElement<HTMLElement>("#ambient-flip-period", "ambient-flip-period"),
  ambientFlipTime: requireElement<HTMLTimeElement>("#ambient-flip-time", "ambient-flip-time"),
  ambientMinimalHour: requireElement<HTMLElement>("#ambient-minimal-hour", "ambient-minimal-hour"),
  ambientMinimalMinute: requireElement<HTMLElement>("#ambient-minimal-minute", "ambient-minimal-minute"),
  ambientMinimalPeriod: requireElement<HTMLElement>("#ambient-minimal-period", "ambient-minimal-period"),
  ambientNeonTime: requireElement<HTMLTimeElement>("#ambient-neon-time", "ambient-neon-time"),
  ambientOrbitFace: requireElement<HTMLElement>("#ambient-orbit-face", "ambient-orbit-face"),
  ambientOrbitTime: requireElement<HTMLTimeElement>("#ambient-orbit-time", "ambient-orbit-time"),
  ambientStage: requireElement<HTMLElement>("#ambient-stage", "ambient-stage"),
  spotifyAmbientBackdrop: requireElement<HTMLImageElement>("#spotify-ambient-backdrop", "spotify-ambient-backdrop"),
  appManageBrand: requireElement<HTMLDivElement>("#app-manage-brand", "app-manage-brand"),
  appManageClear: requireElement<HTMLButtonElement>("#app-manage-clear", "app-manage-clear"),
  appManageClose: requireElement<HTMLButtonElement>("#app-manage-close", "app-manage-close"),
  appManageDelete: requireElement<HTMLButtonElement>("#app-manage-delete", "app-manage-delete"),
  appManageDialog: requireElement<HTMLDialogElement>("#app-manage-dialog", "app-manage-dialog"),
  appManageEarlier: requireElement<HTMLButtonElement>("#app-manage-earlier", "app-manage-earlier"),
  appManageFavorite: requireElement<HTMLButtonElement>("#app-manage-favorite", "app-manage-favorite"),
  appManageLater: requireElement<HTMLButtonElement>("#app-manage-later", "app-manage-later"),
  appManageName: requireElement<HTMLElement>("#app-manage-name", "app-manage-name"),
  appManageOpen: requireElement<HTMLButtonElement>("#app-manage-open", "app-manage-open"),
  appManageRemove: requireElement<HTMLButtonElement>("#app-manage-remove", "app-manage-remove"),
  appManageStatus: requireElement<HTMLElement>("#app-manage-status", "app-manage-status"),
  appsAddButton: requireElement<HTMLButtonElement>("#apps-add-button", "apps-add-button"),
  appsActions: requireElement<HTMLDivElement>("#apps-actions", "apps-actions"),
  catalogSearchResults: requireElement<HTMLDivElement>("#catalog-search-results", "catalog-search-results"),
  catalogSearchSection: requireElement<HTMLElement>("#catalog-search-section", "catalog-search-section"),
  catalogSearchStatus: requireElement<HTMLSpanElement>("#catalog-search-status", "catalog-search-status"),
  clearDataCancel: requireElement<HTMLButtonElement>("#clear-data-cancel", "clear-data-cancel"),
  clearDataConfirm: requireElement<HTMLButtonElement>("#clear-data-confirm", "clear-data-confirm"),
  clearDataCopy: requireElement<HTMLParagraphElement>("#clear-data-copy", "clear-data-copy"),
  clearDataDialog: requireElement<HTMLDialogElement>("#clear-data-dialog", "clear-data-dialog"),
  clearDataTitle: requireElement<HTMLHeadingElement>("#clear-data-title", "clear-data-title"),
  closeServiceButton: requireElement<HTMLButtonElement>("#close-service", "close-service"),
  continueActions: requireElement<HTMLDivElement>("#continue-actions", "continue-actions"),
  continueHint: requireElement<HTMLSpanElement>("#continue-hint", "continue-hint"),
  continueManage: requireElement<HTMLButtonElement>("#continue-manage", "continue-manage"),
  customServiceForm: requireElement<HTMLFormElement>("#custom-service-form", "custom-service-form"),
  customServiceName: requireElement<HTMLInputElement>("#custom-service-name", "custom-service-name"),
  customServiceUrl: requireElement<HTMLInputElement>("#custom-service-url", "custom-service-url"),
  diagnosticsStatus: requireElement<HTMLParagraphElement>("#diagnostics-status", "diagnostics-status"),
  displayCard: requireElement<HTMLButtonElement>("#display-card", "display-card"),
  displayCopy: requireElement<HTMLElement>("#display-copy", "display-copy"),
  experimentalStoreActions: requireElement<HTMLDivElement>("#experimental-store-actions", "experimental-store-actions"),
  featuredBrand: requireElement<HTMLDivElement>("#featured-brand", "featured-brand"),
  featuredCopy: requireElement<HTMLParagraphElement>("#featured-copy", "featured-copy"),
  featuredEyebrow: requireElement<HTMLParagraphElement>("#featured-eyebrow", "featured-eyebrow"),
  featuredIcon: requireElement<HTMLDivElement>("#featured-icon", "featured-icon"),
  featuredSection: requireElement<HTMLElement>(".featured", "featured"),
  featuredTitle: requireElement<HTMLHeadingElement>("#featured-title", "featured-title"),
  feedback: requireElement<HTMLParagraphElement>("#feedback", "feedback"),
  gamepadCard: requireElement<HTMLButtonElement>("#gamepad-card", "gamepad-card"),
  gamepadClose: requireElement<HTMLButtonElement>("#gamepad-close", "gamepad-close"),
  gamepadCopy: requireElement<HTMLElement>("#gamepad-copy", "gamepad-copy"),
  gamepadDiagnosticStatus: requireElement<HTMLElement>("#gamepad-diagnostic-status", "gamepad-diagnostic-status"),
  gamepadDialog: requireElement<HTMLDialogElement>("#gamepad-dialog", "gamepad-dialog"),
  gamepadDone: requireElement<HTMLButtonElement>("#gamepad-done", "gamepad-done"),
  gamepadLastAction: requireElement<HTMLElement>("#gamepad-last-action", "gamepad-last-action"),
  fullscreenCopy: requireElement<HTMLElement>("#fullscreen-copy", "fullscreen-copy"),
  fullscreenToggle: requireElement<HTMLButtonElement>("#fullscreen-toggle", "fullscreen-toggle"),
  healthPill: requireElement<HTMLSpanElement>("#health-pill", "health-pill"),
  heroOpenButton: requireElement<HTMLButtonElement>("#hero-open", "hero-open"),
  lineupCount: requireElement<HTMLSpanElement>("#lineup-count", "lineup-count"),
  motionCopy: requireElement<HTMLElement>("#motion-copy", "motion-copy"),
  motionToggle: requireElement<HTMLButtonElement>("#motion-toggle", "motion-toggle"),
  networkBanner: requireElement<HTMLElement>("#network-banner", "network-banner"),
  profileAvatar: requireElement<HTMLSpanElement>("#profile-avatar", "profile-avatar"),
  profileCardCopy: requireElement<HTMLElement>("#profile-card-copy", "profile-card-copy"),
  profileClose: requireElement<HTMLButtonElement>("#profile-close", "profile-close"),
  profileCreateForm: requireElement<HTMLFormElement>("#profile-create-form", "profile-create-form"),
  profileCreateName: requireElement<HTMLInputElement>("#profile-create-name", "profile-create-name"),
  profileDialog: requireElement<HTMLDialogElement>("#profile-dialog", "profile-dialog"),
  profileList: requireElement<HTMLDivElement>("#profile-list", "profile-list"),
  profileName: requireElement<HTMLSpanElement>("#profile-name", "profile-name"),
  quitCancel: requireElement<HTMLButtonElement>("#quit-cancel", "quit-cancel"),
  quitConfirm: requireElement<HTMLButtonElement>("#quit-confirm", "quit-confirm"),
  quitCopy: requireElement<HTMLParagraphElement>("#quit-copy", "quit-copy"),
  quitDialog: requireElement<HTMLDialogElement>("#quit-dialog", "quit-dialog"),
  quitServicePreview: requireElement<HTMLImageElement>("#quit-service-preview", "quit-service-preview"),
  recoveryCopy: requireElement<HTMLParagraphElement>("#recovery-copy", "recovery-copy"),
  recoveryDialog: requireElement<HTMLDialogElement>("#recovery-dialog", "recovery-dialog"),
  recoveryHome: requireElement<HTMLButtonElement>("#recovery-home", "recovery-home"),
  recoveryReload: requireElement<HTMLButtonElement>("#recovery-reload", "recovery-reload"),
  recoveryRetry: requireElement<HTMLButtonElement>("#recovery-retry", "recovery-retry"),
  recoveryTitle: requireElement<HTMLHeadingElement>("#recovery-title", "recovery-title"),
  remoteApproval: requireElement<HTMLDivElement>("#remote-approval", "remote-approval"),
  remoteAutoConnectCopy: requireElement<HTMLElement>("#remote-auto-connect-copy", "remote-auto-connect-copy"),
  remoteAutoConnectToggle: requireElement<HTMLButtonElement>("#remote-auto-connect-toggle", "remote-auto-connect-toggle"),
  remoteApprove: requireElement<HTMLButtonElement>("#remote-approve", "remote-approve"),
  remoteClose: requireElement<HTMLButtonElement>("#remote-close", "remote-close"),
  remoteDeny: requireElement<HTMLButtonElement>("#remote-deny", "remote-deny"),
  remoteDetail: requireElement<HTMLParagraphElement>("#remote-detail", "remote-detail"),
  remoteDialog: requireElement<HTMLDialogElement>("#remote-dialog", "remote-dialog"),
  remoteExpiry: requireElement<HTMLParagraphElement>("#remote-expiry", "remote-expiry"),
  remoteInvite: requireElement<HTMLElement>("#remote-invite", "remote-invite"),
  remoteInviteDismiss: requireElement<HTMLButtonElement>("#remote-invite-dismiss", "remote-invite-dismiss"),
  remoteInviteQr: requireElement<HTMLImageElement>("#remote-invite-qr", "remote-invite-qr"),
  remotePairingView: requireElement<HTMLDivElement>("#remote-pairing-view", "remote-pairing-view"),
  remoteQr: requireElement<HTMLImageElement>("#remote-qr", "remote-qr"),
  remoteReady: requireElement<HTMLDivElement>("#remote-ready", "remote-ready"),
  remoteReadyCopy: requireElement<HTMLSpanElement>("#remote-ready-copy", "remote-ready-copy"),
  remoteStart: requireElement<HTMLButtonElement>("#remote-start", "remote-start"),
  runtimeStatus: requireElement<HTMLParagraphElement>("#runtime-status", "runtime-status"),
  safeAreaCopy: requireElement<HTMLElement>("#safe-area-copy", "safe-area-copy"),
  safeAreaToggle: requireElement<HTMLButtonElement>("#safe-area-toggle", "safe-area-toggle"),
  serviceActions: requireElement<HTMLDivElement>("#service-actions", "service-actions"),
  serviceStatus: requireElement<HTMLParagraphElement>("#service-status", "service-status"),
  searchClose: requireElement<HTMLButtonElement>("#search-close", "search-close"),
  searchDialog: requireElement<HTMLDialogElement>("#search-dialog", "search-dialog"),
  searchEmptyCopy: requireElement<HTMLParagraphElement>("#search-empty-copy", "search-empty-copy"),
  searchEmptyState: requireElement<HTMLDivElement>("#search-empty-state", "search-empty-state"),
  searchEmptyTitle: requireElement<HTMLElement>("#search-empty-title", "search-empty-title"),
  searchForm: requireElement<HTMLFormElement>("#search-form", "search-form"),
  searchHistoryCount: requireElement<HTMLSpanElement>("#search-history-count", "search-history-count"),
  searchHistoryResults: requireElement<HTMLDivElement>("#search-history-results", "search-history-results"),
  searchHistorySection: requireElement<HTMLElement>("#search-history-section", "search-history-section"),
  searchHistoryTitle: requireElement<HTMLHeadingElement>("#search-history-title", "search-history-title"),
  searchInput: requireElement<HTMLInputElement>("#search-input", "search-input"),
  searchProviderSection: requireElement<HTMLElement>("#search-provider-section", "search-provider-section"),
  searchResultCount: requireElement<HTMLSpanElement>("#search-result-count", "search-result-count"),
  searchResults: requireElement<HTMLDivElement>("#search-results", "search-results"),
  spotifyHomeBrand: requireElement<HTMLDivElement>("#spotify-home-brand", "spotify-home-brand"),
  spotifyHomeFullscreen: requireElement<HTMLButtonElement>("#spotify-home-fullscreen", "spotify-home-fullscreen"),
  spotifyHomeNext: requireElement<HTMLButtonElement>("#spotify-home-next", "spotify-home-next"),
  spotifyHomeOpen: requireElement<HTMLButtonElement>("#spotify-home-open", "spotify-home-open"),
  spotifyHomePlay: requireElement<HTMLButtonElement>("#spotify-home-play", "spotify-home-play"),
  spotifyHomePlayer: requireElement<HTMLElement>("#spotify-home-player", "spotify-home-player"),
  spotifyHomePrevious: requireElement<HTMLButtonElement>("#spotify-home-previous", "spotify-home-previous"),
  spotifyHomeStatus: requireElement<HTMLParagraphElement>("#spotify-home-status", "spotify-home-status"),
  spotifyHomeTitle: requireElement<HTMLHeadingElement>("#spotify-home-title", "spotify-home-title"),
  spotifyNowPlaying: requireElement<HTMLElement>("#spotify-now-playing", "spotify-now-playing"),
  spotifyNowPlayingArt: requireElement<HTMLDivElement>("#spotify-now-playing-art", "spotify-now-playing-art"),
  spotifyNowPlayingArtist: requireElement<HTMLParagraphElement>("#spotify-now-playing-artist", "spotify-now-playing-artist"),
  spotifyNowPlayingNext: requireElement<HTMLButtonElement>("#spotify-now-playing-next", "spotify-now-playing-next"),
  spotifyNowPlayingPlay: requireElement<HTMLButtonElement>("#spotify-now-playing-play", "spotify-now-playing-play"),
  spotifyNowPlayingPosition: requireElement<HTMLTimeElement>("#spotify-now-playing-position", "spotify-now-playing-position"),
  spotifyNowPlayingPrevious: requireElement<HTMLButtonElement>("#spotify-now-playing-previous", "spotify-now-playing-previous"),
  spotifyNowPlayingProgress: requireElement<HTMLSpanElement>("#spotify-now-playing-progress", "spotify-now-playing-progress"),
  spotifyNowPlayingRemaining: requireElement<HTMLSpanElement>("#spotify-now-playing-remaining", "spotify-now-playing-remaining"),
  spotifyNowPlayingTitle: requireElement<HTMLHeadingElement>("#spotify-now-playing-title", "spotify-now-playing-title"),
  settingsRemoteButton: requireElement<HTMLButtonElement>("#settings-remote-button", "settings-remote-button"),
  settingsRemoteCopy: requireElement<HTMLElement>("#settings-remote-copy", "settings-remote-copy"),
  soundToggle: requireElement<HTMLButtonElement>("#sound-toggle", "sound-toggle"),
  soundToggleCopy: requireElement<HTMLElement>("#sound-toggle-copy", "sound-toggle-copy"),
  storeCoreSection: requireElement<HTMLElement>("#store-core-section", "store-core-section"),
  storeEmpty: requireElement<HTMLDivElement>("#store-empty", "store-empty"),
  storeExperimentalSection: requireElement<HTMLElement>("#store-experimental-section", "store-experimental-section"),
  storeSearch: requireElement<HTMLInputElement>("#store-search", "store-search"),
  storeActions: requireElement<HTMLDivElement>("#store-actions", "store-actions"),
  storeUtilitySection: requireElement<HTMLElement>("#store-utility-section", "store-utility-section"),
  storeView: requireElement<HTMLElement>("#store-view", "store-view"),
  topRemoteButton: requireElement<HTMLButtonElement>("#top-remote-button", "top-remote-button"),
  topRemoteLabel: requireElement<HTMLSpanElement>("#top-remote-label", "top-remote-label"),
  topSearchButton: requireElement<HTMLButtonElement>("#top-search-button", "top-search-button"),
  utilityStoreActions: requireElement<HTMLDivElement>("#utility-store-actions", "utility-store-actions"),
  voiceClose: requireElement<HTMLButtonElement>("#voice-close", "voice-close"),
  voiceControlCopy: requireElement<HTMLElement>("#voice-control-copy", "voice-control-copy"),
  voiceControlToggle: requireElement<HTMLButtonElement>("#voice-control-toggle", "voice-control-toggle"),
  voiceDialog: requireElement<HTMLDialogElement>("#voice-dialog", "voice-dialog"),
  voiceKeyError: requireElement<HTMLElement>("#voice-key-error", "voice-key-error"),
  voiceKeyForm: requireElement<HTMLFormElement>("#voice-key-form", "voice-key-form"),
  voiceKeyInput: requireElement<HTMLInputElement>("#voice-key-input", "voice-key-input"),
  voiceKeyLabel: requireElement<HTMLLabelElement>("#voice-key-label", "voice-key-label"),
  voiceKeyState: requireElement<HTMLElement>("#voice-key-state", "voice-key-state"),
  voiceKeyStatus: requireElement<HTMLElement>("#voice-key-status", "voice-key-status"),
  voiceKeySubmit: requireElement<HTMLButtonElement>("#voice-key-submit", "voice-key-submit"),
  voicePlaybackMode: requireElement<HTMLButtonElement>("#voice-playback-mode", "voice-playback-mode"),
  voicePlaybackModeCopy: requireElement<HTMLElement>("#voice-playback-mode-copy", "voice-playback-mode-copy"),
  voiceRegionButton: requireElement<HTMLButtonElement>("#voice-region-button", "voice-region-button"),
  voiceRegionCopy: requireElement<HTMLElement>("#voice-region-copy", "voice-region-copy"),
  voiceRegionError: requireElement<HTMLElement>("#voice-region-error", "voice-region-error"),
  voiceRegionForm: requireElement<HTMLFormElement>("#voice-region-form", "voice-region-form"),
  voiceRegionInput: requireElement<HTMLInputElement>("#voice-region-input", "voice-region-input"),
  voiceRemoveKey: requireElement<HTMLButtonElement>("#voice-remove-key", "voice-remove-key"),
  voicePresentation: requireElement<HTMLElement>("#voice-presentation", "voice-presentation"),
  voicePresentationChoices: requireElement<HTMLOListElement>("#voice-presentation-choices", "voice-presentation-choices"),
  voicePresentationCopy: requireElement<HTMLElement>("#voice-presentation-copy", "voice-presentation-copy"),
  voicePresentationDetail: requireElement<HTMLElement>("#voice-presentation-detail", "voice-presentation-detail"),
  voicePresentationLabel: requireElement<HTMLElement>("#voice-presentation-label", "voice-presentation-label"),
  voiceSettingsButton: requireElement<HTMLButtonElement>("#voice-settings-button", "voice-settings-button"),
  voiceSettingsCopy: requireElement<HTMLElement>("#voice-settings-copy", "voice-settings-copy"),
  voiceTestButton: requireElement<HTMLButtonElement>("#voice-test-button", "voice-test-button"),
  voiceTestCredential: requireElement<HTMLElement>("#voice-test-credential", "voice-test-credential"),
  voiceTestInterpretation: requireElement<HTMLElement>("#voice-test-interpretation", "voice-test-interpretation"),
  voiceTestSummary: requireElement<HTMLElement>("#voice-test-summary", "voice-test-summary"),
  widevineStatus: requireElement<HTMLParagraphElement>("#widevine-status", "widevine-status"),
  youtubeTvCopy: requireElement<HTMLElement>("#youtube-tv-copy", "youtube-tv-copy"),
  youtubeTvScale: requireElement<HTMLButtonElement>("#youtube-tv-scale", "youtube-tv-scale"),
  youtubeTvScaleCopy: requireElement<HTMLElement>("#youtube-tv-scale-copy", "youtube-tv-scale-copy"),
  youtubeTvToggle: requireElement<HTMLButtonElement>("#youtube-tv-toggle", "youtube-tv-toggle")
};

const navigationSounds = new NavigationSounds();
let currentRemoteStatus: RemoteStatus | null = null;
let dismissedRemoteInviteQr: string | null = null;
let openAiCredentialStatus: OpenAiCredentialStatus = {
  detail: "Checking secure storage…",
  state: "missing"
};
let currentHostStatus: HostStatus | null = null;
let currentServiceRecovery: ServiceRecoveryRequest | null = null;
let currentSpotifyPlayback: SpotifyPlaybackPresentation = {
  album: null,
  artist: null,
  artworkDataUrl: null,
  durationSeconds: null,
  playing: false,
  positionSeconds: null,
  signedIn: false,
  title: null
};
let continueWatchingItems: readonly ContinueWatchingItem[] = [];
let catalogSearchTimer: number | null = null;
let catalogSearchVersion = 0;
let promoteRemoteCatalogSearchFocus = false;
let ambientAnchorTimer: number | null = null;
let ambientClockTimer: number | null = null;
let ambientShownAt = 0;
let ambientIdleVisible = false;
let spotifyNowPlayingOpen = false;
let currentView: AppView = "home";
let actionNoticeRetry: (() => void) | null = null;
let actionNoticeVersion = 0;
let continueManaging = false;
let continueWatchingLoadFailed = false;
let enabledServiceIds = new Set<string>();
let feedbackTimer: number | null = null;
let voicePresentationFailsafeTimer: number | null = null;
let voicePresentationLongWaitTimer: number | null = null;
let voiceUnderstandingStartedAt = 0;
const VOICE_PRESENTATION_FAILSAFE_MS = 65_000;
const VOICE_PRESENTATION_LONG_WAIT_MS = 15_000;
const CATALOG_SEARCH_TIMEOUT_MS = 10_000;
const APP_ACTION_TIMEOUT_MS = 30_000;
const PLAYBACK_ACTION_TIMEOUT_MS = 10_000;
const PAIRING_OPERATION_TIMEOUT_MS = 12_000;
const RECOVERY_OPERATION_TIMEOUT_MS = 20_000;
let featuredContinueItemId: string | null = null;
let featuredServiceId: string | null = null;
let favoriteServiceIds = new Set<string>();
let localAppState: LocalAppState | null = null;
let pendingClearService: ServiceSummary | null = null;
let pendingManageService: ServiceSummary | null = null;
let pendingServiceAction: "clear" | "remove-custom" = "clear";
let remoteFocusedElement: HTMLElement | null = null;
let serviceOrder: string[] = [];
let services: readonly ServiceSummary[] = [];
let servicesLoadFailed = false;
let servicesLoading = false;
let connectedGamepads: readonly GamepadLike[] = [];

function showFeedback(message: string): void {
  elements.feedback.textContent = message;

  if (feedbackTimer !== null) {
    window.clearTimeout(feedbackTimer);
  }

  feedbackTimer = window.setTimeout(() => {
    elements.feedback.textContent = "";
    feedbackTimer = null;
  }, 4_000);
}

interface ActionNoticeOptions {
  detail: string;
  retry?: () => void;
  retryLabel?: string;
  state: "error" | "progress";
  title: string;
}

function showActionNotice(options: ActionNoticeOptions): number {
  const version = ++actionNoticeVersion;
  actionNoticeRetry = options.retry ?? null;
  elements.actionNotice.dataset.state = options.state;
  elements.actionNotice.setAttribute("role", options.state === "error" ? "alert" : "status");
  elements.actionNotice.setAttribute("aria-live", options.state === "error" ? "assertive" : "polite");
  elements.actionNoticeMark.textContent = options.state === "error" ? "!" : "…";
  elements.actionNoticeTitle.textContent = options.title;
  elements.actionNoticeDetail.textContent = options.detail;
  elements.actionNoticeRetry.textContent = options.retryLabel ?? "Try again";
  elements.actionNoticeRetry.hidden = options.retry === undefined;
  elements.actionNotice.hidden = false;
  return version;
}

function hideActionNotice(expectedVersion?: number): void {
  if (expectedVersion !== undefined && expectedVersion !== actionNoticeVersion) return;
  actionNoticeVersion += 1;
  actionNoticeRetry = null;
  elements.actionNotice.hidden = true;
  elements.actionNoticeRetry.hidden = true;
}

function actionFailureDetail(error: unknown, fallback: string): string {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.trim().length > 0 ? detail : fallback;
}

function replaceActionProgressWithFailure(
  version: number,
  options: Omit<ActionNoticeOptions, "state">
): void {
  if (version !== actionNoticeVersion) return;
  showActionNotice({ ...options, state: "error" });
}

elements.actionNoticeDismiss.addEventListener("click", () => hideActionNotice());
elements.actionNoticeRetry.addEventListener("click", () => {
  const retry = actionNoticeRetry;
  hideActionNotice();
  retry?.();
});

function withUiDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    operation.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function renderVoicePresentation(presentation: VoicePresentationState): void {
  if (presentation.phase === "listening") hideActionNotice();
  const previousPhase = elements.voicePresentation.dataset.phase;
  if (voicePresentationFailsafeTimer !== null) {
    window.clearTimeout(voicePresentationFailsafeTimer);
    voicePresentationFailsafeTimer = null;
  }
  if (voicePresentationLongWaitTimer !== null) {
    window.clearTimeout(voicePresentationLongWaitTimer);
    voicePresentationLongWaitTimer = null;
  }

  const hidden = presentation.phase === "hidden";
  const copy = voicePresentationCopy(presentation);
  elements.voicePresentation.dataset.phase = presentation.phase;
  elements.voicePresentationLabel.textContent = copy.label;
  elements.voicePresentationCopy.textContent = copy.copy;
  elements.voicePresentationDetail.textContent = copy.detail ?? "";
  elements.voicePresentationDetail.hidden = copy.detail === null;
  elements.voicePresentationChoices.replaceChildren();
  const choices = presentation.phase === "clarification"
    ? presentation.choices?.slice(0, 3) ?? []
    : [];
  for (const choice of choices) {
    const item = document.createElement("li");
    item.value = choice.ordinal;
    const button = document.createElement("button");
    button.className = "voice-presentation-choice";
    button.type = "button";
    button.dataset.voiceChoiceOrdinal = String(choice.ordinal);
    button.setAttribute("aria-label", `Choice ${choice.ordinal}: ${choice.primaryLabel}`);

    const ordinal = document.createElement("span");
    ordinal.className = "voice-presentation-choice-ordinal";
    ordinal.textContent = String(choice.ordinal);

    const labels = document.createElement("span");
    labels.className = "voice-presentation-choice-labels";
    const primary = document.createElement("span");
    primary.className = "voice-presentation-choice-primary";
    primary.textContent = choice.primaryLabel;
    labels.append(primary);
    if (choice.secondaryLabel !== undefined) {
      const secondary = document.createElement("span");
      secondary.className = "voice-presentation-choice-secondary";
      secondary.textContent = choice.secondaryLabel;
      labels.append(secondary);
    }
    button.append(ordinal, labels);
    button.addEventListener("click", () => {
      for (const candidate of elements.voicePresentationChoices.querySelectorAll("button")) {
        candidate.disabled = true;
      }
      void window.nhd.selectVoiceChoice(choice.ordinal)
        .then((accepted) => {
          if (!accepted) showFeedback("That choice expired. Ask for the options again.");
        })
        .catch((error: unknown) => {
          showFeedback(error instanceof Error ? error.message : String(error));
        });
    });
    item.append(button);
    elements.voicePresentationChoices.append(item);
  }
  elements.voicePresentationChoices.hidden = choices.length === 0;
  elements.voicePresentation.hidden = hidden;
  const soundCue = voiceSoundCue(previousPhase, presentation.phase);
  if (soundCue !== null) navigationSounds.playVoiceCue(soundCue);
  if (choices.length > 0) {
    const firstChoice = elements.voicePresentationChoices.querySelector<HTMLElement>("button");
    firstChoice?.focus({ preventScroll: true });
    setRemoteFocusedElement(firstChoice);
  }

  if (presentation.phase === "understanding") {
    if (previousPhase !== "understanding" || voiceUnderstandingStartedAt === 0) {
      voiceUnderstandingStartedAt = Date.now();
    }
    const elapsed = Date.now() - voiceUnderstandingStartedAt;
    const showLongWait = () => {
      if (elements.voicePresentation.dataset.phase !== "understanding") return;
      elements.voicePresentationLabel.textContent = "Still working";
      const stage = copy.detail ?? (presentation.transcript === null ? copy.copy : "");
      elements.voicePresentationDetail.textContent = stage.length > 0
        ? `${stage.replace(/…$/, "")} · You can cancel from your phone.`
        : "You can cancel from your phone.";
      elements.voicePresentationDetail.hidden = false;
      voicePresentationLongWaitTimer = null;
    };
    const remaining = VOICE_PRESENTATION_LONG_WAIT_MS - elapsed;
    if (remaining <= 0) showLongWait();
    else voicePresentationLongWaitTimer = window.setTimeout(showLongWait, remaining);
  } else {
    voiceUnderstandingStartedAt = 0;
  }

  if (!hidden) {
    // Main owns the normal phase timing. This renderer-only timeout prevents a
    // stale overlay if the event sequence is interrupted; it stores no transcript.
    voicePresentationFailsafeTimer = window.setTimeout(() => {
      elements.voicePresentation.hidden = true;
      elements.voicePresentation.dataset.phase = "hidden";
      elements.voicePresentationLabel.textContent = "Voice";
      elements.voicePresentationCopy.textContent = "";
      elements.voicePresentationDetail.textContent = "";
      elements.voicePresentationDetail.hidden = true;
      elements.voicePresentationChoices.replaceChildren();
      elements.voicePresentationChoices.hidden = true;
      voicePresentationFailsafeTimer = null;
    }, VOICE_PRESENTATION_FAILSAFE_MS);
  }
}

function renderSpotifyHomePlayer(): void {
  const enabled = enabledServiceIds.has("spotify");
  const backgrounded = enabled && currentHostStatus?.activeServiceId === "spotify" &&
    currentHostStatus.playback.backgrounded;
  elements.spotifyHomePlayer.hidden = !backgrounded;
  if (!enabled) return;

  const playing = backgrounded && currentSpotifyPlayback.playing;
  const trackReady = backgrounded && currentSpotifyPlayback.title !== null;

  const existingArtwork = elements.spotifyHomeBrand.querySelector("img");
  if (currentSpotifyPlayback.artworkDataUrl !== null) {
    if (existingArtwork?.getAttribute("src") !== currentSpotifyPlayback.artworkDataUrl) {
      const image = document.createElement("img");
      image.alt = "";
      image.src = currentSpotifyPlayback.artworkDataUrl;
      elements.spotifyHomeBrand.replaceChildren(image);
    }
  } else if (existingArtwork !== null || elements.spotifyHomeBrand.childElementCount === 0) {
    elements.spotifyHomeBrand.replaceChildren(createServiceMark("spotify", "Spotify"));
  }

  elements.spotifyHomePlayer.dataset.active = String(backgrounded);
  elements.spotifyHomePlayer.dataset.playing = String(playing);
  elements.spotifyHomePrevious.disabled = !backgrounded;
  elements.spotifyHomePlay.disabled = !backgrounded;
  elements.spotifyHomeNext.disabled = !backgrounded;
  elements.spotifyHomeFullscreen.disabled = !trackReady;
  elements.spotifyHomePlay.setAttribute(
    "aria-label",
    playing ? "Pause Spotify" : "Play Spotify"
  );
  elements.spotifyHomeOpen.textContent = backgrounded ? "Return to Spotify" : "Open Spotify";
  elements.spotifyHomeTitle.textContent = trackReady
    ? currentSpotifyPlayback.title ?? "Spotify"
    : "Spotify";
  elements.spotifyHomeStatus.textContent = trackReady
    ? currentSpotifyPlayback.artist ?? currentSpotifyPlayback.album ?? "Spotify"
    : backgrounded
      ? currentSpotifyPlayback.signedIn
        ? "Spotify is connected. Choose a track once, then control it here."
        : "Sign in to Spotify to control playback from Home."
    : "Choose music in Spotify, then press Home to keep it playing and control it here.";

  renderSpotifyNowPlaying();
}

function spotifyPlaybackClock(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "0:00";
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3_600);
  const minutes = Math.floor((whole % 3_600) / 60);
  const remainder = whole % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function renderSpotifyNowPlaying(): void {
  const playback = currentSpotifyPlayback;
  const backgrounded = currentHostStatus?.activeServiceId === "spotify" &&
    currentHostStatus.playback.backgrounded;
  const ready = backgrounded && playback.title !== null;
  const remaining = playback.durationSeconds === null || playback.positionSeconds === null
    ? null
    : Math.max(0, playback.durationSeconds - playback.positionSeconds);
  const progress = playback.durationSeconds !== null && playback.durationSeconds > 0 &&
    playback.positionSeconds !== null
    ? Math.min(100, Math.max(0, playback.positionSeconds / playback.durationSeconds * 100))
    : 0;

  elements.spotifyNowPlaying.dataset.playing = String(playback.playing);
  elements.spotifyNowPlayingTitle.textContent = playback.title ?? "Choose something to play";
  elements.spotifyNowPlayingArtist.textContent = playback.artist ??
    (playback.signedIn ? "Spotify is ready." : "Open Spotify to sign in and start listening.");
  elements.spotifyNowPlayingPosition.textContent = spotifyPlaybackClock(playback.positionSeconds);
  elements.spotifyNowPlayingPosition.dateTime = `PT${Math.max(0, Math.floor(playback.positionSeconds ?? 0))}S`;
  elements.spotifyNowPlayingRemaining.textContent = remaining === null
    ? "No track loaded"
    : `${spotifyPlaybackClock(remaining)} left`;
  elements.spotifyNowPlayingProgress.style.width = `${progress}%`;
  elements.spotifyNowPlayingPrevious.disabled = !backgrounded;
  elements.spotifyNowPlayingPlay.disabled = !backgrounded;
  elements.spotifyNowPlayingNext.disabled = !backgrounded;
  elements.spotifyNowPlayingPlay.setAttribute(
    "aria-label",
    playback.playing ? "Pause Spotify" : "Play Spotify"
  );

  const currentImage = elements.spotifyNowPlayingArt.querySelector("img");
  if (playback.artworkDataUrl !== null) {
    if (currentImage?.getAttribute("src") !== playback.artworkDataUrl) {
      const image = document.createElement("img");
      image.alt = "";
      image.src = playback.artworkDataUrl;
      elements.spotifyNowPlayingArt.replaceChildren(image);
    }
    if (elements.spotifyAmbientBackdrop.getAttribute("src") !== playback.artworkDataUrl) {
      elements.spotifyAmbientBackdrop.src = playback.artworkDataUrl;
    }
    elements.spotifyAmbientBackdrop.hidden = !spotifyNowPlayingOpen;
  } else {
    if (currentImage !== null || elements.spotifyNowPlayingArt.childElementCount === 0) {
      elements.spotifyNowPlayingArt.replaceChildren(createServiceMark("spotify", "Spotify"));
    }
    elements.spotifyAmbientBackdrop.hidden = true;
    elements.spotifyAmbientBackdrop.removeAttribute("src");
  }

  if (spotifyNowPlayingOpen && !ready) closeSpotifyNowPlaying();
}

function renderNetworkState(): void {
  elements.networkBanner.hidden = navigator.onLine;
  if (
    navigator.onLine &&
    currentServiceRecovery?.kind === "offline" &&
    elements.recoveryDialog.open
  ) {
    elements.recoveryCopy.textContent =
      `This computer is online again. Try ${currentServiceRecovery.serviceName} now.`;
  }
}

function showServiceRecovery(request: ServiceRecoveryRequest): void {
  currentServiceRecovery = request;
  elements.recoveryTitle.textContent = `${request.serviceName} needs attention`;
  elements.recoveryCopy.textContent = request.detail;
  if (!elements.recoveryDialog.open) elements.recoveryDialog.showModal();
  elements.recoveryRetry.focus();
}

function setRecoveryActionsDisabled(disabled: boolean): void {
  elements.recoveryRetry.disabled = disabled;
  elements.recoveryReload.disabled = disabled;
  elements.recoveryHome.disabled = disabled;
}

async function runServiceRecovery(mode: ServiceRecoveryMode): Promise<void> {
  const recovery = currentServiceRecovery;
  setRecoveryActionsDisabled(true);
  elements.recoveryCopy.textContent = mode === "home"
    ? "Returning to NHD-TV Home…"
    : mode === "reload"
      ? "Reloading the app…"
      : "Trying the app again…";

  try {
    const handled = await withUiDeadline(
      window.nhd.recoverService(mode),
      RECOVERY_OPERATION_TIMEOUT_MS,
      "That app is taking too long to recover. Try again or return Home."
    );
    if (!handled && mode !== "home") {
      throw new Error("That app no longer has a recovery session.");
    }
    currentServiceRecovery = null;
    if (elements.recoveryDialog.open) elements.recoveryDialog.close();
    if (mode === "home") {
      returnHome(true);
      showFeedback("Returned to NHD-TV Home.");
    }
  } catch (error) {
    if (currentServiceRecovery === null && recovery !== null) {
      currentServiceRecovery = recovery;
    }
    elements.recoveryCopy.textContent = error instanceof Error ? error.message : String(error);
    if (!elements.recoveryDialog.open) elements.recoveryDialog.showModal();
    elements.recoveryRetry.focus();
  } finally {
    setRecoveryActionsDisabled(false);
  }
}

function hideQuitServicePreview(): void {
  elements.quitServicePreview.hidden = true;
  elements.quitServicePreview.removeAttribute("src");
}

function renderStatus(status: HostStatus): void {
  currentHostStatus = status;
  if (status.activeServiceId === null) {
    if (elements.quitDialog.open) {
      elements.quitDialog.close();
    }
    hideQuitServicePreview();
  }

  elements.runtimeStatus.textContent = [
    `Electron ${status.runtime.electron}`,
    `Chromium ${status.runtime.chrome}`,
    `Node ${status.runtime.node}`
  ].join(" · ");
  elements.widevineStatus.textContent = `${status.widevine.state}: ${status.widevine.details}`;
  elements.serviceStatus.textContent = status.activeServiceId ?? "None";
  elements.healthPill.textContent = status.widevine.state === "ready"
    ? "Host ready"
    : `Widevine ${status.widevine.state}`;
  elements.healthPill.dataset.state = status.widevine.state === "ready" ? "ready" : "warning";
  elements.displayCopy.textContent = status.display.count === 1
    ? `${status.display.label} · only display connected`
    : `${status.display.label} · ${status.display.count} displays connected`;
  renderSpotifyHomePlayer();
  const serviceProcess = status.diagnostics.serviceRenderer;
  const gpuProcess = status.diagnostics.gpuProcess;
  const lastBlocked = status.navigation.lastBlocked;
  elements.diagnosticsStatus.textContent = [
    `Acceleration ${status.diagnostics.hardwareAcceleration ?? "checking"}`,
    `Video decode ${status.diagnostics.videoDecode}`,
    `VPx ${status.diagnostics.vpxDecode}`,
    `Fullscreen window ${status.fullscreen.window} · service HTML ${status.fullscreen.serviceHtml}`,
    lastBlocked === null
      ? "No blocked service navigation"
      : `Blocked ${lastBlocked.kind} for ${lastBlocked.serviceId}: ${lastBlocked.origin}`,
    serviceProcess === null
      ? "Service process inactive"
      : `Service ${serviceProcess.cpuPercent}% CPU · ${serviceProcess.memoryMegabytes} MB · sandbox ${serviceProcess.sandboxed ?? "unknown"}`,
    gpuProcess === null
      ? "GPU process unavailable"
      : `GPU process ${gpuProcess.cpuPercent}% CPU · ${gpuProcess.memoryMegabytes} MB`
  ].join(" · ");
}

async function refreshStatus(): Promise<void> {
  renderStatus(await window.nhd.getHostStatus());
}

function renderOpenAiCredentialStatus(status: OpenAiCredentialStatus): void {
  openAiCredentialStatus = status;
  const configured = status.state === "configured";
  const unavailable = status.state === "unavailable";
  elements.voiceSettingsButton.dataset.connected = String(configured);
  elements.voiceSettingsCopy.textContent = status.detail;
  elements.voiceKeyStatus.textContent = status.detail;
  elements.voiceKeyState.dataset.state = status.state;
  const stateLabel = status.state === "configured"
    ? "Configured"
    : status.state === "invalid"
      ? "Needs attention"
      : status.state === "unavailable"
        ? "Unavailable"
        : "Not configured";
  const stateCopy = elements.voiceKeyState.querySelector<HTMLElement>("strong");
  if (stateCopy !== null) stateCopy.textContent = stateLabel;
  elements.voiceKeyLabel.textContent = configured || status.state === "invalid"
    ? "Replace API key"
    : "Add API key";
  elements.voiceKeySubmit.textContent = configured || status.state === "invalid"
    ? "Replace key"
    : "Add key";
  elements.voiceKeyInput.placeholder = configured || status.state === "invalid"
    ? "Enter a new OpenAI API key"
    : "Enter an OpenAI API key";
  elements.voiceKeyInput.disabled = unavailable;
  elements.voiceKeySubmit.disabled = unavailable;
  elements.voiceRemoveKey.disabled = status.state === "missing" || unavailable;
}

function setVoiceInlineError(element: HTMLElement, message: string | null): void {
  element.textContent = message ?? "";
  element.hidden = message === null;
}

function renderVoiceSetupDiagnostic(diagnostic: VoiceSetupDiagnostic): void {
  elements.voiceTestCredential.dataset.state = diagnostic.credential;
  elements.voiceTestInterpretation.dataset.state = diagnostic.interpretation;
  elements.voiceTestSummary.textContent = diagnostic.latencyMs === null
    ? diagnostic.detail
    : `${diagnostic.detail} · ${diagnostic.latencyMs} ms`;
  elements.voiceTestButton.textContent = diagnostic.interpretation === "passed"
    ? "Run again"
    : "Retry connection test";
}

function applyLocalAppState(state: LocalAppState): void {
  localAppState = state;
  enabledServiceIds = new Set(state.preferences.enabledServiceIds);
  favoriteServiceIds = new Set(state.preferences.favoriteServiceIds);
  serviceOrder = [...state.preferences.serviceOrder];

  const activeProfile = state.profiles.find((profile) => profile.id === state.activeProfileId);
  const name = activeProfile?.name ?? "Local profile";
  elements.profileName.textContent = name;
  elements.profileAvatar.textContent = name.slice(0, 1).toUpperCase();
  elements.profileCardCopy.textContent = `${name} · separate lineup and viewing history`;
  elements.ambientDisplayToggle.setAttribute(
    "aria-pressed",
    String(state.devicePreferences.ambientDisplayEnabled)
  );
  elements.ambientDisplayCopy.textContent = state.devicePreferences.ambientDisplayEnabled
    ? `On · starts after ${state.devicePreferences.ambientDisplayDelayMinutes} minutes`
    : "Off";
  elements.ambientClockStyleCopy.textContent =
    AMBIENT_CLOCK_LABELS[state.devicePreferences.ambientClockStyle];
  elements.ambientDisplayDelayCopy.textContent =
    `${state.devicePreferences.ambientDisplayDelayMinutes} minutes`;
  elements.ambientStage.dataset.clockStyle = state.devicePreferences.ambientClockStyle;
  document.body.dataset.safeArea = state.devicePreferences.safeArea;
  document.body.dataset.reducedMotion = String(state.devicePreferences.reducedMotion);
  elements.fullscreenToggle.setAttribute("aria-pressed", String(state.devicePreferences.fullscreen));
  elements.fullscreenCopy.textContent = state.devicePreferences.fullscreen ? "On" : "Off";
  elements.motionToggle.setAttribute("aria-pressed", String(state.devicePreferences.reducedMotion));
  elements.motionCopy.textContent = state.devicePreferences.reducedMotion ? "On" : "Off";
  elements.safeAreaCopy.textContent = `${state.devicePreferences.safeArea[0]?.toUpperCase() ?? "S"}${state.devicePreferences.safeArea.slice(1)}`;
  elements.remoteAutoConnectToggle.setAttribute(
    "aria-pressed",
    String(state.devicePreferences.autoApproveFirstRemote)
  );
  elements.remoteAutoConnectCopy.textContent = state.devicePreferences.autoApproveFirstRemote
    ? "On · first scan connects when no remote is active"
    : "Off · approve every new phone on the TV";
  elements.voiceControlToggle.setAttribute(
    "aria-pressed",
    String(state.devicePreferences.voiceControlEnabled)
  );
  elements.voiceControlCopy.textContent = state.devicePreferences.voiceControlEnabled
    ? "On · hold the phone microphone button to talk"
    : "Off";
  elements.voicePlaybackModeCopy.textContent = state.preferences.voicePlaybackMode === "automatic"
    ? "Play automatically when there is one verified match"
    : "Confirm before playing";
  elements.voiceRegionCopy.textContent = state.devicePreferences.voiceRegion === null
    ? "Automatic detection"
    : state.devicePreferences.voiceRegion;
  elements.youtubeTvToggle.setAttribute(
    "aria-pressed",
    String(state.devicePreferences.youtubeTvModeEnabled)
  );
  elements.youtubeTvCopy.textContent = state.devicePreferences.youtubeTvModeEnabled
    ? "On · remote-friendly layout"
    : "Off · ordinary YouTube";
  elements.youtubeTvScaleCopy.textContent =
    `${state.devicePreferences.youtubeTvScale[0]?.toUpperCase() ?? "S"}${state.devicePreferences.youtubeTvScale.slice(1)}`;
  renderSpotifyHomePlayer();
}

async function saveProfilePreferences(): Promise<void> {
  applyLocalAppState(await window.nhd.updateProfilePreferences({
    enabledServiceIds: [...enabledServiceIds],
    favoriteServiceIds: [...favoriteServiceIds],
    serviceOrder,
    voicePlaybackMode: localAppState?.preferences.voicePlaybackMode ?? "confirm"
  }));
}

async function saveDevicePreferences(
  changes: Partial<LocalAppState["devicePreferences"]>
): Promise<void> {
  if (localAppState === null) {
    return;
  }

  applyLocalAppState(await window.nhd.updateDevicePreferences(changes));
}

async function saveVoicePlaybackMode(
  voicePlaybackMode: LocalAppState["preferences"]["voicePlaybackMode"]
): Promise<void> {
  if (localAppState === null) {
    return;
  }

  applyLocalAppState(await window.nhd.updateProfilePreferences({
    ...localAppState.preferences,
    voicePlaybackMode
  }));
}

const ambientAnchors = [
  "top-left",
  "bottom-right",
  "top-right",
  "bottom-left",
  "center"
] as const;
const ambientTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit"
});
const ambientDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  weekday: "long"
});

function updateAmbientClock(): void {
  const now = new Date();
  const formattedTime = ambientTimeFormatter.format(now);
  const formattedDate = ambientDateFormatter.format(now);
  const timeParts = ambientTimeFormatter.formatToParts(now);
  const hour = timeParts.find((part) => part.type === "hour")?.value ?? String(now.getHours());
  const minute = timeParts.find((part) => part.type === "minute")?.value ??
    String(now.getMinutes()).padStart(2, "0");
  const period = timeParts.find((part) => part.type === "dayPeriod")?.value ?? "";

  elements.ambientDigitalTime.textContent = formattedTime;
  elements.ambientDigitalTime.dateTime = now.toISOString();
  elements.ambientFlipHour.textContent = hour.padStart(2, "0");
  elements.ambientFlipMinute.textContent = minute;
  elements.ambientFlipPeriod.textContent = period;
  elements.ambientFlipPeriod.hidden = period.length === 0;
  elements.ambientFlipTime.dateTime = now.toISOString();
  elements.ambientMinimalHour.textContent = hour;
  elements.ambientMinimalMinute.textContent = minute;
  elements.ambientMinimalPeriod.textContent = period;
  elements.ambientMinimalPeriod.hidden = period.length === 0;
  elements.ambientNeonTime.textContent = formattedTime;
  elements.ambientNeonTime.dateTime = now.toISOString();
  elements.ambientOrbitTime.textContent = formattedTime;
  elements.ambientOrbitTime.dateTime = now.toISOString();
  for (const date of elements.ambientDates) {
    date.textContent = formattedDate;
  }

  const minuteAngle = now.getMinutes() * 6 + now.getSeconds() * 0.1;
  const hourAngle = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;
  elements.ambientAnalogHour.style.setProperty("--ambient-hand-angle", `${hourAngle}deg`);
  elements.ambientAnalogMinute.style.setProperty("--ambient-hand-angle", `${minuteAngle}deg`);
  elements.ambientOrbitFace.style.setProperty("--ambient-minute-angle", `${minuteAngle}deg`);
  elements.ambientOrbitFace.style.setProperty(
    "--ambient-second-angle",
    `${now.getSeconds() * 6}deg`
  );
  elements.ambientDisplay.setAttribute(
    "aria-label",
    spotifyNowPlayingOpen
      ? `Spotify Big Screen. ${formattedTime}, ${formattedDate}. Select outside the playback controls or press Back to close.`
      : `Ambient display. ${formattedTime}, ${formattedDate}. Move or press any control to return.`
  );
}

function updateAmbientAnchor(): void {
  const index = Math.floor(Date.now() / 60_000) % ambientAnchors.length;
  elements.ambientStage.dataset.anchor = ambientAnchors[index] ?? "center";
}

function syncAmbientOverlay(): void {
  const visible = ambientIdleVisible || spotifyNowPlayingOpen;
  elements.ambientDisplay.hidden = !visible;
  elements.ambientDisplay.dataset.mode = spotifyNowPlayingOpen ? "spotify" : "clock";
  elements.spotifyNowPlaying.hidden = !spotifyNowPlayingOpen;
  elements.spotifyAmbientBackdrop.hidden = !spotifyNowPlayingOpen ||
    currentSpotifyPlayback.artworkDataUrl === null;
  document.body.dataset.ambientDisplay = String(visible);
  if (!visible) {
    if (ambientClockTimer !== null) window.clearInterval(ambientClockTimer);
    if (ambientAnchorTimer !== null) window.clearInterval(ambientAnchorTimer);
    ambientClockTimer = null;
    ambientAnchorTimer = null;
    return;
  }

  ambientShownAt = performance.now();
  elements.ambientStage.dataset.clockStyle =
    localAppState?.devicePreferences.ambientClockStyle ?? "digital";
  updateAmbientClock();
  updateAmbientAnchor();
  if (ambientClockTimer === null) {
    ambientClockTimer = window.setInterval(updateAmbientClock, 1_000);
  }
  if (ambientAnchorTimer === null) {
    ambientAnchorTimer = window.setInterval(updateAmbientAnchor, 60_000);
  }
}

function setAmbientDisplayVisible(visible: boolean): void {
  ambientIdleVisible = visible;
  syncAmbientOverlay();
}

function openSpotifyNowPlaying(): void {
  if (elements.spotifyHomeFullscreen.disabled) return;
  spotifyNowPlayingOpen = true;
  renderSpotifyNowPlaying();
  syncAmbientOverlay();
  elements.spotifyNowPlayingPlay.focus();
}

function closeSpotifyNowPlaying(): void {
  if (!spotifyNowPlayingOpen) return;
  spotifyNowPlayingOpen = false;
  setRemoteFocusedElement(null);
  syncAmbientOverlay();
  if (!elements.spotifyHomeFullscreen.disabled) elements.spotifyHomeFullscreen.focus();
}

function dismissAmbientDisplayFromInput(): void {
  if (!ambientIdleVisible) {
    return;
  }

  setAmbientDisplayVisible(false);
  void window.nhd.dismissAmbientDisplay().catch(() => undefined);
}

function captureAmbientWake(event: Event): void {
  if (!ambientIdleVisible || spotifyNowPlayingOpen) {
    return;
  }
  if (event.type === "pointermove" && performance.now() - ambientShownAt < 1_500) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  dismissAmbientDisplayFromInput();
}

document.addEventListener("keydown", captureAmbientWake, { capture: true });
document.addEventListener("pointerdown", captureAmbientWake, { capture: true });
document.addEventListener("pointermove", captureAmbientWake, { capture: true });
document.addEventListener("wheel", captureAmbientWake, { capture: true, passive: false });

function playbackTime(seconds: number): string {
  const roundedMinutes = Math.max(1, Math.round(seconds / 60));
  if (roundedMinutes < 60) {
    return `${roundedMinutes} min`;
  }

  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

function continueCard(item: ContinueWatchingItem): HTMLElement {
  const presentation = presentContinueWatching(item);
  const shell = document.createElement("article");
  shell.className = "continue-card-shell";
  shell.dataset.serviceId = item.serviceId;

  const button = document.createElement("button");
  button.className = "continue-card continue-card-item";
  button.type = "button";
  button.setAttribute("aria-label", `Resume ${presentation.title} in ${item.serviceName}`);

  const art = document.createElement("span");
  art.className = "continue-art";
  if (item.artworkDataUrl !== null) {
    const image = document.createElement("img");
    image.alt = "";
    image.src = item.artworkDataUrl;
    art.append(image);
  } else {
    art.append(createServiceMark(item.serviceId, item.serviceName));
  }

  const play = document.createElement("span");
  play.className = "continue-play";
  play.setAttribute("aria-hidden", "true");
  play.textContent = "▶";
  art.append(play);

  const meta = document.createElement("span");
  meta.className = "continue-meta";
  const service = document.createElement("small");
  service.className = "continue-service";
  service.textContent = item.serviceName;
  const title = document.createElement("strong");
  title.textContent = presentation.title;
  const remaining = Math.max(0, item.durationSeconds - item.positionSeconds);
  const detail = document.createElement("small");
  detail.className = "continue-detail";
  detail.textContent = presentation.subtitle === null
    ? `${playbackTime(remaining)} left`
    : `${presentation.subtitle} · ${playbackTime(remaining)} left`;
  const progress = document.createElement("span");
  progress.className = "placeholder-progress";
  progress.setAttribute("aria-hidden", "true");
  const progressValue = document.createElement("span");
  progressValue.style.width = `${Math.min(100, Math.max(0, item.positionSeconds / item.durationSeconds * 100))}%`;
  progress.append(progressValue);
  meta.append(service, title, detail, progress);
  button.append(art, meta);
  button.addEventListener("click", () => void resumeContinueWatchingItem(item));

  const remove = document.createElement("button");
  remove.className = "continue-remove";
  remove.dataset.navGroup = "continue-remove";
  remove.type = "button";
  remove.hidden = !continueManaging;
  remove.textContent = "Remove";
  remove.setAttribute("aria-label", `Remove ${presentation.title} from Continue Watching`);
  remove.addEventListener("click", async () => {
    remove.disabled = true;
    try {
      const removed = await window.nhd.removeContinueWatching(item.id);
      showFeedback(removed
        ? `${presentation.title} removed from Continue Watching.`
        : "That Continue Watching item was already removed.");
    } catch (error) {
      remove.disabled = false;
      showFeedback(error instanceof Error ? error.message : String(error));
    }
  });

  shell.append(button, remove);
  return shell;
}

function renderContinueWatching(): void {
  const visibleItems = continueWatchingItems.filter(
    (item) => enabledServiceIds.has(item.serviceId)
  );
  const shelfItems = !continueManaging && visibleItems.length > 1
    ? visibleItems.filter((item) => item.id !== featuredContinueItemId)
    : visibleItems;
  elements.continueHint.textContent = visibleItems.length === 0
    ? ""
    : `${visibleItems.length} ${visibleItems.length === 1 ? "title" : "titles"}`;
  elements.continueManage.hidden = visibleItems.length === 0;
  elements.continueManage.textContent = continueManaging ? "Done" : "Manage";

  if (shelfItems.length > 0) {
    elements.continueActions.replaceChildren(...shelfItems.map(continueCard));
    return;
  }

  continueManaging = false;

  const placeholder = document.createElement("button");
  placeholder.className = "continue-card continue-placeholder";
  placeholder.type = "button";
  const art = document.createElement("span");
  art.className = "continue-art";
  art.setAttribute("aria-hidden", "true");
  const play = document.createElement("span");
  play.className = "continue-play";
  play.textContent = continueWatchingLoadFailed ? "↻" : "▶";
  art.append(play);
  const meta = document.createElement("span");
  meta.className = "continue-meta";
  const title = document.createElement("strong");
  title.textContent = continueWatchingLoadFailed
    ? "Continue Watching is unavailable"
    : "Start watching in one of your apps";
  const detail = document.createElement("small");
  detail.textContent = continueWatchingLoadFailed
    ? "Your history is still safe. Try loading it again."
    : "Long-form playback will appear here automatically";
  const cue = document.createElement("span");
  cue.className = "continue-empty-cue";
  cue.setAttribute("aria-hidden", "true");
  cue.append(continueWatchingLoadFailed ? "Try again " : "Choose an app ");
  const arrow = document.createElement("span");
  arrow.textContent = "→";
  cue.append(arrow);
  meta.append(title, detail, cue);
  placeholder.append(art, meta);
  placeholder.addEventListener("click", () => {
    if (continueWatchingLoadFailed) {
      void initializeContinueWatching();
      return;
    }
    const firstService = services.find((service) => enabledServiceIds.has(service.id));
    if (firstService === undefined) {
      showView("store");
    } else {
      void openService(firstService.id, firstService.name);
    }
  });
  elements.continueActions.replaceChildren(placeholder);
}

elements.continueManage.addEventListener("click", () => {
  continueManaging = !continueManaging;
  renderContinueWatching();
  elements.continueManage.focus({ preventScroll: true });
});

async function initializeContinueWatching(): Promise<void> {
  continueWatchingLoadFailed = false;
  try {
    continueWatchingItems = await window.nhd.getContinueWatching();
    if (services.length > 0) {
      renderFeatured(orderedEnabledServices());
    }
  } catch {
    continueWatchingItems = [];
    continueWatchingLoadFailed = true;
  }
  renderContinueWatching();
}

async function resumeContinueWatchingItem(item: ContinueWatchingItem): Promise<void> {
  const presentation = presentContinueWatching(item);
  const noticeVersion = showActionNotice({
    detail: `Opening ${item.serviceName}.`,
    state: "progress",
    title: `Resuming ${presentation.title}…`
  });
  try {
    await withUiDeadline(
      window.nhd.resumeContinueWatching(item.id),
      APP_ACTION_TIMEOUT_MS,
      `${item.serviceName} took too long to resume playback.`
    );
    hideActionNotice(noticeVersion);
  } catch (error) {
    replaceActionProgressWithFailure(noticeVersion, {
      detail: actionFailureDetail(error, "Try opening the title again."),
      retry: () => void resumeContinueWatchingItem(item),
      title: `${presentation.title} didn’t resume`
    });
  }
}

async function openService(serviceId: string, serviceName: string): Promise<void> {
  const noticeVersion = showActionNotice({
    detail: "This can take a few seconds.",
    state: "progress",
    title: `Opening ${serviceName}…`
  });
  try {
    await withUiDeadline(
      window.nhd.openService(serviceId),
      APP_ACTION_TIMEOUT_MS,
      `${serviceName} took too long to open.`
    );
    hideActionNotice(noticeVersion);
  } catch (error) {
    replaceActionProgressWithFailure(noticeVersion, {
      detail: actionFailureDetail(error, "Try opening the app again."),
      retry: () => void openService(serviceId, serviceName),
      title: `${serviceName} didn’t open`
    });
  }
}

async function sendSpotifyHomeAction(
  action: "fast-forward" | "play-pause" | "rewind",
  feedback: string
): Promise<void> {
  try {
    if (await withUiDeadline(
      window.nhd.sendInputAction(action),
      PLAYBACK_ACTION_TIMEOUT_MS,
      "Spotify did not respond to that control."
    )) {
      showFeedback(feedback);
    } else {
      throw new Error("Spotify is not ready for that control yet.");
    }
  } catch (error) {
    showActionNotice({
      detail: actionFailureDetail(error, "Try the playback control again."),
      retry: () => void sendSpotifyHomeAction(action, feedback),
      state: "error",
      title: "Spotify control didn’t work"
    });
  }
}

elements.spotifyHomePrevious.addEventListener("click", () => {
  void sendSpotifyHomeAction("rewind", "Previous track sent to Spotify.");
});
elements.spotifyHomePlay.addEventListener("click", () => {
  void sendSpotifyHomeAction("play-pause", "Playback control sent to Spotify.");
});
elements.spotifyHomeNext.addEventListener("click", () => {
  void sendSpotifyHomeAction("fast-forward", "Next track sent to Spotify.");
});
elements.spotifyHomeFullscreen.addEventListener("click", openSpotifyNowPlaying);
elements.spotifyHomeOpen.addEventListener("click", () => {
  void openService("spotify", "Spotify");
});
elements.spotifyNowPlayingPrevious.addEventListener("click", () => {
  void sendSpotifyHomeAction("rewind", "Previous track sent to Spotify.");
});
elements.spotifyNowPlayingPlay.addEventListener("click", () => {
  void sendSpotifyHomeAction("play-pause", "Playback control sent to Spotify.");
});
elements.spotifyNowPlayingNext.addEventListener("click", () => {
  void sendSpotifyHomeAction("fast-forward", "Next track sent to Spotify.");
});
elements.ambientDisplay.addEventListener("click", (event) => {
  if (!spotifyNowPlayingOpen) return;
  if (
    event.target instanceof Element &&
    event.target.closest(".spotify-now-playing-transport button") !== null
  ) {
    return;
  }
  closeSpotifyNowPlaying();
});

function serviceTile(service: ServiceSummary): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "service-tile";
  button.dataset.serviceId = service.id;
  button.type = "button";
  button.setAttribute("aria-label", `Open ${service.name}`);
  button.append(createServiceMark(service.id, service.name));

  if (service.kind === "experimental") {
    const readiness = document.createElement("span");
    readiness.className = "service-readiness";
    readiness.textContent = "Experimental";
    button.append(readiness);
  }

  const footer = document.createElement("span");
  footer.className = "service-tile-footer";
  const name = document.createElement("strong");
  name.textContent = service.name;
  footer.append(name);
  button.append(footer);
  button.addEventListener("click", () => void openService(service.id, service.name));
  return button;
}

function moveService(serviceId: string, offset: -1 | 1): void {
  const enabledOrder = serviceOrder.filter((id) => enabledServiceIds.has(id));
  const currentIndex = enabledOrder.indexOf(serviceId);
  const targetIndex = currentIndex + offset;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= enabledOrder.length) {
    return;
  }

  const targetId = enabledOrder[targetIndex];
  if (targetId === undefined) {
    return;
  }

  const currentOrderIndex = serviceOrder.indexOf(serviceId);
  const targetOrderIndex = serviceOrder.indexOf(targetId);
  [serviceOrder[currentOrderIndex], serviceOrder[targetOrderIndex]] = [
    serviceOrder[targetOrderIndex]!,
    serviceOrder[currentOrderIndex]!
  ];
}

function storeCard(service: ServiceSummary): HTMLElement {
  const shell = document.createElement("article");
  shell.className = "catalog-card-shell";
  shell.dataset.serviceId = service.id;
  const button = document.createElement("button");
  button.className = "catalog-card";
  button.dataset.enabled = "false";
  button.dataset.serviceId = service.id;
  button.type = "button";
  button.setAttribute("aria-label", "Add " + service.name + " to Apps");

  const top = document.createElement("span");
  top.className = "catalog-card-top";
  top.append(createServiceMark(service.id, service.name));
  const status = document.createElement("span");
  status.className = "catalog-status";
  status.textContent = service.kind === "experimental"
    ? "Experimental"
    : service.kind === "test"
      ? "Test tool"
      : service.kind === "custom"
        ? "Custom"
        : "Available";
  top.append(status);

  const copy = document.createElement("span");
  copy.className = "catalog-card-copy";
  const name = document.createElement("strong");
  name.textContent = service.name;
  const detail = document.createElement("small");
  detail.textContent = service.authenticationNote ?? (
    service.kind === "test"
      ? "Widevine host diagnostics and public test playback."
      : service.kind === "experimental"
        ? "Experimental integration; core behavior still needs qualification."
      : "Uses its own isolated local sign-in session."
  );
  copy.append(name, detail);

  const footer = document.createElement("span");
  footer.className = "catalog-card-footer";
  const action = document.createElement("span");
  action.className = "catalog-action";
  action.textContent = "Add to Apps";
  footer.append(action);

  button.append(top, copy, footer);
  button.addEventListener("click", async () => {
    enabledServiceIds.add(service.id);
    if (!serviceOrder.includes(service.id)) {
      serviceOrder.push(service.id);
    }

    try {
      await saveProfilePreferences();
      renderServiceViews();
      showFeedback(`${service.name} added to Apps and Home.`);
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : String(error));
      if (localAppState !== null) {
        applyLocalAppState(localAppState);
      }
      renderServiceViews();
    }
    window.requestAnimationFrame(focusAddAppsCandidate);
  });

  shell.append(button);
  return shell;
}

function installedAppCard(service: ServiceSummary): HTMLElement {
  const shell = document.createElement("article");
  shell.className = "catalog-card-shell installed-app-shell";
  shell.dataset.serviceId = service.id;

  const button = document.createElement("button");
  button.className = "catalog-card installed-app-card";
  button.dataset.enabled = "true";
  button.dataset.serviceId = service.id;
  button.type = "button";
  button.setAttribute("aria-label", "Open " + service.name);

  const top = document.createElement("span");
  top.className = "catalog-card-top";
  top.append(createServiceMark(service.id, service.name));
  const status = document.createElement("span");
  status.className = "catalog-status";
  status.textContent = favoriteServiceIds.has(service.id)
    ? "Favorite"
    : service.kind === "experimental"
      ? "Experimental"
      : service.kind === "custom"
        ? "Custom"
        : "Installed";
  top.append(status);

  const copy = document.createElement("span");
  copy.className = "catalog-card-copy";
  const name = document.createElement("strong");
  name.textContent = service.name;
  const detail = document.createElement("small");
  detail.textContent = service.authenticationNote ?? "Uses its own isolated local sign-in session.";
  copy.append(name, detail);

  const footer = document.createElement("span");
  footer.className = "catalog-card-footer";
  const action = document.createElement("span");
  action.className = "catalog-action";
  action.textContent = "Open";
  footer.append(action);
  button.append(top, copy, footer);
  button.addEventListener("click", () => void openService(service.id, service.name));

  const manage = document.createElement("button");
  manage.className = "app-manage-button";
  manage.type = "button";
  manage.textContent = "Manage";
  manage.setAttribute("aria-label", "Manage " + service.name);
  manage.addEventListener("click", () => openAppManageDialog(service));

  shell.append(button, manage);
  return shell;
}

function renderFeatured(enabledServices: readonly ServiceSummary[]): void {
  const recentItem = [...continueWatchingItems]
    .filter((item) => enabledServiceIds.has(item.serviceId))
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  const featured = recentItem === undefined
    ? enabledServices[0]
    : enabledServices.find((service) => service.id === recentItem.serviceId) ?? enabledServices[0];

  if (featured === undefined) {
    featuredContinueItemId = null;
    featuredServiceId = null;
    delete elements.featuredSection.dataset.serviceId;
    elements.featuredSection.dataset.mode = "empty";
    elements.featuredEyebrow.textContent = "Apps";
    elements.featuredBrand.replaceChildren();
    elements.featuredIcon.className = "featured-icon is-lineup";
    elements.featuredIcon.replaceChildren();
    elements.featuredTitle.textContent = "Add your apps";
    elements.featuredCopy.textContent = "Choose the services you use on this TV.";
    elements.heroOpenButton.disabled = false;
    elements.heroOpenButton.textContent = "Add apps";
    return;
  }

  featuredContinueItemId = recentItem?.id ?? null;
  featuredServiceId = featured.id;
  elements.featuredSection.dataset.serviceId = featured.id;
  elements.featuredSection.dataset.mode = recentItem === undefined ? "launch" : "resume";
  elements.featuredBrand.replaceChildren(createServiceLockup(featured.id, featured.name));
  elements.featuredIcon.replaceChildren();

  if (recentItem?.artworkDataUrl !== null && recentItem?.artworkDataUrl !== undefined) {
    elements.featuredIcon.className = "featured-icon has-artwork";
    const image = document.createElement("img");
    image.className = "featured-poster";
    image.alt = "";
    image.src = recentItem.artworkDataUrl;
    elements.featuredIcon.append(image);
  } else {
    elements.featuredIcon.className = "featured-icon is-lineup";
    const lineup = [
      featured,
      ...enabledServices.filter((service) => service.id !== featured.id)
    ].slice(0, 3);
    lineup.forEach((service, index) => {
      const item = document.createElement("span");
      item.className = `featured-stack-item featured-stack-item-${index + 1}`;
      item.dataset.serviceId = service.id;
      item.append(createServiceMark(service.id, service.name));
      elements.featuredIcon.append(item);
    });
  }

  if (recentItem !== undefined) {
    const presentation = presentContinueWatching(recentItem);
    const remaining = Math.max(0, recentItem.durationSeconds - recentItem.positionSeconds);
    elements.featuredEyebrow.textContent = "Continue watching";
    elements.featuredTitle.textContent = presentation.title;
    elements.featuredCopy.textContent = presentation.subtitle === null
      ? `${playbackTime(remaining)} left in ${featured.name}.`
      : `${presentation.subtitle} · ${playbackTime(remaining)} left in ${featured.name}.`;
    elements.heroOpenButton.textContent = "Resume";
  } else {
    elements.featuredEyebrow.textContent = "Open app";
    elements.featuredTitle.textContent = featured.name;
    elements.featuredCopy.textContent = "Ready when you are.";
    elements.heroOpenButton.textContent = "Open";
  }
  elements.heroOpenButton.disabled = false;
}

function orderedEnabledServices(): ServiceSummary[] {
  const orderIndex = new Map(serviceOrder.map((id, index) => [id, index]));
  return services
    .filter((service) => enabledServiceIds.has(service.id))
    .sort((left, right) => {
      const favoriteDifference = Number(favoriteServiceIds.has(right.id)) -
        Number(favoriteServiceIds.has(left.id));
      return favoriteDifference ||
        (orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER);
    });
}

function renderServiceViews(): void {
  const enabledServices = orderedEnabledServices();
  elements.serviceActions.replaceChildren(...enabledServices.map(serviceTile));
  elements.appsActions.replaceChildren(...enabledServices.map(installedAppCard));
  const storeQuery = elements.storeSearch.value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  const availableServices = services.filter((service) =>
    !enabledServiceIds.has(service.id) &&
    (storeQuery.length === 0 || service.name.toLocaleLowerCase().includes(storeQuery))
  );
  const coreStoreServices = availableServices.filter((service) => service.kind === "commercial");
  const experimentalStoreServices = availableServices.filter(
    (service) => service.kind === "experimental"
  );
  const utilityStoreServices = availableServices.filter(
    (service) => service.kind === "custom" || service.kind === "test"
  );
  elements.storeActions.replaceChildren(
    ...coreStoreServices.map(storeCard)
  );
  elements.experimentalStoreActions.replaceChildren(
    ...experimentalStoreServices.map(storeCard)
  );
  elements.utilityStoreActions.replaceChildren(
    ...utilityStoreServices.map(storeCard)
  );
  elements.storeCoreSection.hidden = coreStoreServices.length === 0;
  elements.storeExperimentalSection.hidden = experimentalStoreServices.length === 0;
  elements.storeUtilitySection.hidden = utilityStoreServices.length === 0;
  elements.storeEmpty.hidden = availableServices.length > 0;
  elements.lineupCount.textContent = `${enabledServices.length} installed`;

  if (enabledServices.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-lineup";
    empty.textContent = "No apps installed yet.";
    elements.serviceActions.append(empty);

    const browse = document.createElement("button");
    browse.className = "empty-lineup empty-lineup-action";
    browse.type = "button";
    browse.textContent = "Add your first app";
    browse.addEventListener("click", () => showView("store"));
    elements.appsActions.append(browse);
  }

  renderFeatured(enabledServices);
  renderContinueWatching();

  if (elements.searchDialog.open) {
    renderSearchResults(elements.searchInput.value);
  }
}

function serviceLoadState(
  title: string,
  detail: string,
  retry: boolean
): HTMLElement {
  const state = document.createElement("article");
  state.className = "service-load-state";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const copy = document.createElement("p");
  copy.textContent = detail;
  state.append(heading, copy);

  if (retry) {
    const action = document.createElement("button");
    action.className = "secondary-action";
    action.type = "button";
    action.textContent = "Try again";
    action.addEventListener("click", () => void initializeServices());
    state.append(action);
  }

  return state;
}

function resetFeaturedForServiceLoad(): void {
  featuredContinueItemId = null;
  featuredServiceId = null;
  delete elements.featuredSection.dataset.serviceId;
  elements.featuredBrand.replaceChildren();
  elements.featuredIcon.className = "featured-icon is-lineup";
  elements.featuredIcon.replaceChildren();
}

function renderServicesLoading(): void {
  servicesLoadFailed = false;
  resetFeaturedForServiceLoad();
  elements.featuredSection.dataset.mode = "loading";
  elements.featuredEyebrow.textContent = "Home";
  elements.featuredTitle.textContent = "Loading your apps";
  elements.featuredCopy.textContent = "This should only take a moment.";
  elements.heroOpenButton.disabled = true;
  elements.heroOpenButton.textContent = "Loading apps…";
  elements.lineupCount.textContent = "Loading apps…";
  elements.serviceActions.replaceChildren(
    serviceLoadState("Loading apps…", "Reading the lineup saved on this TV.", false)
  );
  elements.appsActions.replaceChildren(
    serviceLoadState("Loading apps…", "Reading the lineup saved on this TV.", false)
  );
}

function renderServiceLoadFailure(): void {
  servicesLoadFailed = true;
  resetFeaturedForServiceLoad();
  elements.featuredSection.dataset.mode = "error";
  elements.featuredEyebrow.textContent = "Home";
  elements.featuredTitle.textContent = "Apps couldn’t load";
  elements.featuredCopy.textContent = "NHD-TV couldn’t read the app lineup. Try again.";
  elements.heroOpenButton.disabled = false;
  elements.heroOpenButton.textContent = "Try again";
  elements.lineupCount.textContent = "Couldn’t load apps";
  elements.serviceActions.replaceChildren(
    serviceLoadState(
      "Apps are unavailable",
      "Your lineup is still saved on this TV.",
      true
    )
  );
  elements.appsActions.replaceChildren(
    serviceLoadState(
      "Apps are unavailable",
      "Your lineup is still saved on this TV.",
      true
    )
  );
}

function enabledSearchServices(): ServiceSummary[] {
  return services.filter(
    (service) => enabledServiceIds.has(service.id) && service.searchMode !== "none"
  );
}

async function openProviderSearch(service: ServiceSummary, query: string): Promise<void> {
  const noticeVersion = showActionNotice({
    detail: `Searching for “${query}”.`,
    state: "progress",
    title: `Opening ${service.name} search…`
  });
  try {
    await withUiDeadline(
      window.nhd.searchService(service.id, query),
      APP_ACTION_TIMEOUT_MS,
      `${service.name} search took too long to open.`
    );
    hideActionNotice(noticeVersion);
    elements.searchDialog.close();
  } catch (error) {
    replaceActionProgressWithFailure(noticeVersion, {
      detail: actionFailureDetail(error, "Try searching the app again."),
      retry: () => void openProviderSearch(service, query),
      title: `${service.name} search didn’t open`
    });
  }
}

function renderCatalogSearchResults(
  results: readonly CatalogSearchResult[],
  query: string
): void {
  const searchable = enabledSearchServices();
  const cards = results.map((result) => {
    const card = document.createElement("article");
    card.className = "catalog-search-card";

    const art = document.createElement("div");
    art.className = "catalog-search-art";
    if (result.imageDataUrl !== null) {
      const image = document.createElement("img");
      image.alt = "";
      image.src = result.imageDataUrl;
      art.append(image);
    } else {
      const placeholder = document.createElement("span");
      placeholder.textContent = result.title.slice(0, 1).toLocaleUpperCase();
      placeholder.setAttribute("aria-hidden", "true");
      art.append(placeholder);
    }

    const copy = document.createElement("div");
    copy.className = "catalog-search-copy";
    const title = document.createElement("h3");
    title.textContent = result.title;
    const meta = document.createElement("p");
    const year = result.premiered?.slice(0, 4) ?? null;
    meta.textContent = [year, result.network, ...result.genres]
      .filter((value) => value !== null && value.length > 0)
      .join(" · ");
    const summary = document.createElement("p");
    summary.className = "catalog-search-summary";
    summary.textContent = result.summary ?? "Choose an installed app to search for this title.";
    const source = document.createElement("small");
    source.textContent = "TV show metadata by TVmaze";

    const actions = document.createElement("div");
    actions.className = "catalog-search-actions";
    actions.dataset.navGroup = "catalog-result-" + result.id;
    if (searchable.length === 0) {
      const browse = document.createElement("button");
      browse.className = "catalog-result-primary";
      browse.type = "button";
      browse.textContent = "Add an app";
      browse.addEventListener("click", () => {
        elements.searchDialog.close();
        showView("store");
      });
      actions.append(browse);
    } else if (searchable.length === 1) {
      const service = searchable[0]!;
      const search = document.createElement("button");
      search.className = "catalog-result-primary";
      search.type = "button";
      search.textContent = service.searchMode === "query"
        ? `Search ${service.name}`
        : `Open ${service.name}`;
      search.setAttribute("aria-label", `Search ${service.name} for ${result.title}`);
      search.addEventListener("click", () => void openProviderSearch(service, result.title));
      actions.append(search);
    } else {
      const choose = document.createElement("button");
      choose.className = "catalog-result-primary";
      choose.type = "button";
      choose.textContent = "Choose an app";
      choose.setAttribute("aria-expanded", "false");

      const providers = document.createElement("div");
      providers.className = "catalog-result-providers";
      providers.hidden = true;
      for (const service of searchable) {
        const button = document.createElement("button");
        button.className = "catalog-result-provider";
        button.type = "button";
        button.setAttribute("aria-label", "Search " + service.name + " for " + result.title);
        button.append(createServiceMark(service.id, service.name));
        const label = document.createElement("span");
        label.textContent = service.searchMode === "query"
          ? "Search " + service.name
          : "Open " + service.name;
        button.append(label);
        button.addEventListener("click", () => void openProviderSearch(service, result.title));
        providers.append(button);
      }
      choose.addEventListener("click", () => {
        const opening = providers.hidden;
        const remote = choose.dataset.remoteFocused === "true";
        for (const other of elements.catalogSearchResults.querySelectorAll<HTMLElement>(
          ".catalog-result-providers"
        )) {
          other.hidden = true;
          other.previousElementSibling?.setAttribute("aria-expanded", "false");
        }
        providers.hidden = !opening;
        choose.setAttribute("aria-expanded", String(opening));
        if (opening) {
          const firstProvider = providers.querySelector<HTMLButtonElement>("button");
          firstProvider?.focus({ preventScroll: true });
          setRemoteFocusedElement(remote ? firstProvider : null);
        } else {
          choose.focus({ preventScroll: true });
          setRemoteFocusedElement(remote ? choose : null);
        }
      });
      actions.append(choose, providers);
    }
    copy.append(title, meta, summary, source, actions);
    card.append(art, copy);
    return card;
  });
  elements.catalogSearchResults.replaceChildren(...cards);
  elements.catalogSearchStatus.textContent = cards.length === 0
    ? "No matches · try another title"
    : String(cards.length) + " results · data and posters: TVmaze";
  elements.catalogSearchSection.hidden = false;

  if (cards.length === 0 && query.length >= 2) {
    const empty = document.createElement("div");
    empty.className = "catalog-search-empty";
    empty.textContent = "No online TV-show results for “" + query + "”.";
    elements.catalogSearchResults.append(empty);
  }

  if (promoteRemoteCatalogSearchFocus && cards.length > 0 && elements.searchDialog.open) {
    const firstCatalogResult = elements.catalogSearchResults.querySelector<HTMLButtonElement>(
      "button"
    );
    firstCatalogResult?.focus({ preventScroll: true });
    setRemoteFocusedElement(firstCatalogResult ?? null);
  }
  promoteRemoteCatalogSearchFocus = false;
}

function renderCatalogSearchFailure(query: string, error: unknown): void {
  const timedOut = error instanceof Error && error.message.includes("taking too long");
  elements.catalogSearchStatus.textContent = timedOut
    ? "Show search took too long"
    : "Show search is temporarily unavailable";
  const unavailable = document.createElement("div");
  unavailable.className = "catalog-search-empty is-retry";
  const title = document.createElement("strong");
  title.textContent = timedOut ? "The show search timed out" : "The show search is unavailable";
  const detail = document.createElement("p");
  detail.textContent = "Local history and searches inside your apps still work below.";
  const retry = document.createElement("button");
  retry.className = "secondary-action";
  retry.type = "button";
  retry.textContent = "Try show search again";
  retry.addEventListener("click", () => {
    promoteRemoteCatalogSearchFocus = retry.dataset.remoteFocused === "true";
    scheduleCatalogSearch(query);
  });
  unavailable.append(title, detail, retry);
  elements.catalogSearchResults.replaceChildren(unavailable);
}

function scheduleCatalogSearch(query: string): void {
  catalogSearchVersion += 1;
  const version = catalogSearchVersion;
  if (catalogSearchTimer !== null) {
    window.clearTimeout(catalogSearchTimer);
    catalogSearchTimer = null;
  }
  if (query.length < 2) {
    elements.catalogSearchSection.hidden = true;
    elements.catalogSearchResults.replaceChildren();
    return;
  }

  elements.catalogSearchSection.hidden = false;
  elements.catalogSearchStatus.textContent = "Searching TVmaze…";
  elements.catalogSearchResults.replaceChildren();
  catalogSearchTimer = window.setTimeout(() => {
    catalogSearchTimer = null;
    void withUiDeadline(
      window.nhd.searchCatalog(query),
      CATALOG_SEARCH_TIMEOUT_MS,
      "Show search is taking too long."
    )
      .then((results) => {
        if (version === catalogSearchVersion) {
          renderCatalogSearchResults(results, query);
        }
      })
      .catch((error: unknown) => {
        if (version !== catalogSearchVersion) {
          return;
        }
        renderCatalogSearchFailure(query, error);
      });
  }, 450);
}

function renderSearchResults(rawQuery: string): void {
  const query = rawQuery.replace(/\s+/g, " ").trim();
  const searchable = enabledSearchServices();
  scheduleCatalogSearch(query);

  const localResults = query.length === 0
    ? continueWatchingItems
      .filter((item) => enabledServiceIds.has(item.serviceId))
      .slice(0, 6)
    : matchContinueWatching(continueWatchingItems, enabledServiceIds, query);
  const historyButtons = localResults.map((item) => {
    const presentation = presentContinueWatching(item);
    const button = document.createElement("button");
    button.className = "search-result-card search-history-card";
    button.type = "button";
    button.setAttribute("aria-label", `Resume ${presentation.title} in ${item.serviceName}`);
    const art = document.createElement("span");
    art.className = "search-history-art";
    if (item.artworkDataUrl !== null) {
      const image = document.createElement("img");
      image.alt = "";
      image.src = item.artworkDataUrl;
      art.append(image);
    } else {
      art.append(createServiceMark(item.serviceId, item.serviceName));
    }
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = presentation.title;
    const detail = document.createElement("small");
    detail.textContent = `Resume in ${item.serviceName}`;
    copy.append(title, detail);
    button.append(art, copy);
    button.addEventListener("click", () => {
      elements.searchDialog.close();
      void resumeContinueWatchingItem(item);
    });
    return button;
  });
  elements.searchHistoryResults.replaceChildren(...historyButtons);
  elements.searchHistorySection.hidden = query.length > 0 && historyButtons.length === 0;
  elements.searchHistoryTitle.textContent = query.length === 0
    ? "Continue watching"
    : "On this TV";
  elements.searchHistoryCount.textContent = historyButtons.length === 0
    ? ""
    : `${historyButtons.length} ${historyButtons.length === 1 ? "title" : "titles"}`;
  elements.searchEmptyState.hidden = query.length > 0 || historyButtons.length > 0;
  elements.searchEmptyTitle.textContent = query.length === 0
    ? "Search across your TV"
    : `No match on this TV for “${query}”`;
  elements.searchEmptyCopy.textContent = query.length === 0
    ? "Enter a title, person, genre, or topic. Recent viewing will also appear here."
    : "TV-show matches and app search remain available below.";

  if (query.length === 0) {
    elements.searchProviderSection.hidden = true;
    elements.searchResults.replaceChildren();
    return;
  }

  const buttons = searchable.map((service) => {
    const button = document.createElement("button");
    button.className = "search-provider-chip";
    button.dataset.serviceId = service.id;
    button.type = "button";
    button.setAttribute("aria-label", service.searchMode === "query"
      ? `Search ${service.name} for ${query}`
      : `Open ${service.name} search`);
    button.append(createServiceMark(service.id, service.name));

    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = service.name;
    const detail = document.createElement("small");
    detail.textContent = service.searchMode === "query" ? "Search this app" : "Open app search";
    copy.append(title, detail);
    button.append(copy);
    button.addEventListener("click", () => void openProviderSearch(service, query));
    return button;
  });

  elements.searchResults.replaceChildren(...buttons);
  elements.searchProviderSection.hidden = false;
  elements.searchResultCount.textContent = buttons.length === 0
    ? "Add a searchable app first"
    : `${buttons.length} ${buttons.length === 1 ? "app" : "apps"} available`;
}

function openSearchDialog(query = "", remote = false): void {
  if (!elements.searchDialog.open) {
    elements.searchDialog.showModal();
  }

  elements.searchInput.value = query;
  renderSearchResults(query);
  if (remote && query.length > 0) {
    const historyResult = elements.searchHistoryResults.querySelector<HTMLButtonElement>("button");
    const catalogResult = elements.catalogSearchResults.querySelector<HTMLButtonElement>("button");
    const providerResult = elements.searchResults.querySelector<HTMLButtonElement>("button");
    const firstResult = historyResult ?? catalogResult ?? providerResult;
    promoteRemoteCatalogSearchFocus = historyResult === null
      && catalogResult === null
      && providerResult !== null;
    firstResult?.focus({ preventScroll: true });
    setRemoteFocusedElement(firstResult ?? null);
  } else {
    promoteRemoteCatalogSearchFocus = false;
    elements.searchInput.focus();
  }
}

elements.topSearchButton.addEventListener("click", () => openSearchDialog());
elements.searchClose.addEventListener("click", () => elements.searchDialog.close());
elements.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  renderSearchResults(elements.searchInput.value);
  const firstResult = elements.searchHistoryResults.querySelector<HTMLButtonElement>("button")
    ?? elements.catalogSearchResults.querySelector<HTMLButtonElement>("button")
    ?? elements.searchResults.querySelector<HTMLButtonElement>("button");
  firstResult?.focus();
});
elements.searchInput.addEventListener("input", () => renderSearchResults(elements.searchInput.value));
elements.searchDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  elements.searchDialog.close();
});
elements.searchDialog.addEventListener("close", () => {
  catalogSearchVersion += 1;
  promoteRemoteCatalogSearchFocus = false;
  if (catalogSearchTimer !== null) {
    window.clearTimeout(catalogSearchTimer);
    catalogSearchTimer = null;
  }
});

async function initializeServices(): Promise<void> {
  if (servicesLoading) return;
  servicesLoading = true;
  renderServicesLoading();

  void window.nhd.getOpenAiCredentialStatus()
    .then(renderOpenAiCredentialStatus)
    .catch(() => renderOpenAiCredentialStatus({
      detail: "Secure credential storage is unavailable right now.",
      state: "unavailable"
    }));

  try {
    const [availableServices, state] = await Promise.all([
      window.nhd.getServices(),
      window.nhd.getLocalAppState()
    ]);
    services = availableServices;
    applyLocalAppState(state);
    servicesLoadFailed = false;
    renderServiceViews();
  } catch {
    renderServiceLoadFailure();
  } finally {
    servicesLoading = false;
  }
}

elements.storeSearch.addEventListener("input", renderServiceViews);

elements.customServiceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = elements.customServiceForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit !== null) {
    submit.disabled = true;
  }

  try {
    applyLocalAppState(await window.nhd.addCustomService(
      elements.customServiceName.value,
      elements.customServiceUrl.value
    ));
    services = await window.nhd.getServices();
    elements.customServiceName.value = "";
    elements.customServiceUrl.value = "";
    renderServiceViews();
    showFeedback("Custom service added to this profile's Home.");
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : String(error));
  } finally {
    if (submit !== null) {
      submit.disabled = false;
    }
  }
});

function showView(view: AppView): void {
  currentView = view;
  document.body.dataset.view = view;

  for (const appView of document.querySelectorAll<HTMLElement>(".app-view")) {
    appView.hidden = appView.dataset.view !== view;
  }

  for (const navButton of document.querySelectorAll<HTMLButtonElement>(
    ".nav-button[data-view-target], .settings-chip[data-view-target]"
  )) {
    const current = navButton.dataset.viewTarget === view ||
      (view === "store" && navButton.dataset.viewTarget === "apps");
    navButton.classList.toggle("nav-current", current);

    if (current) {
      navButton.setAttribute("aria-current", "page");
    } else {
      navButton.removeAttribute("aria-current");
    }
  }

  window.scrollTo({ behavior: "smooth", top: 0 });
  window.requestAnimationFrame(() => {
    updateHorizontalRailControls();
    if (view === "store") focusAddAppsCandidate();
  });
}

function focusAddAppsCandidate(): void {
  const target = elements.storeView.querySelector<HTMLElement>(
    ".catalog-card:not(:disabled), summary"
  );
  target?.focus({ preventScroll: true });
}

function returnToApps(remote = false): void {
  showView("apps");
  elements.appsAddButton.focus({ preventScroll: true });
  setRemoteFocusedElement(remote ? elements.appsAddButton : null);
}

function updateHorizontalRailControls(): void {
  for (const controls of document.querySelectorAll<HTMLElement>(".rail-scroll-controls")) {
    const rowId = controls.dataset.railTarget;
    const row = rowId === undefined ? null : document.getElementById(rowId);
    const previous = controls.querySelector<HTMLButtonElement>('[data-rail-direction="-1"]');
    const next = controls.querySelector<HTMLButtonElement>('[data-rail-direction="1"]');
    if (!(row instanceof HTMLElement) || previous === null || next === null) {
      continue;
    }
    const maximum = Math.max(0, row.scrollWidth - row.clientWidth);
    controls.hidden = maximum <= 2;
    previous.disabled = row.scrollLeft <= 2;
    next.disabled = row.scrollLeft >= maximum - 2;
  }
}

function railSnapPositions(row: HTMLElement): number[] {
  const items = [...row.children].filter(
    (element): element is HTMLElement => element instanceof HTMLElement
  );
  const firstOffset = items[0]?.offsetLeft ?? 0;
  return items.map((item) => Math.max(0, item.offsetLeft - firstOffset));
}

function snapHorizontalRail(row: HTMLElement): void {
  const positions = railSnapPositions(row);
  if (positions.length === 0) return;
  const nearest = positions.reduce((best, position) =>
    Math.abs(position - row.scrollLeft) < Math.abs(best - row.scrollLeft)
      ? position
      : best
  );
  if (Math.abs(nearest - row.scrollLeft) > 2) {
    row.scrollTo({ behavior: "smooth", left: nearest });
  }
}

function stepHorizontalRail(row: HTMLElement, direction: -1 | 1): void {
  const positions = railSnapPositions(row);
  if (positions.length === 0) return;
  const current = row.scrollLeft;
  const target = direction > 0
    ? positions.find((position) => position > current + 4) ?? positions.at(-1) ?? current
    : [...positions].reverse().find((position) => position < current - 4) ?? positions[0] ?? current;
  row.scrollTo({ behavior: "smooth", left: target });
}

function initializeHorizontalRails(): void {
  for (const row of document.querySelectorAll<HTMLElement>(".rail > .horizontal-row")) {
    if (row.id.length === 0) {
      continue;
    }
    const rail = row.closest<HTMLElement>(".rail");
    const heading = rail?.querySelector<HTMLElement>(":scope > .section-heading");
    if (heading === null || heading === undefined) {
      continue;
    }

    const controls = document.createElement("span");
    controls.className = "rail-scroll-controls";
    controls.dataset.railTarget = row.id;
    controls.dataset.navGroup = row.dataset.navGroup === undefined
      ? "rail-scroll"
      : row.dataset.navGroup + "-scroll";

    for (const direction of [-1, 1] as const) {
      const button = document.createElement("button");
      button.className = "rail-scroll-button";
      button.type = "button";
      button.dataset.railDirection = String(direction);
      button.textContent = direction < 0 ? "‹" : "›";
      button.setAttribute(
        "aria-label",
        (direction < 0 ? "Scroll " : "Show more ") + (heading.querySelector("h2")?.textContent ?? "items")
      );
      button.addEventListener("click", () => {
        stepHorizontalRail(row, direction);
      });
      controls.append(button);
    }
    heading.append(controls);
    let snapTimer: number | null = null;
    row.addEventListener("scroll", () => {
      updateHorizontalRailControls();
      if (snapTimer !== null) window.clearTimeout(snapTimer);
      snapTimer = window.setTimeout(() => {
        snapTimer = null;
        snapHorizontalRail(row);
      }, 140);
    }, { passive: true });
    row.addEventListener("wheel", (event) => {
      if (
        row.scrollWidth <= row.clientWidth + 2 ||
        Math.abs(event.deltaY) <= Math.abs(event.deltaX)
      ) {
        return;
      }
      event.preventDefault();
      row.scrollLeft += event.deltaY;
    }, { passive: false });
  }
  new ResizeObserver(updateHorizontalRailControls).observe(document.body);
  updateHorizontalRailControls();
}

for (const target of document.querySelectorAll<HTMLButtonElement>("[data-view-target]")) {
  target.addEventListener("click", () => {
    const view = target.dataset.viewTarget;

    if (view === "apps" || view === "home" || view === "settings" || view === "store") {
      showView(view);
    }
  });
}

elements.heroOpenButton.addEventListener("click", () => {
  if (servicesLoadFailed) {
    void initializeServices();
    return;
  }

  if (featuredContinueItemId !== null) {
    const item = continueWatchingItems.find(({ id }) => id === featuredContinueItemId);
    if (item !== undefined) {
      void resumeContinueWatchingItem(item);
      return;
    }
  }

  if (featuredServiceId === null) {
    showView("store");
    return;
  }

  const featured = services.find((service) => service.id === featuredServiceId);

  if (featured !== undefined) {
    void openService(featured.id, featured.name);
  }
});

function renderProfileDialog(): void {
  if (localAppState === null) {
    return;
  }

  const buttons = localAppState.profiles.map((profile) => {
    const button = document.createElement("button");
    button.className = "profile-option";
    button.type = "button";
    button.setAttribute("aria-current", String(profile.id === localAppState?.activeProfileId));

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = profile.name.slice(0, 1).toUpperCase();
    avatar.setAttribute("aria-hidden", "true");
    const copy = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = profile.name;
    const detail = document.createElement("small");
    detail.textContent = profile.id === localAppState?.activeProfileId ? "Currently watching" : "Switch profile";
    copy.append(name, detail);
    button.append(avatar, copy);
    button.addEventListener("click", async () => {
      if (profile.id === localAppState?.activeProfileId) {
        elements.profileDialog.close();
        return;
      }

      button.disabled = true;
      try {
        applyLocalAppState(await window.nhd.selectProfile(profile.id));
        continueWatchingItems = await window.nhd.getContinueWatching();
        renderServiceViews();
        renderProfileDialog();
        showFeedback(`Switched to ${profile.name}.`);
      } catch (error) {
        showFeedback(error instanceof Error ? error.message : String(error));
      } finally {
        button.disabled = false;
      }
    });
    return button;
  });
  elements.profileList.replaceChildren(...buttons);
}

function openProfileDialog(): void {
  renderProfileDialog();
  elements.profileDialog.showModal();
  elements.profileList.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus();
}

for (const selector of ["#profile-button", "#profile-card"]) {
  requireElement<HTMLButtonElement>(selector, selector).addEventListener("click", openProfileDialog);
}

elements.profileClose.addEventListener("click", () => elements.profileDialog.close());
elements.profileDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  elements.profileDialog.close();
});
elements.profileCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = elements.profileCreateForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit !== null) {
    submit.disabled = true;
  }

  try {
    const state = await window.nhd.createProfile(elements.profileCreateName.value);
    applyLocalAppState(state);
    continueWatchingItems = await window.nhd.getContinueWatching();
    elements.profileCreateName.value = "";
    renderServiceViews();
    renderProfileDialog();
    showFeedback(`Created ${state.profiles.find((profile) => profile.id === state.activeProfileId)?.name ?? "profile"}.`);
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : String(error));
  } finally {
    if (submit !== null) {
      submit.disabled = false;
    }
  }
});

function closeAppManageDialog(): void {
  pendingManageService = null;
  if (elements.appManageDialog.open) {
    elements.appManageDialog.close();
  }
}

function renderAppManageDialog(): void {
  const service = pendingManageService;
  if (service === null) {
    return;
  }

  const enabledOrder = serviceOrder.filter((id) => enabledServiceIds.has(id));
  const index = enabledOrder.indexOf(service.id);
  const favorite = favoriteServiceIds.has(service.id);
  elements.appManageBrand.replaceChildren(createServiceMark(service.id, service.name));
  elements.appManageName.textContent = service.name;
  elements.appManageStatus.textContent = [
    favorite ? "Favorite" : "Installed",
    service.kind === "experimental" ? "Experimental integration" : null,
    "sign-in data stays local"
  ].filter((value) => value !== null).join(" · ");
  elements.appManageFavorite.textContent = favorite ? "Remove favorite" : "Add to favorites";
  elements.appManageFavorite.setAttribute("aria-pressed", String(favorite));
  elements.appManageEarlier.disabled = index <= 0;
  elements.appManageLater.disabled = index < 0 || index >= enabledOrder.length - 1;
  elements.appManageDelete.hidden = service.kind !== "custom";
}

function openAppManageDialog(service: ServiceSummary): void {
  pendingManageService = service;
  renderAppManageDialog();
  elements.appManageDialog.showModal();
  elements.appManageOpen.focus();
}

async function persistManagedChange(
  previousState: LocalAppState | null,
  message: string
): Promise<void> {
  try {
    await saveProfilePreferences();
    renderServiceViews();
    renderAppManageDialog();
    showFeedback(message);
  } catch (error) {
    if (previousState !== null) {
      applyLocalAppState(previousState);
    }
    renderServiceViews();
    renderAppManageDialog();
    showFeedback(error instanceof Error ? error.message : String(error));
  }
}

elements.appManageClose.addEventListener("click", closeAppManageDialog);
elements.appManageDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeAppManageDialog();
});
elements.appManageOpen.addEventListener("click", () => {
  const service = pendingManageService;
  if (service === null) {
    return;
  }
  closeAppManageDialog();
  void openService(service.id, service.name);
});
elements.appManageFavorite.addEventListener("click", () => {
  const service = pendingManageService;
  if (service === null) {
    return;
  }
  const previousState = localAppState;
  const wasFavorite = favoriteServiceIds.has(service.id);
  if (wasFavorite) {
    favoriteServiceIds.delete(service.id);
  } else {
    favoriteServiceIds.add(service.id);
  }
  void persistManagedChange(
    previousState,
    service.name + (wasFavorite ? " removed from favorites." : " added to favorites.")
  );
});
elements.appManageEarlier.addEventListener("click", () => {
  const service = pendingManageService;
  if (service === null) {
    return;
  }
  const previousState = localAppState;
  moveService(service.id, -1);
  void persistManagedChange(previousState, service.name + " moved earlier.");
});
elements.appManageLater.addEventListener("click", () => {
  const service = pendingManageService;
  if (service === null) {
    return;
  }
  const previousState = localAppState;
  moveService(service.id, 1);
  void persistManagedChange(previousState, service.name + " moved later.");
});
elements.appManageRemove.addEventListener("click", () => {
  const service = pendingManageService;
  if (service === null) {
    return;
  }
  const previousState = localAppState;
  enabledServiceIds.delete(service.id);
  favoriteServiceIds.delete(service.id);
  serviceOrder = serviceOrder.filter((id) => id !== service.id);
  closeAppManageDialog();
  void persistManagedChange(previousState, service.name + " removed from Apps. Its local session was kept.");
});
elements.appManageClear.addEventListener("click", () => {
  const service = pendingManageService;
  if (service === null) {
    return;
  }
  closeAppManageDialog();
  openClearDataDialog(service);
});
elements.appManageDelete.addEventListener("click", () => {
  const service = pendingManageService;
  if (service === null) {
    return;
  }
  closeAppManageDialog();
  openRemoveCustomDialog(service);
});

function openClearDataDialog(service: ServiceSummary): void {
  pendingClearService = service;
  pendingServiceAction = "clear";
  elements.clearDataTitle.textContent = `Sign out of ${service.name}?`;
  elements.clearDataCopy.textContent = `This removes ${service.name}'s local cookies, storage, and cache from this computer. Your NHD-TV lineup and Continue Watching history are kept.`;
  elements.clearDataConfirm.textContent = "Clear data";
  elements.clearDataDialog.showModal();
  elements.clearDataCancel.focus();
}

function openRemoveCustomDialog(service: ServiceSummary): void {
  pendingClearService = service;
  pendingServiceAction = "remove-custom";
  elements.clearDataTitle.textContent = `Remove ${service.name}?`;
  elements.clearDataCopy.textContent = "This removes the custom integration from every local profile and clears its isolated local cookies, storage, and cache.";
  elements.clearDataConfirm.textContent = "Remove service";
  elements.clearDataDialog.showModal();
  elements.clearDataCancel.focus();
}

function cancelClearData(): void {
  pendingClearService = null;
  if (elements.clearDataDialog.open) {
    elements.clearDataDialog.close();
  }
}

elements.clearDataCancel.addEventListener("click", cancelClearData);
elements.clearDataDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  cancelClearData();
});
elements.clearDataConfirm.addEventListener("click", async () => {
  const service = pendingClearService;
  if (service === null) {
    cancelClearData();
    return;
  }

  elements.clearDataConfirm.disabled = true;
  try {
    if (pendingServiceAction === "remove-custom") {
      applyLocalAppState(await window.nhd.removeCustomService(service.id));
      services = await window.nhd.getServices();
      renderServiceViews();
    } else {
      await window.nhd.clearServiceData(service.id);
    }
    cancelClearData();
    showFeedback(pendingServiceAction === "remove-custom"
      ? `${service.name} was removed and its local data was cleared.`
      : `${service.name} local sign-in data was cleared.`);
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : String(error));
  } finally {
    elements.clearDataConfirm.disabled = false;
  }
});

function remoteExpiryCopy(expiresAt: number | null): string {
  if (expiresAt === null) {
    return "";
  }

  const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1_000));
  return seconds === 0 ? "Pairing code expired." : `Code expires in ${seconds} seconds.`;
}

function renderRemoteStatus(status: RemoteStatus): void {
  currentRemoteStatus = status;
  const showInvite = status.connectedControllers === 0
    && status.state === "pairing"
    && status.qrDataUrl !== null
    && status.qrDataUrl !== dismissedRemoteInviteQr;
  elements.remoteDetail.textContent = status.detail;
  elements.remoteInvite.hidden = !showInvite;
  elements.remotePairingView.hidden = status.state !== "pairing" || status.qrDataUrl === null;
  elements.remoteApproval.hidden = status.state !== "awaiting-approval";
  elements.remoteReady.hidden = status.state !== "ready";
  elements.remoteStart.hidden = status.state === "awaiting-approval";
  elements.remoteStart.textContent = status.state === "ready"
    ? "Pair another phone"
    : status.state === "pairing"
      ? "Refresh pairing code"
      : "Create pairing code";
  elements.remoteReadyCopy.textContent = status.connectedControllers === 1
    ? "1 phone remote connected for this session."
    : `${status.connectedControllers} phone remotes connected for this session.`;
  elements.remoteExpiry.textContent = remoteExpiryCopy(status.expiresAt);
  elements.topRemoteButton.dataset.state = status.state;
  elements.topRemoteLabel.textContent = status.state === "awaiting-approval"
    ? "Approve phone"
    : status.state === "pairing"
      ? "Pairing code ready"
      : status.state === "ready"
        ? status.connectedControllers === 1
          ? "1 remote"
          : `${status.connectedControllers} remotes`
        : "Pair a phone";
  elements.settingsRemoteCopy.textContent = status.state === "ready"
    ? `${status.connectedControllers} connected for this session`
    : status.state === "awaiting-approval"
      ? "A phone is waiting for approval"
      : status.state === "pairing"
        ? "Pairing code is ready to scan"
        : "Pair on your trusted local network";

  if (status.qrDataUrl !== null) {
    elements.remoteQr.src = status.qrDataUrl;
    elements.remoteInviteQr.src = status.qrDataUrl;
  } else {
    elements.remoteQr.removeAttribute("src");
    elements.remoteInviteQr.removeAttribute("src");
  }
}

function showRemoteError(error: unknown): void {
  elements.remoteDetail.textContent = error instanceof Error ? error.message : String(error);
  elements.remoteStart.disabled = false;
}

async function refreshRemoteStatus(): Promise<void> {
  renderRemoteStatus(await withUiDeadline(
    window.nhd.getRemoteStatus(),
    PAIRING_OPERATION_TIMEOUT_MS,
    "Phone remote status took too long to load."
  ));
}

function hasShownRemoteOnboarding(): boolean {
  try {
    return localStorage.getItem(REMOTE_ONBOARDING_STORAGE_KEY) === "shown";
  } catch {
    return false;
  }
}

function rememberRemoteOnboarding(): void {
  try {
    localStorage.setItem(REMOTE_ONBOARDING_STORAGE_KEY, "shown");
  } catch {
    // Pairing remains available from the header when storage is unavailable.
  }
}

async function initializeRemoteStatus(): Promise<void> {
  try {
    await refreshRemoteStatus();
    if (
      currentRemoteStatus?.state === "inactive"
      && currentRemoteStatus.connectedControllers === 0
      && !hasShownRemoteOnboarding()
    ) {
      renderRemoteStatus(await withUiDeadline(
        window.nhd.startRemotePairing(),
        PAIRING_OPERATION_TIMEOUT_MS,
        "Pairing took too long. Try again."
      ));
      rememberRemoteOnboarding();
    }
  } catch (error) {
    showRemoteError(error);
  }
}

async function startRemotePairing(): Promise<void> {
  elements.remoteStart.disabled = true;
  elements.remoteDetail.textContent = "Creating a private, short-lived pairing code…";

  try {
    renderRemoteStatus(await withUiDeadline(
      window.nhd.startRemotePairing(),
      PAIRING_OPERATION_TIMEOUT_MS,
      "Pairing took too long. Try again."
    ));
  } catch (error) {
    showRemoteError(error);
  } finally {
    elements.remoteStart.disabled = false;
  }
}

function openRemoteDialog(): void {
  elements.remoteDialog.showModal();
  void refreshRemoteStatus()
    .then(() => {
      if (currentRemoteStatus?.state === "inactive") {
        return startRemotePairing();
      }

      elements.remoteStart.focus();
    })
    .catch(showRemoteError);
}

elements.topRemoteButton.addEventListener("click", openRemoteDialog);
elements.settingsRemoteButton.addEventListener("click", openRemoteDialog);
elements.remoteInviteDismiss.addEventListener("click", () => {
  dismissedRemoteInviteQr = currentRemoteStatus?.qrDataUrl ?? null;
  elements.remoteInvite.hidden = true;
  elements.topRemoteButton.focus();
});
elements.remoteStart.addEventListener("click", () => void startRemotePairing());
elements.remoteClose.addEventListener("click", () => elements.remoteDialog.close());
elements.remoteApprove.addEventListener("click", () => {
  void window.nhd.approveRemotePairing().then(renderRemoteStatus).catch(showRemoteError);
});
elements.remoteDeny.addEventListener("click", () => {
  void window.nhd.denyRemotePairing().then(renderRemoteStatus).catch(showRemoteError);
});

function closeVoiceDialog(): void {
  elements.voiceKeyInput.value = "";
  setVoiceInlineError(elements.voiceKeyError, null);
  setVoiceInlineError(elements.voiceRegionError, null);
  elements.voiceDialog.close();
}

async function openVoiceDialog(initialFocus: "key" | "region" = "key"): Promise<void> {
  elements.voiceKeyInput.value = "";
  elements.voiceRegionInput.value = localAppState?.devicePreferences.voiceRegion ?? "";
  setVoiceInlineError(elements.voiceKeyError, null);
  setVoiceInlineError(elements.voiceRegionError, null);
  if (!elements.voiceDialog.open) {
    elements.voiceDialog.showModal();
  }
  try {
    renderOpenAiCredentialStatus(await window.nhd.getOpenAiCredentialStatus());
  } catch (error) {
    renderOpenAiCredentialStatus({
      detail: "Secure credential storage could not be reached.",
      state: "unavailable"
    });
    setVoiceInlineError(
      elements.voiceKeyError,
      error instanceof Error ? error.message : String(error)
    );
  }
  if (initialFocus === "region") {
    elements.voiceRegionInput.focus();
  } else if (openAiCredentialStatus.state === "unavailable") {
    elements.voiceClose.focus();
  } else {
    elements.voiceKeyInput.focus();
  }
}

elements.voiceSettingsButton.addEventListener("click", () => void openVoiceDialog("key"));
elements.voiceRegionButton.addEventListener("click", () => void openVoiceDialog("region"));
elements.voiceTestButton.addEventListener("click", () => {
  elements.voiceTestButton.disabled = true;
  elements.voiceTestButton.textContent = "Testing…";
  elements.voiceTestCredential.dataset.state = "pending";
  elements.voiceTestInterpretation.dataset.state = "pending";
  elements.voiceTestSummary.textContent = "Checking the saved key and voice understanding…";
  void window.nhd.testOpenAiVoiceSetup()
    .then(renderVoiceSetupDiagnostic)
    .catch((error: unknown) => renderVoiceSetupDiagnostic({
      checkedAt: Date.now(),
      credential: "pending",
      detail: error instanceof Error ? error.message : "Voice setup could not be tested.",
      interpretation: "failed",
      latencyMs: null
    }))
    .finally(() => {
      elements.voiceTestButton.disabled = false;
    });
});
elements.voiceClose.addEventListener("click", closeVoiceDialog);
elements.voiceDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeVoiceDialog();
});

elements.voiceKeyInput.addEventListener("input", () => {
  const value = elements.voiceKeyInput.value.trim();
  if (value.length >= 20 && value.length <= 512 && !/\s/.test(value)) {
    setVoiceInlineError(elements.voiceKeyError, null);
  }
});

elements.voiceKeyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const apiKey = elements.voiceKeyInput.value;
  setVoiceInlineError(elements.voiceKeyError, null);
  elements.voiceKeySubmit.disabled = true;
  try {
    renderOpenAiCredentialStatus(await window.nhd.saveOpenAiApiKey(apiKey));
    elements.voiceKeyInput.value = "";
    showFeedback("OpenAI API key saved securely on this computer.");
  } catch (error) {
    setVoiceInlineError(
      elements.voiceKeyError,
      error instanceof Error ? error.message : String(error)
    );
    elements.voiceKeyInput.focus();
  } finally {
    elements.voiceKeySubmit.disabled = openAiCredentialStatus.state === "unavailable";
  }
});

elements.voiceRemoveKey.addEventListener("click", async () => {
  setVoiceInlineError(elements.voiceKeyError, null);
  elements.voiceRemoveKey.disabled = true;
  try {
    renderOpenAiCredentialStatus(await window.nhd.clearOpenAiApiKey());
    if (localAppState?.devicePreferences.voiceControlEnabled === true) {
      await saveDevicePreferences({ voiceControlEnabled: false });
    }
    showFeedback("Saved OpenAI API key removed. Voice control is off.");
  } catch (error) {
    setVoiceInlineError(
      elements.voiceKeyError,
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    elements.voiceRemoveKey.disabled = openAiCredentialStatus.state === "missing" ||
      openAiCredentialStatus.state === "unavailable";
  }
});

elements.voiceRegionInput.addEventListener("input", () => {
  const value = elements.voiceRegionInput.value.trim();
  if (value.length === 0 || /^[A-Za-z]{2}$/.test(value)) {
    setVoiceInlineError(elements.voiceRegionError, null);
  }
});

elements.voiceRegionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = elements.voiceRegionInput.value.trim().toUpperCase();
  if (value.length > 0 && !/^[A-Z]{2}$/.test(value)) {
    setVoiceInlineError(
      elements.voiceRegionError,
      "Use a two-letter country code, or leave this blank for automatic detection."
    );
    elements.voiceRegionInput.focus();
    return;
  }
  setVoiceInlineError(elements.voiceRegionError, null);
  try {
    await saveDevicePreferences({ voiceRegion: value.length === 0 ? null : value });
    elements.voiceRegionInput.value = value;
    showFeedback(value.length === 0
      ? "Voice availability region set to automatic."
      : `Voice availability region set to ${value}.`);
  } catch (error) {
    setVoiceInlineError(
      elements.voiceRegionError,
      error instanceof Error ? error.message : String(error)
    );
  }
});

elements.voiceControlToggle.addEventListener("click", () => {
  const enabled = !(localAppState?.devicePreferences.voiceControlEnabled ?? false);
  if (enabled && openAiCredentialStatus.state !== "configured") {
    showFeedback("Add an OpenAI API key before enabling voice control.");
    void openVoiceDialog();
    return;
  }
  void saveDevicePreferences({ voiceControlEnabled: enabled })
    .then(() => showFeedback(`Voice control ${enabled ? "enabled" : "disabled"}.`))
    .catch((error: unknown) => showFeedback(error instanceof Error ? error.message : String(error)));
});

elements.voicePlaybackMode.addEventListener("click", () => {
  const current = localAppState?.preferences.voicePlaybackMode ?? "confirm";
  const next = current === "confirm" ? "automatic" : "confirm";
  void saveVoicePlaybackMode(next)
    .then(() => showFeedback(next === "automatic"
      ? "Voice commands will play a single verified match automatically."
      : "Voice commands will ask before playback."))
    .catch((error: unknown) => showFeedback(error instanceof Error ? error.message : String(error)));
});

function renderSoundPreference(): void {
  elements.soundToggle.setAttribute("aria-pressed", String(navigationSounds.enabled));
  elements.soundToggleCopy.textContent = navigationSounds.enabled ? "On" : "Off";
}

elements.soundToggle.addEventListener("click", () => {
  navigationSounds.setEnabled(!navigationSounds.enabled);
  renderSoundPreference();
});

renderSoundPreference();

elements.ambientDisplayToggle.addEventListener("click", () => {
  const enabled = !(localAppState?.devicePreferences.ambientDisplayEnabled ?? true);
  void saveDevicePreferences({ ambientDisplayEnabled: enabled })
    .then(() => showFeedback(`Ambient display ${enabled ? "enabled" : "disabled"}.`))
    .catch((error: unknown) => showFeedback(error instanceof Error ? error.message : String(error)));
});

elements.ambientClockStyle.addEventListener("click", () => {
  const current = localAppState?.devicePreferences.ambientClockStyle ?? "digital";
  const next = AMBIENT_CLOCK_STYLES[
    (AMBIENT_CLOCK_STYLES.indexOf(current) + 1) % AMBIENT_CLOCK_STYLES.length
  ] ?? AMBIENT_CLOCK_STYLES[0];
  void saveDevicePreferences({ ambientClockStyle: next })
    .then(() => showFeedback(`Ambient clock theme set to ${AMBIENT_CLOCK_LABELS[next]}.`))
    .catch((error: unknown) => showFeedback(error instanceof Error ? error.message : String(error)));
});

elements.ambientDisplayDelay.addEventListener("click", () => {
  const values = [5, 10, 30] as const;
  const current = localAppState?.devicePreferences.ambientDisplayDelayMinutes ?? 10;
  const next = values[(values.indexOf(current) + 1) % values.length] ?? 10;
  void saveDevicePreferences({ ambientDisplayDelayMinutes: next })
    .then(() => showFeedback(`Ambient display will start after ${next} minutes.`))
    .catch((error: unknown) => showFeedback(error instanceof Error ? error.message : String(error)));
});

elements.ambientDisplayPreview.addEventListener("click", () => {
  void window.nhd.previewAmbientDisplay()
    .then((shown) => {
      if (!shown) showFeedback("Finish playback or close the current prompt before previewing.");
    })
    .catch((error: unknown) => showFeedback(error instanceof Error ? error.message : String(error)));
});

elements.remoteAutoConnectToggle.addEventListener("click", () => {
  const enabled = !(localAppState?.devicePreferences.autoApproveFirstRemote ?? true);
  void saveDevicePreferences({ autoApproveFirstRemote: enabled })
    .then(() => showFeedback(`First remote auto-connect ${enabled ? "enabled" : "disabled"}.`))
    .catch((error: unknown) => showFeedback(error instanceof Error ? error.message : String(error)));
});

elements.fullscreenToggle.addEventListener("click", () => {
  const enabled = !(localAppState?.devicePreferences.fullscreen ?? true);
  void saveDevicePreferences({ fullscreen: enabled })
    .then(() => showFeedback(`Fullscreen ${enabled ? "enabled" : "disabled"}.`))
    .catch((error: unknown) => showFeedback(error instanceof Error ? error.message : String(error)));
});

elements.motionToggle.addEventListener("click", () => {
  const enabled = !(localAppState?.devicePreferences.reducedMotion ?? false);
  void saveDevicePreferences({ reducedMotion: enabled })
    .then(() => showFeedback(`Reduced motion ${enabled ? "enabled" : "disabled"}.`))
    .catch((error: unknown) => showFeedback(error instanceof Error ? error.message : String(error)));
});

elements.safeAreaToggle.addEventListener("click", () => {
  const values = ["compact", "standard", "wide"] as const;
  const current = localAppState?.devicePreferences.safeArea ?? "standard";
  const next = values[(values.indexOf(current) + 1) % values.length] ?? "standard";
  void saveDevicePreferences({ safeArea: next })
    .then(() => showFeedback(`Screen margins set to ${next}.`))
    .catch((error: unknown) => showFeedback(error instanceof Error ? error.message : String(error)));
});

elements.youtubeTvToggle.addEventListener("click", () => {
  const enabled = !(localAppState?.devicePreferences.youtubeTvModeEnabled ?? true);
  void saveDevicePreferences({ youtubeTvModeEnabled: enabled })
    .then(() => showFeedback(`YouTube TV Mode ${enabled ? "enabled" : "disabled"}.`))
    .catch((error: unknown) => showFeedback(error instanceof Error ? error.message : String(error)));
});

elements.youtubeTvScale.addEventListener("click", () => {
  const values = ["compact", "standard", "large"] as const;
  const current = localAppState?.devicePreferences.youtubeTvScale ?? "standard";
  const next = values[(values.indexOf(current) + 1) % values.length] ?? "standard";
  void saveDevicePreferences({ youtubeTvScale: next })
    .then(() => showFeedback(`YouTube interface size set to ${next}.`))
    .catch((error: unknown) => showFeedback(error instanceof Error ? error.message : String(error)));
});

elements.displayCard.addEventListener("click", () => {
  void window.nhd.cycleDisplay()
    .then((state) => {
      applyLocalAppState(state);
      return refreshStatus();
    })
    .then(() => showFeedback("Moved NHD-TV to the next connected display."))
    .catch((error: unknown) => showFeedback(error instanceof Error ? error.message : String(error)));
});

const arrowDirections: Readonly<Record<string, SpatialDirection>> = {
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up"
};

function setRemoteFocusedElement(element: HTMLElement | null): void {
  remoteFocusedElement?.removeAttribute("data-remote-focused");
  remoteFocusedElement = element;

  if (element !== null) {
    element.setAttribute("data-remote-focused", "true");
  }
}

function activeNavigationScope(): ParentNode {
  if (
    !elements.voicePresentation.hidden &&
    elements.voicePresentation.dataset.phase === "clarification"
  ) {
    return elements.voicePresentation;
  }

  if (spotifyNowPlayingOpen) {
    return elements.spotifyNowPlaying;
  }

  if (elements.recoveryDialog.open) {
    return elements.recoveryDialog;
  }

  if (elements.appManageDialog.open) {
    return elements.appManageDialog;
  }

  if (elements.clearDataDialog.open) {
    return elements.clearDataDialog;
  }

  if (elements.quitDialog.open) {
    return elements.quitDialog;
  }

  if (elements.remoteDialog.open) {
    return elements.remoteDialog;
  }

  if (elements.gamepadDialog.open) {
    return elements.gamepadDialog;
  }

  if (elements.profileDialog.open) {
    return elements.profileDialog;
  }

  if (elements.voiceDialog.open) {
    return elements.voiceDialog;
  }

  if (elements.searchDialog.open) {
    return elements.searchDialog;
  }

  return document;
}

function visibleNavigationCandidates(): HTMLElement[] {
  return Array.from(
    activeNavigationScope().querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), summary"
    )
  ).filter((candidate) => candidate.getClientRects().length > 0);
}

function navigationGroup(candidate: HTMLElement): string | null {
  return candidate.dataset.navGroup
    ?? candidate.closest<HTMLElement>("[data-nav-group]")?.dataset.navGroup
    ?? null;
}

function moveSpatialFocus(direction: SpatialDirection, remote = false): boolean {
  const candidates = visibleNavigationCandidates();
  const current = document.activeElement;
  const currentIndex = current instanceof HTMLElement ? candidates.indexOf(current) : -1;

  if (candidates.length === 0) {
    return false;
  }

  if (currentIndex === -1) {
    const firstCandidate = candidates[0];
    firstCandidate?.focus({ preventScroll: true });
    setRemoteFocusedElement(remote ? firstCandidate ?? null : null);
    navigationSounds.playMove();
    return true;
  }

  const nextIndex = findDirectionalTarget(
    currentIndex,
    candidates.map((candidate) => candidate.getBoundingClientRect()),
    direction,
    candidates.map(navigationGroup)
  );

  if (nextIndex === null) {
    return false;
  }

  const nextCandidate = candidates[nextIndex];
  nextCandidate?.focus({ preventScroll: true });
  nextCandidate?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  setRemoteFocusedElement(remote ? nextCandidate ?? null : null);
  navigationSounds.playMove();
  return true;
}

function returnHome(remote = false): void {
  if (elements.appManageDialog.open) {
    closeAppManageDialog();
  }

  if (elements.clearDataDialog.open) {
    cancelClearData();
  }

  if (elements.remoteDialog.open) {
    elements.remoteDialog.close();
  }

  if (elements.gamepadDialog.open) {
    elements.gamepadDialog.close();
  }

  if (elements.profileDialog.open) {
    elements.profileDialog.close();
  }

  if (elements.voiceDialog.open) {
    closeVoiceDialog();
  }

  if (elements.searchDialog.open) {
    elements.searchDialog.close();
  }

  if (elements.quitDialog.open) {
    return;
  }

  showView("home");
  elements.heroOpenButton.focus({ preventScroll: true });
  setRemoteFocusedElement(remote ? elements.heroOpenButton : null);
}

async function sendShellInputAction(action: RemoteAction): Promise<void> {
  try {
    await withUiDeadline(
      window.nhd.sendInputAction(action),
      PLAYBACK_ACTION_TIMEOUT_MS,
      "The television did not respond to that control."
    );
  } catch (error) {
    showActionNotice({
      detail: actionFailureDetail(error, "Try the control again."),
      retry: () => void sendShellInputAction(action),
      state: "error",
      title: "Control didn’t work"
    });
  }
}

document.addEventListener("keydown", (event) => {
  const mediaAction = mediaActionForKeyInput({
    alt: event.altKey,
    control: event.ctrlKey,
    key: event.key,
    meta: event.metaKey,
    shift: event.shiftKey
  });
  if (mediaAction !== null) {
    event.preventDefault();
    void sendShellInputAction(mediaAction);
    return;
  }

  const direction = arrowDirections[event.key];

  if (direction !== undefined) {
    if (event.target instanceof HTMLInputElement) {
      return;
    }

    setRemoteFocusedElement(null);

    if (moveSpatialFocus(direction)) {
      event.preventDefault();
    }

    return;
  }

  if (event.key !== "Escape") {
    return;
  }

  if (spotifyNowPlayingOpen) {
    closeSpotifyNowPlaying();
    event.preventDefault();
  } else if (elements.recoveryDialog.open) {
    elements.recoveryHome.click();
    event.preventDefault();
  } else if (elements.remoteDialog.open) {
    elements.remoteDialog.close();
    event.preventDefault();
  } else if (elements.gamepadDialog.open) {
    elements.gamepadDialog.close();
    event.preventDefault();
  } else if (elements.appManageDialog.open) {
    closeAppManageDialog();
    event.preventDefault();
  } else if (elements.profileDialog.open) {
    elements.profileDialog.close();
    event.preventDefault();
  } else if (elements.voiceDialog.open) {
    closeVoiceDialog();
    event.preventDefault();
  } else if (elements.clearDataDialog.open) {
    cancelClearData();
    event.preventDefault();
  } else if (elements.quitDialog.open) {
    elements.quitCancel.click();
    event.preventDefault();
  } else if (elements.searchDialog.open) {
    elements.searchDialog.close();
    event.preventDefault();
  } else if (currentView === "store") {
    returnToApps();
    event.preventDefault();
  } else if (currentView !== "home") {
    returnHome();
    event.preventDefault();
  }
});

document.addEventListener("pointerdown", () => setRemoteFocusedElement(null), { capture: true });

document.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest("button, summary") !== null) {
    navigationSounds.playSelect();
  }
}, { capture: true });

function handleShellRemoteAction(action: RemoteAction): void {
  if (isMediaAction(action)) {
    showFeedback("Open an app to use playback controls. Volume may also require your TV remote.");
    return;
  }

  if (action === "up" || action === "down" || action === "left" || action === "right") {
    if (elements.searchDialog.open) promoteRemoteCatalogSearchFocus = false;
    moveSpatialFocus(action, true);
    return;
  }

  if (action === "select") {
    if (elements.searchDialog.open) promoteRemoteCatalogSearchFocus = false;
    const focused = document.activeElement;

    if (focused instanceof HTMLElement && visibleNavigationCandidates().includes(focused)) {
      focused.click();
    } else {
      const firstCandidate = visibleNavigationCandidates()[0];
      firstCandidate?.focus();
      setRemoteFocusedElement(firstCandidate ?? null);
    }
    return;
  }

  if (action === "back") {
    if (spotifyNowPlayingOpen) {
      closeSpotifyNowPlaying();
      return;
    }

    if (elements.recoveryDialog.open) {
      elements.recoveryHome.click();
      return;
    }

    if (elements.appManageDialog.open) {
      closeAppManageDialog();
      return;
    }

    if (elements.clearDataDialog.open) {
      cancelClearData();
      return;
    }

    if (elements.remoteDialog.open) {
      elements.remoteDialog.close();
      return;
    }

    if (elements.gamepadDialog.open) {
      elements.gamepadDialog.close();
      return;
    }

    if (elements.profileDialog.open) {
      elements.profileDialog.close();
      return;
    }

    if (elements.voiceDialog.open) {
      closeVoiceDialog();
      return;
    }

    if (elements.quitDialog.open) {
      elements.quitCancel.click();
      return;
    }

    if (elements.searchDialog.open) {
      elements.searchDialog.close();
      return;
    }

    if (currentView === "store") {
      returnToApps(true);
      return;
    }

    if (currentView !== "home") {
      returnHome(true);
      return;
    }
  }

  if (action === "home") {
    if (elements.recoveryDialog.open) {
      elements.recoveryHome.click();
      return;
    }
    if (elements.quitDialog.open) {
      elements.quitConfirm.click();
      return;
    }
  }

  returnHome(true);
}

function renderGamepadStatus(gamepads: readonly GamepadLike[]): void {
  connectedGamepads = gamepads;
  const connected = gamepads.length;
  elements.gamepadCard.dataset.connected = String(connected > 0);
  elements.gamepadCopy.textContent = connected === 0
    ? "Connect an Xbox-style controller"
    : connected === 1
      ? gamepads[0]?.id || "1 controller connected"
      : `${connected} controllers connected`;
  elements.gamepadDiagnosticStatus.textContent = connected === 0
    ? "No controller detected. Connect one and press a button."
    : gamepads.map((gamepad) =>
      `${gamepad.id || `Controller ${gamepad.index + 1}`} · ${gamepad.mapping || "non-standard mapping"}`
    ).join(" · ");
}

const gamepadInput = new GamepadInput(
  (action) => {
    if (elements.gamepadDialog.open) {
      elements.gamepadLastAction.textContent = action;
      if (action === "back" || action === "force-home" || action === "home") {
        elements.gamepadDialog.close();
      }
      return;
    }
    void sendShellInputAction(action);
  },
  renderGamepadStatus
);

elements.gamepadCard.addEventListener("click", () => {
  renderGamepadStatus(connectedGamepads);
  elements.gamepadLastAction.textContent = "Waiting…";
  elements.gamepadDialog.showModal();
  elements.gamepadDone.focus();
});
elements.gamepadClose.addEventListener("click", () => elements.gamepadDialog.close());
elements.gamepadDone.addEventListener("click", () => elements.gamepadDialog.close());

async function cancelServiceQuit(): Promise<void> {
  if (elements.quitDialog.open) {
    elements.quitDialog.close();
  }
  hideQuitServicePreview();

  try {
    await window.nhd.cancelServiceQuit();
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : String(error));
  }
}

async function confirmServiceQuit(): Promise<void> {
  elements.quitConfirm.disabled = true;

  try {
    await window.nhd.confirmServiceQuit();

    if (elements.quitDialog.open) {
      elements.quitDialog.close();
    }
    hideQuitServicePreview();

    showFeedback("Returned to NHD-TV Home.");
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : String(error));
  } finally {
    elements.quitConfirm.disabled = false;
  }
}

elements.quitCancel.addEventListener("click", () => void cancelServiceQuit());
elements.quitConfirm.addEventListener("click", () => void confirmServiceQuit());
elements.quitDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  void cancelServiceQuit();
});

elements.recoveryRetry.addEventListener("click", () => void runServiceRecovery("retry"));
elements.recoveryReload.addEventListener("click", () => void runServiceRecovery("reload"));
elements.recoveryHome.addEventListener("click", () => void runServiceRecovery("home"));
elements.recoveryDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  elements.recoveryHome.click();
});
window.addEventListener("online", renderNetworkState);
window.addEventListener("offline", renderNetworkState);
renderNetworkState();

elements.closeServiceButton.addEventListener("click", async () => {
  await window.nhd.closeService();
  showFeedback("Service view closed.");
});

window.nhd.onAmbientDisplayChanged(setAmbientDisplayVisible);
window.nhd.onHostStatusChanged(renderStatus);
window.nhd.onSpotifyPlaybackChanged((presentation) => {
  currentSpotifyPlayback = presentation;
  renderSpotifyHomePlayer();
});
window.nhd.onContinueWatchingChanged((items) => {
  continueWatchingItems = items;
  renderContinueWatching();
  if (services.length > 0) {
    renderFeatured(orderedEnabledServices());
  }
});
window.nhd.onRemoteAction(handleShellRemoteAction);
window.nhd.onRemotePrecisionMoved(() => navigationSounds.playMove());
window.nhd.onRemoteSearchRequested((query) => openSearchDialog(query, true));
window.nhd.onRemoteStatusChanged(renderRemoteStatus);
window.nhd.onVoicePresentationChanged(renderVoicePresentation);
window.nhd.onServiceRecoveryRequested(showServiceRecovery);
window.nhd.onServiceQuitRequested((request) => {
  if (request.backgroundDataUrl === null) {
    hideQuitServicePreview();
  } else {
    elements.quitServicePreview.src = request.backgroundDataUrl;
    elements.quitServicePreview.hidden = false;
  }
  elements.quitCopy.textContent = `You are at ${request.serviceName} Home. Exit to NHD-TV?`;

  if (!elements.quitDialog.open) {
    elements.quitDialog.showModal();
  }

  elements.quitCancel.focus();
});
gamepadInput.start();
initializeHorizontalRails();
void refreshStatus();
void window.nhd.getSpotifyPlayback()
  .then((presentation) => {
    currentSpotifyPlayback = presentation;
    renderSpotifyHomePlayer();
  })
  .catch(() => undefined);
void initializeContinueWatching();
void initializeServices();
void initializeRemoteStatus();
window.setInterval(() => void refreshStatus().catch(() => undefined), 5_000);
window.setInterval(() => {
  if (!elements.remoteDialog.open || currentRemoteStatus === null) {
    return;
  }

  elements.remoteExpiry.textContent = remoteExpiryCopy(currentRemoteStatus.expiresAt);

  if (currentRemoteStatus.expiresAt !== null && currentRemoteStatus.expiresAt <= Date.now()) {
    void refreshRemoteStatus().catch(showRemoteError);
  }
}, 1_000);
window.setInterval(() => void refreshRemoteStatus().catch(() => undefined), 15_000);
