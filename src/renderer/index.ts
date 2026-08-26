import "./style.css";
import type {
  ContinueWatchingItem,
  HostStatus,
  LocalAppState,
  RemoteAction,
  RemoteStatus,
  ServiceSummary
} from "../main/contracts";
import { GamepadInput, type GamepadLike } from "./gamepad-input";
import { NavigationSounds } from "./navigation-sounds";
import { createServiceLockup, createServiceMark } from "./service-branding";
import {
  findDirectionalTarget,
  type SpatialDirection
} from "./spatial-navigation";

type AppView = "home" | "settings" | "store";

function requireElement<T>(selector: string, name: string): T {
  const element = document.querySelector(selector);

  if (element === null) {
    throw new Error(`Missing renderer element: ${name}`);
  }

  return element as T;
}

const elements = {
  closeServiceButton: requireElement<HTMLButtonElement>("#close-service", "close-service"),
  continueActions: requireElement<HTMLDivElement>("#continue-actions", "continue-actions"),
  continueHint: requireElement<HTMLSpanElement>("#continue-hint", "continue-hint"),
  diagnosticsStatus: requireElement<HTMLParagraphElement>("#diagnostics-status", "diagnostics-status"),
  featuredBrand: requireElement<HTMLDivElement>("#featured-brand", "featured-brand"),
  featuredCopy: requireElement<HTMLParagraphElement>("#featured-copy", "featured-copy"),
  featuredIcon: requireElement<HTMLDivElement>("#featured-icon", "featured-icon"),
  featuredSection: requireElement<HTMLElement>(".featured", "featured"),
  featuredTitle: requireElement<HTMLHeadingElement>("#featured-title", "featured-title"),
  feedback: requireElement<HTMLParagraphElement>("#feedback", "feedback"),
  gamepadCard: requireElement<HTMLButtonElement>("#gamepad-card", "gamepad-card"),
  gamepadCopy: requireElement<HTMLElement>("#gamepad-copy", "gamepad-copy"),
  healthPill: requireElement<HTMLSpanElement>("#health-pill", "health-pill"),
  heroOpenButton: requireElement<HTMLButtonElement>("#hero-open", "hero-open"),
  lineupCount: requireElement<HTMLSpanElement>("#lineup-count", "lineup-count"),
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
  remoteApproval: requireElement<HTMLDivElement>("#remote-approval", "remote-approval"),
  remoteApprove: requireElement<HTMLButtonElement>("#remote-approve", "remote-approve"),
  remoteClose: requireElement<HTMLButtonElement>("#remote-close", "remote-close"),
  remoteDeny: requireElement<HTMLButtonElement>("#remote-deny", "remote-deny"),
  remoteDetail: requireElement<HTMLParagraphElement>("#remote-detail", "remote-detail"),
  remoteDialog: requireElement<HTMLDialogElement>("#remote-dialog", "remote-dialog"),
  remoteExpiry: requireElement<HTMLParagraphElement>("#remote-expiry", "remote-expiry"),
  remotePairingView: requireElement<HTMLDivElement>("#remote-pairing-view", "remote-pairing-view"),
  remoteQr: requireElement<HTMLImageElement>("#remote-qr", "remote-qr"),
  remoteReady: requireElement<HTMLDivElement>("#remote-ready", "remote-ready"),
  remoteReadyCopy: requireElement<HTMLSpanElement>("#remote-ready-copy", "remote-ready-copy"),
  remoteStart: requireElement<HTMLButtonElement>("#remote-start", "remote-start"),
  runtimeStatus: requireElement<HTMLParagraphElement>("#runtime-status", "runtime-status"),
  serviceActions: requireElement<HTMLDivElement>("#service-actions", "service-actions"),
  serviceStatus: requireElement<HTMLParagraphElement>("#service-status", "service-status"),
  searchClose: requireElement<HTMLButtonElement>("#search-close", "search-close"),
  searchDialog: requireElement<HTMLDialogElement>("#search-dialog", "search-dialog"),
  searchForm: requireElement<HTMLFormElement>("#search-form", "search-form"),
  searchInput: requireElement<HTMLInputElement>("#search-input", "search-input"),
  searchResultCount: requireElement<HTMLSpanElement>("#search-result-count", "search-result-count"),
  searchResults: requireElement<HTMLDivElement>("#search-results", "search-results"),
  settingsRemoteButton: requireElement<HTMLButtonElement>("#settings-remote-button", "settings-remote-button"),
  settingsRemoteCopy: requireElement<HTMLElement>("#settings-remote-copy", "settings-remote-copy"),
  soundToggle: requireElement<HTMLButtonElement>("#sound-toggle", "sound-toggle"),
  soundToggleCopy: requireElement<HTMLElement>("#sound-toggle-copy", "sound-toggle-copy"),
  storeActions: requireElement<HTMLDivElement>("#store-actions", "store-actions"),
  topRemoteButton: requireElement<HTMLButtonElement>("#top-remote-button", "top-remote-button"),
  topRemoteLabel: requireElement<HTMLSpanElement>("#top-remote-label", "top-remote-label"),
  topSearchButton: requireElement<HTMLButtonElement>("#top-search-button", "top-search-button"),
  widevineStatus: requireElement<HTMLParagraphElement>("#widevine-status", "widevine-status")
};

