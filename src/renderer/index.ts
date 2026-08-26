import "./style.css";
import type { HostStatus, RemoteAction, RemoteStatus } from "../main/contracts";
import { NavigationSounds } from "./navigation-sounds";
import {
  findDirectionalTarget,
  type SpatialDirection
} from "./spatial-navigation";

const runtimeStatus = document.querySelector<HTMLParagraphElement>("#runtime-status");
const widevineStatus = document.querySelector<HTMLParagraphElement>("#widevine-status");
const serviceStatus = document.querySelector<HTMLParagraphElement>("#service-status");
const diagnosticsStatus = document.querySelector<HTMLParagraphElement>("#diagnostics-status");
const healthPill = document.querySelector<HTMLSpanElement>("#health-pill");
const feedback = document.querySelector<HTMLParagraphElement>("#feedback");
const closeServiceButton = document.querySelector<HTMLButtonElement>("#close-service");
const serviceActions = document.querySelector<HTMLDivElement>("#service-actions");
const heroOpenButton = document.querySelector<HTMLButtonElement>("#hero-open");
const remoteDialog = document.querySelector<HTMLDialogElement>("#remote-dialog");
const remoteDetail = document.querySelector<HTMLParagraphElement>("#remote-detail");
const remotePairingView = document.querySelector<HTMLDivElement>("#remote-pairing-view");
const remoteQr = document.querySelector<HTMLImageElement>("#remote-qr");
const remoteExpiry = document.querySelector<HTMLParagraphElement>("#remote-expiry");
const remoteApproval = document.querySelector<HTMLDivElement>("#remote-approval");
const remoteReady = document.querySelector<HTMLDivElement>("#remote-ready");
const remoteReadyCopy = document.querySelector<HTMLSpanElement>("#remote-ready-copy");
const remoteStart = document.querySelector<HTMLButtonElement>("#remote-start");
const remoteApprove = document.querySelector<HTMLButtonElement>("#remote-approve");
const remoteDeny = document.querySelector<HTMLButtonElement>("#remote-deny");
const remoteClose = document.querySelector<HTMLButtonElement>("#remote-close");
const soundToggle = document.querySelector<HTMLButtonElement>("#sound-toggle");

function requireElement<T>(element: T | null, name: string): T {
  if (element === null) {
    throw new Error(`Missing renderer element: ${name}`);
  }

  return element;
}

const elements = {
  closeServiceButton: requireElement(closeServiceButton, "close-service"),
  diagnosticsStatus: requireElement(diagnosticsStatus, "diagnostics-status"),
  feedback: requireElement(feedback, "feedback"),
  healthPill: requireElement(healthPill, "health-pill"),
  heroOpenButton: requireElement(heroOpenButton, "hero-open"),
  remoteApproval: requireElement(remoteApproval, "remote-approval"),
  remoteApprove: requireElement(remoteApprove, "remote-approve"),
  remoteClose: requireElement(remoteClose, "remote-close"),
  remoteDeny: requireElement(remoteDeny, "remote-deny"),
  remoteDetail: requireElement(remoteDetail, "remote-detail"),
  remoteDialog: requireElement(remoteDialog, "remote-dialog"),
  remoteExpiry: requireElement(remoteExpiry, "remote-expiry"),
  remotePairingView: requireElement(remotePairingView, "remote-pairing-view"),
  remoteQr: requireElement(remoteQr, "remote-qr"),
  remoteReady: requireElement(remoteReady, "remote-ready"),
  remoteReadyCopy: requireElement(remoteReadyCopy, "remote-ready-copy"),
  remoteStart: requireElement(remoteStart, "remote-start"),
  runtimeStatus: requireElement(runtimeStatus, "runtime-status"),
  serviceActions: requireElement(serviceActions, "service-actions"),
  serviceStatus: requireElement(serviceStatus, "service-status"),
  soundToggle: requireElement(soundToggle, "sound-toggle"),
  widevineStatus: requireElement(widevineStatus, "widevine-status")
};

const navigationSounds = new NavigationSounds();
let currentRemoteStatus: RemoteStatus | null = null;

