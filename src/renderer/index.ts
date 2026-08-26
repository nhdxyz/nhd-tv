import "./style.css";
import type {
  CatalogSearchResult,
  ContinueWatchingItem,
  HostStatus,
  LocalAppState,
  RemoteAction,
  RemoteStatus,
  ServiceSummary
} from "../main/contracts";
import { GamepadInput, type GamepadLike } from "./gamepad-input";
import { NavigationSounds } from "./navigation-sounds";
import { matchContinueWatching } from "./search-history";
import { createServiceLockup, createServiceMark } from "./service-branding";
import {
  findDirectionalTarget,
  type SpatialDirection
} from "./spatial-navigation";

type AppView = "apps" | "home" | "settings" | "store";

function requireElement<T>(selector: string, name: string): T {
  const element = document.querySelector(selector);

  if (element === null) {
    throw new Error(`Missing renderer element: ${name}`);
  }

  return element as T;
}

const elements = {
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
  gamepadCopy: requireElement<HTMLElement>("#gamepad-copy", "gamepad-copy"),
  fullscreenCopy: requireElement<HTMLElement>("#fullscreen-copy", "fullscreen-copy"),
  fullscreenToggle: requireElement<HTMLButtonElement>("#fullscreen-toggle", "fullscreen-toggle"),
  healthPill: requireElement<HTMLSpanElement>("#health-pill", "health-pill"),
  heroOpenButton: requireElement<HTMLButtonElement>("#hero-open", "hero-open"),
  lineupCount: requireElement<HTMLSpanElement>("#lineup-count", "lineup-count"),
  motionCopy: requireElement<HTMLElement>("#motion-copy", "motion-copy"),
  motionToggle: requireElement<HTMLButtonElement>("#motion-toggle", "motion-toggle"),
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
  topRemoteButton: requireElement<HTMLButtonElement>("#top-remote-button", "top-remote-button"),
  topRemoteLabel: requireElement<HTMLSpanElement>("#top-remote-label", "top-remote-label"),
  topSearchButton: requireElement<HTMLButtonElement>("#top-search-button", "top-search-button"),
  utilityStoreActions: requireElement<HTMLDivElement>("#utility-store-actions", "utility-store-actions"),
  widevineStatus: requireElement<HTMLParagraphElement>("#widevine-status", "widevine-status")
};

const navigationSounds = new NavigationSounds();
let currentRemoteStatus: RemoteStatus | null = null;
let continueWatchingItems: readonly ContinueWatchingItem[] = [];
let catalogSearchTimer: number | null = null;
let catalogSearchVersion = 0;
let currentView: AppView = "home";
let enabledServiceIds = new Set<string>();
let feedbackTimer: number | null = null;
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

function hideQuitServicePreview(): void {
  elements.quitServicePreview.hidden = true;
  elements.quitServicePreview.removeAttribute("src");
}

function renderStatus(status: HostStatus): void {
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
}

async function saveProfilePreferences(): Promise<void> {
  applyLocalAppState(await window.nhd.updateProfilePreferences({
    enabledServiceIds: [...enabledServiceIds],
    favoriteServiceIds: [...favoriteServiceIds],
    serviceOrder
  }));
}

