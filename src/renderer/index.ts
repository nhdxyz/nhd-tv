import "./style.css";
import type { HostStatus } from "../main/contracts";

const runtimeStatus = document.querySelector<HTMLParagraphElement>("#runtime-status");
const widevineStatus = document.querySelector<HTMLParagraphElement>("#widevine-status");
const serviceStatus = document.querySelector<HTMLParagraphElement>("#service-status");
const diagnosticsStatus = document.querySelector<HTMLParagraphElement>("#diagnostics-status");
const feedback = document.querySelector<HTMLParagraphElement>("#feedback");
const closeServiceButton = document.querySelector<HTMLButtonElement>("#close-service");
const serviceActions = document.querySelector<HTMLDivElement>("#service-actions");

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
  const serviceProcess = status.diagnostics.serviceRenderer;
  const gpuProcess = status.diagnostics.gpuProcess;
  elements.diagnosticsStatus.textContent = [
    `Acceleration ${status.diagnostics.hardwareAcceleration ?? "checking"}`,
    `Video decode ${status.diagnostics.videoDecode}`,
    `VPx ${status.diagnostics.vpxDecode}`,
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

  for (const service of services) {
    const button = document.createElement("button");
    button.classList.toggle("secondary", service.kind === "test");
    button.dataset.serviceId = service.id;
    button.textContent = service.kind === "test" ? `${service.name} (test)` : service.name;
    button.type = "button";
    button.addEventListener("click", async () => {
      elements.feedback.textContent = `Opening ${service.name}…`;

      try {
        await window.nhd.openService(service.id);
        elements.feedback.textContent = `${service.name} opened.`;
      } catch (error) {
        elements.feedback.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    elements.serviceActions.append(button);
  }
}

elements.closeServiceButton.addEventListener("click", async () => {
  await window.nhd.closeService();
  elements.feedback.textContent = "Service view closed.";
});

window.nhd.onHostStatusChanged(renderStatus);
void refreshStatus();
void renderServices();
window.setInterval(() => void refreshStatus().catch(() => undefined), 5_000);