const navigationSounds = new NavigationSounds();
let currentRemoteStatus: RemoteStatus | null = null;
let continueWatchingItems: readonly ContinueWatchingItem[] = [];
let currentView: AppView = "home";
let enabledServiceIds = new Set<string>();
let feedbackTimer: number | null = null;
let featuredServiceId: string | null = null;
let favoriteServiceIds = new Set<string>();
let localAppState: LocalAppState | null = null;
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

function renderStatus(status: HostStatus): void {
  if (status.activeServiceId === null && elements.quitDialog.open) {
    elements.quitDialog.close();
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
}

async function saveProfilePreferences(): Promise<void> {
  applyLocalAppState(await window.nhd.updateProfilePreferences({
    enabledServiceIds: [...enabledServiceIds],
    favoriteServiceIds: [...favoriteServiceIds],
    serviceOrder
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
  const progress = document.createElement("span");
  progress.className = "placeholder-progress";
  progress.setAttribute("aria-hidden", "true");
  progress.append(document.createElement("span"));
  meta.append(title, detail, progress);
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

function storeCard(service: ServiceSummary): HTMLButtonElement {
  const enabled = enabledServiceIds.has(service.id);
  const button = document.createElement("button");
  button.className = "catalog-card";
  button.dataset.enabled = String(enabled);
  button.dataset.serviceId = service.id;
  button.type = "button";
  button.setAttribute("aria-label", `${enabled ? "Remove" : "Add"} ${service.name} ${enabled ? "from" : "to"} Home`);

  const top = document.createElement("span");
  top.className = "catalog-card-top";
  top.append(createServiceMark(service.id, service.name));
  const status = document.createElement("span");
  status.className = "catalog-status";
  status.textContent = enabled ? "On Home" : service.kind === "test" ? "Test tool" : "Available";
  top.append(status);

  const copy = document.createElement("span");
  copy.className = "catalog-card-copy";
  const name = document.createElement("strong");
  name.textContent = service.name;
  const detail = document.createElement("small");
  detail.textContent = service.authenticationNote ?? (
    service.kind === "test"
      ? "Widevine host diagnostics and public test playback."
      : "Uses its own isolated local sign-in session."
  );
  copy.append(name, detail);

  const footer = document.createElement("span");
  footer.className = "catalog-card-footer";
  const action = document.createElement("span");
  action.className = "catalog-action";
  action.textContent = enabled ? "Remove" : "Add to Home";
  footer.append(action);

  button.append(top, copy, footer);
  button.addEventListener("click", async () => {
    if (enabledServiceIds.has(service.id)) {
      enabledServiceIds.delete(service.id);
      favoriteServiceIds.delete(service.id);
      serviceOrder = serviceOrder.filter((id) => id !== service.id);
      showFeedback(`${service.name} removed from Home. Its local session was kept.`);
    } else {
      enabledServiceIds.add(service.id);
      serviceOrder.push(service.id);
      showFeedback(`${service.name} added to Home.`);
    }

    try {
      await saveProfilePreferences();
      renderServiceViews();
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : String(error));
      if (localAppState !== null) {
        applyLocalAppState(localAppState);
      }
      renderServiceViews();
    }
  });
  return button;
}

function renderFeatured(enabledServices: readonly ServiceSummary[]): void {
  const featured = enabledServices.find((service) => service.id === "netflix") ?? enabledServices[0];

  if (featured === undefined) {
    featuredServiceId = null;
    delete elements.featuredSection.dataset.serviceId;
    elements.featuredBrand.replaceChildren();
    elements.featuredIcon.replaceChildren();
    elements.featuredTitle.textContent = "Build your lineup.";
    elements.featuredCopy.textContent = "Open the Store and choose which services belong on Home.";
    elements.heroOpenButton.disabled = false;
    elements.heroOpenButton.textContent = "Open Store";
    return;
  }

  featuredServiceId = featured.id;
  elements.featuredSection.dataset.serviceId = featured.id;
  elements.featuredBrand.replaceChildren(createServiceLockup(featured.id, featured.name));
  elements.featuredIcon.replaceChildren(createServiceMark(featured.id, featured.name));
  elements.featuredTitle.textContent = `${featured.name} is ready.`;
  elements.featuredCopy.textContent = "Open your saved local session and browse normally inside NHD-TV.";
  elements.heroOpenButton.disabled = false;
  elements.heroOpenButton.textContent = `Open ${featured.name}`;
}

function renderServiceViews(): void {
  const orderIndex = new Map(serviceOrder.map((id, index) => [id, index]));
  const enabledServices = services
    .filter((service) => enabledServiceIds.has(service.id))
    .sort((left, right) => {
      const favoriteDifference = Number(favoriteServiceIds.has(right.id)) -
        Number(favoriteServiceIds.has(left.id));
      return favoriteDifference ||
        (orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER);
    });
  elements.serviceActions.replaceChildren(...enabledServices.map(serviceTile));
  elements.storeActions.replaceChildren(...services.map(storeCard));
  elements.lineupCount.textContent = `${enabledServices.length} of ${services.length} on Home`;

  if (enabledServices.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-lineup";
    empty.textContent = "Your lineup is empty. Add a service from the Store.";
    elements.serviceActions.append(empty);
  }

  renderFeatured(enabledServices);
  renderContinueWatching();

  if (elements.searchDialog.open && elements.searchInput.value.trim().length > 0) {
    renderSearchResults(elements.searchInput.value);
  }
}

function renderSearchResults(rawQuery: string): void {
  const query = rawQuery.replace(/\s+/g, " ").trim();
  const searchable = services.filter(
    (service) => enabledServiceIds.has(service.id) && service.searchMode !== "none"
  );

  if (query.length === 0) {
    elements.searchResults.replaceChildren();
    elements.searchResultCount.textContent = "Enter a search above";
    return;
  }

  const buttons = searchable.map((service) => {
    const button = document.createElement("button");
    button.className = "search-result-card";
    button.dataset.serviceId = service.id;
    button.type = "button";
    button.setAttribute("aria-label", service.searchMode === "query"
      ? `Search ${service.name} for ${query}`
      : `Open ${service.name} search`);
    button.append(createServiceMark(service.id, service.name));

    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = service.searchMode === "query"
      ? `Search ${service.name}`
      : `Open ${service.name} Search`;
    const detail = document.createElement("small");
    detail.textContent = service.searchMode === "query"
      ? `“${query}”`
      : "Continue your search inside the service";
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
  elements.searchResultCount.textContent = buttons.length === 0
    ? "Add a searchable service from the Store"
    : `${buttons.length} ${buttons.length === 1 ? "service" : "services"}`;
}

function openSearchDialog(query = "", remote = false): void {
  if (!elements.searchDialog.open) {
    elements.searchDialog.showModal();
  }

  elements.searchInput.value = query;
  renderSearchResults(query);
  if (remote && query.length > 0) {
    const firstResult = elements.searchResults.querySelector<HTMLButtonElement>("button");
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
  elements.searchResults.querySelector<HTMLButtonElement>("button")?.focus();
});
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

function showView(view: AppView): void {
  currentView = view;
  document.body.dataset.view = view;

  for (const appView of document.querySelectorAll<HTMLElement>(".app-view")) {
    appView.hidden = appView.dataset.view !== view;
  }

  for (const navButton of document.querySelectorAll<HTMLButtonElement>(".nav-button[data-view-target]")) {
    const current = navButton.dataset.viewTarget === view;
    navButton.classList.toggle("nav-current", current);

    if (current) {
      navButton.setAttribute("aria-current", "page");
    } else {
      navButton.removeAttribute("aria-current");
    }
  }

  window.scrollTo({ behavior: "smooth", top: 0 });
}

for (const target of document.querySelectorAll<HTMLButtonElement>("[data-view-target]")) {
  target.addEventListener("click", () => {
    const view = target.dataset.viewTarget;

    if (view === "home" || view === "settings" || view === "store") {
      showView(view);
    }
  });
}

elements.heroOpenButton.addEventListener("click", () => {
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

function remoteExpiryCopy(expiresAt: number | null): string {
  if (expiresAt === null) {
    return "";
  }

  const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1_000));
  return seconds === 0 ? "Pairing code expired." : `Code expires in ${seconds} seconds.`;
}

function renderRemoteStatus(status: RemoteStatus): void {
  currentRemoteStatus = status;
  elements.remoteDetail.textContent = status.detail;
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
  } else {
    elements.remoteQr.removeAttribute("src");
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
  } else if (elements.profileDialog.open) {
    elements.profileDialog.close();
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
});
window.nhd.onRemoteAction(handleShellRemoteAction);
window.nhd.onRemoteSearchRequested((query) => openSearchDialog(query, true));
window.nhd.onRemoteStatusChanged(renderRemoteStatus);
window.nhd.onServiceQuitRequested((request) => {
  elements.quitCopy.textContent = `You are at ${request.serviceName} Home. Exit to NHD-TV?`;

  if (!elements.quitDialog.open) {
    elements.quitDialog.showModal();
  }

  elements.quitCancel.focus();
});
gamepadInput.start();
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