async function saveDevicePreferences(
  changes: Partial<LocalAppState["devicePreferences"]>
): Promise<void> {
  if (localAppState === null) {
    return;
  }

  applyLocalAppState(await window.nhd.updateDevicePreferences({
    ...localAppState.devicePreferences,
    ...changes
  }));
}

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
  const shell = document.createElement("article");
  shell.className = "continue-card-shell";
  shell.dataset.serviceId = item.serviceId;

  const button = document.createElement("button");
  button.className = "continue-card continue-card-item";
  button.type = "button";
  button.setAttribute("aria-label", `Resume ${item.title} in ${item.serviceName}`);

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
  title.textContent = item.title;
  const remaining = Math.max(0, item.durationSeconds - item.positionSeconds);
  const detail = document.createElement("small");
  detail.className = "continue-detail";
  detail.textContent = item.subtitle === null
    ? `${playbackTime(remaining)} left`
    : `${item.subtitle} · ${playbackTime(remaining)} left`;
  const progress = document.createElement("span");
  progress.className = "placeholder-progress";
  progress.setAttribute("aria-hidden", "true");
  const progressValue = document.createElement("span");
  progressValue.style.width = `${Math.min(100, Math.max(0, item.positionSeconds / item.durationSeconds * 100))}%`;
  progress.append(progressValue);
  meta.append(service, title, detail, progress);
  button.append(art, meta);
  button.addEventListener("click", async () => {
    showFeedback(`Resuming ${item.title} in ${item.serviceName}…`);
    try {
      await window.nhd.resumeContinueWatching(item.id);
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : String(error));
    }
  });

  const remove = document.createElement("button");
  remove.className = "continue-remove";
  remove.dataset.navGroup = "continue-remove";
  remove.type = "button";
  remove.textContent = "Remove";
  remove.setAttribute("aria-label", `Remove ${item.title} from Continue Watching`);
  remove.addEventListener("click", async () => {
    remove.disabled = true;
    try {
      const removed = await window.nhd.removeContinueWatching(item.id);
      showFeedback(removed
        ? `${item.title} removed from Continue Watching.`
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
  elements.continueHint.textContent = visibleItems.length === 0
    ? "Saved only on this computer"
    : `${visibleItems.length} ${visibleItems.length === 1 ? "item" : "items"} saved locally`;

  if (visibleItems.length > 0) {
    elements.continueActions.replaceChildren(...visibleItems.map(continueCard));
    return;
  }

  const placeholder = document.createElement("button");
  placeholder.className = "continue-card continue-placeholder";
  placeholder.type = "button";
  const art = document.createElement("span");
  art.className = "continue-art";
  art.setAttribute("aria-hidden", "true");
  const play = document.createElement("span");
  play.className = "continue-play";
  play.textContent = "▶";
  art.append(play);
  const meta = document.createElement("span");
  meta.className = "continue-meta";
  const title = document.createElement("strong");
  title.textContent = "Start watching in one of your apps";
  const detail = document.createElement("small");
  detail.textContent = "Long-form playback will appear here automatically";
  const cue = document.createElement("span");
  cue.className = "continue-empty-cue";
  cue.setAttribute("aria-hidden", "true");
  cue.append("Choose an app ");
  const arrow = document.createElement("span");
  arrow.textContent = "→";
  cue.append(arrow);
  meta.append(title, detail, cue);
  placeholder.append(art, meta);
  placeholder.addEventListener("click", () => {
    const firstService = services.find((service) => enabledServiceIds.has(service.id));
    if (firstService === undefined) {
      showView("store");
    } else {
      void openService(firstService.id, firstService.name);
    }
  });
  elements.continueActions.replaceChildren(placeholder);
}

async function initializeContinueWatching(): Promise<void> {
  continueWatchingItems = await window.nhd.getContinueWatching();
  renderContinueWatching();
  if (services.length > 0) {
    renderFeatured(orderedEnabledServices());
  }
}

async function openService(serviceId: string, serviceName: string): Promise<void> {
  showFeedback(`Opening ${serviceName}…`);

  try {
    await window.nhd.openService(serviceId);
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : String(error));
  }
}

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
  const arrow = document.createElement("span");
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "→";
  footer.append(name, arrow);
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
    elements.featuredEyebrow.textContent = "Your home screen";
    elements.featuredBrand.replaceChildren();
    elements.featuredIcon.className = "featured-icon is-lineup";
    elements.featuredIcon.replaceChildren();
    elements.featuredTitle.textContent = "Build your lineup.";
    elements.featuredCopy.textContent = "Open the Store and choose which services belong on Home.";
    elements.heroOpenButton.disabled = false;
    elements.heroOpenButton.textContent = "Open Store";
    return;
  }

  featuredContinueItemId = recentItem?.id ?? null;
  featuredServiceId = featured.id;
  elements.featuredSection.dataset.serviceId = featured.id;
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
    const remaining = Math.max(0, recentItem.durationSeconds - recentItem.positionSeconds);
    elements.featuredEyebrow.textContent = "Continue watching";
    elements.featuredTitle.textContent = `Continue ${recentItem.title}`;
    elements.featuredCopy.textContent = recentItem.subtitle === null
      ? `${playbackTime(remaining)} left in ${featured.name}.`
      : `${recentItem.subtitle} · ${playbackTime(remaining)} left in ${featured.name}.`;
    elements.heroOpenButton.textContent = "Resume watching";
  } else {
    elements.featuredEyebrow.textContent = favoriteServiceIds.has(featured.id)
      ? "Your favorite app"
      : "First in your lineup";
    elements.featuredTitle.textContent = "Your next watch starts here.";
    elements.featuredCopy.textContent = `Open ${featured.name}, or choose another app below. Your local sign-in stays ready.`;
    elements.heroOpenButton.textContent = `Open ${featured.name}`;
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
    empty.textContent = "Your lineup is empty. Add a service from the Store.";
    elements.serviceActions.append(empty);

    const browse = document.createElement("button");
    browse.className = "empty-lineup empty-lineup-action";
    browse.type = "button";
    browse.textContent = "Your Apps are empty. Browse the Store";
    browse.addEventListener("click", () => showView("store"));
    elements.appsActions.append(browse);
  }

  renderFeatured(enabledServices);
  renderContinueWatching();

  if (elements.searchDialog.open) {
    renderSearchResults(elements.searchInput.value);
  }
}

