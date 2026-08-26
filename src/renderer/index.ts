import "./style.css";
import type { HostStatus } from "../main/contracts";
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
  runtimeStatus: requireElement(runtimeStatus, "runtime-status"),
  serviceActions: requireElement(serviceActions, "service-actions"),
  serviceStatus: requireElement(serviceStatus, "service-status"),
  widevineStatus: requireElement(widevineStatus, "widevine-status")
};

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

document.querySelector<HTMLButtonElement>("#remote-card")?.addEventListener("click", () => {
  showPlannedFeature("QR phone pairing is planned for Milestone 4.");
});

const arrowDirections: Readonly<Record<string, SpatialDirection>> = {
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up"
};

document.addEventListener("keydown", (event) => {
  const direction = arrowDirections[event.key];
  const current = event.target;

  if (direction === undefined || !(current instanceof HTMLElement)) {
    return;
  }

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>("button:not(:disabled), summary")
  ).filter((candidate) => candidate.getClientRects().length > 0);
  const currentIndex = candidates.indexOf(current);

  if (currentIndex === -1) {
    return;
  }

  const nextIndex = findDirectionalTarget(
    currentIndex,
    candidates.map((candidate) => candidate.getBoundingClientRect()),
    direction
  );

  if (nextIndex === null) {
    return;
  }

  event.preventDefault();
  candidates[nextIndex]?.focus({ preventScroll: true });
  candidates[nextIndex]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
});

elements.closeServiceButton.addEventListener("click", async () => {
  await window.nhd.closeService();
  elements.feedback.textContent = "Service view closed.";
});

window.nhd.onHostStatusChanged(renderStatus);
void refreshStatus();
void renderServices();
window.setInterval(() => void refreshStatus().catch(() => undefined), 5_000);