function renderStatus(status: HostStatus): void {
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

async function renderServices(): Promise<void> {
  const services = await window.nhd.getServices();

  async function openService(serviceId: string, serviceName: string): Promise<void> {
    elements.feedback.textContent = `Opening ${serviceName}…`;

    try {
      await window.nhd.openService(serviceId);
      elements.feedback.textContent = `${serviceName} opened.`;
    } catch (error) {
      elements.feedback.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  for (const service of services) {
    const option = document.createElement("article");
    option.className = "service-option";
    option.dataset.serviceId = service.id;

    const button = document.createElement("button");
    button.className = "service-tile";
    button.dataset.serviceId = service.id;
    button.type = "button";
    button.setAttribute("aria-label", `Open ${service.name}`);

    const kind = document.createElement("span");
    kind.className = "service-kind";
    kind.textContent = service.kind === "test" ? "DRM test" : "Streaming";

    const name = document.createElement("span");
    name.className = "service-name";

    const nameText = document.createElement("span");
    nameText.textContent = service.name;
    const arrow = document.createElement("span");
    arrow.className = "service-arrow";
    arrow.textContent = "→";
    arrow.setAttribute("aria-hidden", "true");

    name.append(nameText, arrow);
    button.append(kind, name);
    button.addEventListener("click", () => void openService(service.id, service.name));
    option.append(button);

    if (service.authenticationNote !== undefined) {
      const note = document.createElement("p");
      note.className = "authentication-note";
      note.textContent = service.authenticationNote;
      option.append(note);
    }

    elements.serviceActions.append(option);
  }

  const featured = services.find((service) => service.id === "netflix") ?? services[0];

  if (featured !== undefined) {
    elements.heroOpenButton.disabled = false;
    elements.heroOpenButton.textContent = `Open ${featured.name}`;
    elements.heroOpenButton.addEventListener("click", () =>
      void openService(featured.id, featured.name)
    );
  }
}

function showPlannedFeature(message: string): void {
  elements.feedback.textContent = message;
}

for (const id of ["store-nav", "hero-store", "store-card"]) {
  document.querySelector<HTMLButtonElement>(`#${id}`)?.addEventListener("click", () => {
    showPlannedFeature("The Service Store foundation is planned for Milestone 2.");
  });
}

for (const id of ["profile-button", "profile-card"]) {
  document.querySelector<HTMLButtonElement>(`#${id}`)?.addEventListener("click", () => {
    showPlannedFeature("Local profiles are planned for Milestone 2.");
  });
}

document.querySelector<HTMLButtonElement>("#settings-nav")?.addEventListener("click", () => {
  showPlannedFeature("Display, input, and privacy settings arrive with the TV shell milestone.");
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

document.querySelector<HTMLButtonElement>("#remote-card")?.addEventListener("click", () => {
  elements.remoteDialog.showModal();
  void refreshRemoteStatus()
    .then(() => {
      if (currentRemoteStatus?.state === "inactive") {
        return startRemotePairing();
      }

      elements.remoteStart.focus();
    })
    .catch(showRemoteError);
});

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
  elements.soundToggle.textContent = navigationSounds.enabled ? "Sound on" : "Sound off";
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

let remoteFocusedElement: HTMLElement | null = null;

function setRemoteFocusedElement(element: HTMLElement | null): void {
  remoteFocusedElement?.removeAttribute("data-remote-focused");
  remoteFocusedElement = element;

  if (element !== null) {
    element.setAttribute("data-remote-focused", "true");
  }
}

function visibleNavigationCandidates(): HTMLElement[] {
  const scope: ParentNode = elements.remoteDialog.open ? elements.remoteDialog : document;
  return Array.from(
    scope.querySelectorAll<HTMLElement>("button:not(:disabled), summary")
  ).filter((candidate) => candidate.getClientRects().length > 0);
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
    direction
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

document.addEventListener("keydown", (event) => {
  const direction = arrowDirections[event.key];

  if (direction === undefined) {
    return;
  }

  setRemoteFocusedElement(null);

  if (moveSpatialFocus(direction)) {
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

  if (elements.remoteDialog.open) {
    elements.remoteDialog.close();
  }

  window.scrollTo({ behavior: "smooth", top: 0 });
  elements.heroOpenButton.focus({ preventScroll: true });
  setRemoteFocusedElement(elements.heroOpenButton);
}

elements.closeServiceButton.addEventListener("click", async () => {
  await window.nhd.closeService();
  elements.feedback.textContent = "Service view closed.";
});

window.nhd.onHostStatusChanged(renderStatus);
window.nhd.onRemoteAction(handleShellRemoteAction);
window.nhd.onRemoteStatusChanged(renderRemoteStatus);
void refreshStatus();
void renderServices();
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