function enabledSearchServices(): ServiceSummary[] {
  return services.filter(
    (service) => enabledServiceIds.has(service.id) && service.searchMode !== "none"
  );
}

async function openProviderSearch(service: ServiceSummary, query: string): Promise<void> {
  showFeedback("Opening " + service.name + " search…");
  try {
    await window.nhd.searchService(service.id, query);
    elements.searchDialog.close();
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : String(error));
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
    for (const service of searchable) {
      const button = document.createElement("button");
      button.className = "catalog-result-provider";
      button.type = "button";
      button.setAttribute("aria-label", "Search " + service.name + " for " + result.title);
      button.append(createServiceMark(service.id, service.name));
      const label = document.createElement("span");
      label.textContent = service.searchMode === "query"
        ? "Search " + service.name
        : "Open " + service.name + " search";
      button.append(label);
      button.addEventListener("click", () => void openProviderSearch(service, result.title));
      actions.append(button);
    }
    if (searchable.length === 0) {
      const browse = document.createElement("button");
      browse.className = "catalog-result-provider";
      browse.type = "button";
      browse.textContent = "Add a searchable app";
      browse.addEventListener("click", () => {
        elements.searchDialog.close();
        showView("store");
      });
      actions.append(browse);
    }
    copy.append(title, meta, summary, source, actions);
    card.append(art, copy);
    return card;
  });
  elements.catalogSearchResults.replaceChildren(...cards);
  elements.catalogSearchStatus.textContent = cards.length === 0
    ? "No TV-show matches · try another title"
    : String(cards.length) + " TV-show results · data and posters: TVmaze.com";
  elements.catalogSearchSection.hidden = false;

  if (cards.length === 0 && query.length >= 2) {
    const empty = document.createElement("div");
    empty.className = "catalog-search-empty";
    empty.textContent = "No online TV-show results for “" + query + "”.";
    elements.catalogSearchResults.append(empty);
  }
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
    void window.nhd.searchCatalog(query)
      .then((results) => {
        if (version === catalogSearchVersion) {
          renderCatalogSearchResults(results, query);
        }
      })
      .catch((error: unknown) => {
        if (version !== catalogSearchVersion) {
          return;
        }
        elements.catalogSearchStatus.textContent = error instanceof Error
          ? error.message
          : "Show search is temporarily unavailable.";
        const unavailable = document.createElement("div");
        unavailable.className = "catalog-search-empty";
        unavailable.textContent = "Local history and app search are still available below.";
        elements.catalogSearchResults.replaceChildren(unavailable);
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
    const button = document.createElement("button");
    button.className = "search-result-card search-history-card";
    button.type = "button";
    button.setAttribute("aria-label", `Resume ${item.title} in ${item.serviceName}`);
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
    title.textContent = item.title;
    const detail = document.createElement("small");
    detail.textContent = `Resume in ${item.serviceName}`;
    copy.append(title, detail);
    button.append(art, copy);
    button.addEventListener("click", async () => {
      elements.searchDialog.close();
      try {
        await window.nhd.resumeContinueWatching(item.id);
      } catch (error) {
        showFeedback(error instanceof Error ? error.message : String(error));
      }
    });
    return button;
  });
  elements.searchHistoryResults.replaceChildren(...historyButtons);
  elements.searchHistorySection.hidden = false;
  elements.searchHistoryTitle.textContent = query.length === 0
    ? "Pick up where you left off"
    : "Matches on this TV";
  elements.searchHistoryCount.textContent = historyButtons.length === 0
    ? ""
    : `${historyButtons.length} ${historyButtons.length === 1 ? "title" : "titles"}`;
  elements.searchEmptyState.hidden = historyButtons.length > 0;
  elements.searchEmptyTitle.textContent = query.length === 0
    ? "Your search starts here"
    : `No local match for “${query}”`;
  elements.searchEmptyCopy.textContent = query.length === 0
    ? "Start watching in one of your apps and NHD-TV will make that local history searchable."
    : "No saved local match. Online TV-show results appear above, with app search shortcuts below.";

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
    button.addEventListener("click", async () => {
      showFeedback(`Opening ${service.name} search…`);
      try {
        await window.nhd.searchService(service.id, query);
        elements.searchDialog.close();
      } catch (error) {
        showFeedback(error instanceof Error ? error.message : String(error));
      }
    });
    return button;
  });

  elements.searchResults.replaceChildren(...buttons);
  elements.searchProviderSection.hidden = false;
  elements.searchResultCount.textContent = buttons.length === 0
    ? "Add Netflix, YouTube, or Disney+ from Apps"
    : "The selected app owns its catalog and availability";
}

