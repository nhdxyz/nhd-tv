import "./style.css";
import type { HostStatus } from "../main/contracts";

const runtimeStatus = document.querySelector<HTMLParagraphElement>("#runtime-status");
const widevineStatus = document.querySelector<HTMLParagraphElement>("#widevine-status");
const serviceStatus = document.querySelector<HTMLParagraphElement>("#service-status");
const feedback = document.querySelector<HTMLParagraphElement>("#feedback");
const openServiceButton = document.querySelector<HTMLButtonElement>("#open-service");
const closeServiceButton = document.querySelector<HTMLButtonElement>("#close-service");

function requireElement<T>(element: T | null, name: string): T {
  if (element === null) {
    throw new Error(`Missing renderer element: ${name}`);
  }

  return element;
}

const elements = {
  closeServiceButton: requireElement(closeServiceButton, "close-service"),
  feedback: requireElement(feedback, "feedback"),
  openServiceButton: requireElement(openServiceButton, "open-service"),
  runtimeStatus: requireElement(runtimeStatus, "runtime-status"),
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
}

async function refreshStatus(): Promise<void> {
  renderStatus(await window.nhd.getHostStatus());
}

elements.openServiceButton.addEventListener("click", async () => {
  elements.feedback.textContent = "Opening secure service view…";

  try {
    await window.nhd.openService("shaka-demo");
    elements.feedback.textContent = "Service view opened.";
  } catch (error) {
    elements.feedback.textContent = error instanceof Error ? error.message : String(error);
  }
});

elements.closeServiceButton.addEventListener("click", async () => {
  await window.nhd.closeService();
  elements.feedback.textContent = "Service view closed.";
});

window.nhd.onHostStatusChanged(renderStatus);
void refreshStatus();