function openSearchDialog(query = "", remote = false): void {
  if (!elements.searchDialog.open) {
    elements.searchDialog.showModal();
  }

  elements.searchInput.value = query;
  renderSearchResults(query);
  if (remote && query.length > 0) {
    const firstResult = elements.catalogSearchResults.querySelector<HTMLButtonElement>("button")
      ?? elements.searchHistoryResults.querySelector<HTMLButtonElement>("button")
      ?? elements.searchResults.querySelector<HTMLButtonElement>("button");
    firstResult?.focus({ preventScroll: true });
    setRemoteFocusedElement(firstResult ?? null);
  } else {
    elements.searchInput.focus();
  }
}

elements.topSearchButton.addEventListener("click", () => openSearchDialog());
elements.searchClose.addEventListener("click", () => elements.searchDialog.close());
elements.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  renderSearchResults(elements.searchInput.value);
  const firstResult = elements.catalogSearchResults.querySelector<HTMLButtonElement>("button")
    ?? elements.searchHistoryResults.querySelector<HTMLButtonElement>("button")
    ?? elements.searchResults.querySelector<HTMLButtonElement>("button");
  firstResult?.focus();
});
elements.searchInput.addEventListener("input", () => renderSearchResults(elements.searchInput.value));
elements.searchDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  elements.searchDialog.close();
});

async function initializeServices(): Promise<void> {
  const [availableServices, state] = await Promise.all([
    window.nhd.getServices(),
    window.nhd.getLocalAppState()
  ]);
  services = availableServices;
  applyLocalAppState(state);
  renderServiceViews();
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
    const current = navButton.dataset.viewTarget === view;
    navButton.classList.toggle("nav-current", current);

    if (current) {
      navButton.setAttribute("aria-current", "page");
    } else {
      navButton.removeAttribute("aria-current");
    }
  }

  window.scrollTo({ behavior: "smooth", top: 0 });
  window.requestAnimationFrame(updateHorizontalRailControls);
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
  if (featuredContinueItemId !== null) {
    const item = continueWatchingItems.find(({ id }) => id === featuredContinueItemId);
    if (item !== undefined) {
      showFeedback(`Resuming ${item.title} in ${item.serviceName}…`);
      void window.nhd.resumeContinueWatching(item.id).catch((error) => {
        showFeedback(error instanceof Error ? error.message : String(error));
      });
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
    && status.qrDataUrl !== null;
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
  elements.topRemoteButton.hidden = status.state === "ready";
  elements.topRemoteLabel.textContent = status.state === "awaiting-approval"
    ? "Approve phone"
    : status.state === "pairing"
      ? "Pairing code ready"
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
  renderRemoteStatus(await window.nhd.getRemoteStatus());
}

async function startRemotePairing(): Promise<void> {
  elements.remoteStart.disabled = true;
  elements.remoteDetail.textContent = "Creating a private, short-lived pairing code…";

  try {
    renderRemoteStatus(await window.nhd.startRemotePairing());
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
elements.remoteStart.addEventListener("click", () => void startRemotePairing());
elements.remoteClose.addEventListener("click", () => elements.remoteDialog.close());
elements.remoteApprove.addEventListener("click", () => {
  void window.nhd.approveRemotePairing().then(renderRemoteStatus).catch(showRemoteError);
});
elements.remoteDeny.addEventListener("click", () => {
  void window.nhd.denyRemotePairing().then(renderRemoteStatus).catch(showRemoteError);
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

  if (elements.profileDialog.open) {
    return elements.profileDialog;
  }

  if (elements.searchDialog.open) {
    return elements.searchDialog;
  }

  return document;
}

function visibleNavigationCandidates(): HTMLElement[] {
  return Array.from(
    activeNavigationScope().querySelectorAll<HTMLElement>("button:not(:disabled), summary")
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

  if (elements.profileDialog.open) {
    elements.profileDialog.close();
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

document.addEventListener("keydown", (event) => {
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

  if (elements.remoteDialog.open) {
    elements.remoteDialog.close();
    event.preventDefault();
  } else if (elements.appManageDialog.open) {
    closeAppManageDialog();
    event.preventDefault();
  } else if (elements.profileDialog.open) {
    elements.profileDialog.close();
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
  if (action === "up" || action === "down" || action === "left" || action === "right") {
    moveSpatialFocus(action, true);
    return;
  }

  if (action === "select") {
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

    if (elements.profileDialog.open) {
      elements.profileDialog.close();
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

    if (currentView !== "home") {
      returnHome(true);
      return;
    }
  }

  if (action === "home" && elements.quitDialog.open) {
    elements.quitConfirm.click();
    return;
  }

  returnHome(true);
}

function renderGamepadStatus(gamepads: readonly GamepadLike[]): void {
  const connected = gamepads.length;
  elements.gamepadCard.dataset.connected = String(connected > 0);
  elements.gamepadCopy.textContent = connected === 0
    ? "Connect an Xbox-style controller"
    : connected === 1
      ? gamepads[0]?.id || "1 controller connected"
      : `${connected} controllers connected`;
}

const gamepadInput = new GamepadInput(
  (action) => {
    void window.nhd.sendInputAction(action).catch((error: unknown) => {
      showFeedback(error instanceof Error ? error.message : String(error));
    });
  },
  renderGamepadStatus
);

elements.gamepadCard.addEventListener("click", () => {
  showFeedback("Controller: D-pad or left stick to move, A to select, B to go back, Guide for Home.");
});

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

elements.closeServiceButton.addEventListener("click", async () => {
  await window.nhd.closeService();
  showFeedback("Service view closed.");
});

window.nhd.onHostStatusChanged(renderStatus);
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
void initializeContinueWatching();
void initializeServices();
void refreshRemoteStatus();
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
