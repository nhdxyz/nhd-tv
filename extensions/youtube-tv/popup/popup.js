(() => {
  "use strict";

  const input = document.querySelector("#tv-mode-enabled");
  const status = document.querySelector("#mode-status");
  const scale = document.querySelector("#tv-mode-scale");
  const safeArea = document.querySelector("#tv-mode-safe-area");
  const diagnosticsStatus = document.querySelector("#diagnostics-status");
  const refreshDiagnostics = document.querySelector("#refresh-diagnostics");

  if (
    !(input instanceof HTMLInputElement) ||
    !(status instanceof HTMLElement) ||
    !(scale instanceof HTMLSelectElement) ||
    !(safeArea instanceof HTMLSelectElement) ||
    !(diagnosticsStatus instanceof HTMLElement) ||
    !(refreshDiagnostics instanceof HTMLButtonElement)
  ) return;

  const render = ({ enabled, safeAreaValue, scaleValue }) => {
    input.checked = enabled;
    status.textContent = enabled ? "On · remote navigation active" : "Off · ordinary YouTube";
    scale.value = scaleValue;
    safeArea.value = safeAreaValue;
  };

  chrome.storage.local.get({
    tvModeEnabled: true,
    tvModeSafeArea: "standard",
    tvModeScale: "standard"
  }, ({ tvModeEnabled, tvModeSafeArea, tvModeScale }) => {
    render({
      enabled: tvModeEnabled !== false,
      safeAreaValue: tvModeSafeArea,
      scaleValue: tvModeScale
    });
    input.disabled = false;
    scale.disabled = false;
    safeArea.disabled = false;
  });

  input.addEventListener("change", () => {
    input.disabled = true;
    const enabled = input.checked;
    chrome.storage.local.set({ tvModeEnabled: enabled }, () => {
      status.textContent = enabled ? "On · remote navigation active" : "Off · ordinary YouTube";
      input.disabled = false;
      void inspectPage();
    });
  });

  scale.addEventListener("change", () => {
    chrome.storage.local.set({ tvModeScale: scale.value }, () => void inspectPage());
  });

  safeArea.addEventListener("change", () => {
    chrome.storage.local.set({ tvModeSafeArea: safeArea.value }, () => void inspectPage());
  });

  const diagnosticText = (diagnostics) => {
    if (!diagnostics || typeof diagnostics !== "object") return "YouTube is open, but TV Mode did not answer.";
    const managed = diagnostics.hostManaged ? " · managed by NHD-TV" : "";
    const player = diagnostics.playerFirst ? " · player-first input" : "";
    const context = diagnostics.pageHeading ? ` · ${diagnostics.pageHeading}` : "";
    const categories = Number.isFinite(diagnostics.categories) ? diagnostics.categories : 0;
    return `${diagnostics.route} · ${diagnostics.cards} cards · ${categories} categories · ${diagnostics.shelves} shelves · ${diagnostics.candidates} focus stops${context}${player}${managed}`;
  };

  function inspectPage() {
    diagnosticsStatus.textContent = "Inspecting the active YouTube page…";
    if (!chrome.tabs?.query || !chrome.tabs?.sendMessage) {
      diagnosticsStatus.textContent = "Page inspection is unavailable in this browser window.";
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        diagnosticsStatus.textContent = "Page inspection is unavailable in this browser window.";
        return;
      }
      const tabId = tabs[0]?.id;
      if (typeof tabId !== "number") {
        diagnosticsStatus.textContent = "Open a YouTube tab to inspect its selectors.";
        return;
      }
      chrome.tabs.sendMessage(tabId, { type: "nhdtv:get-diagnostics" }, (diagnostics) => {
        if (chrome.runtime.lastError) {
          diagnosticsStatus.textContent = "Open or refresh a youtube.com tab to inspect its selectors.";
          return;
        }
        diagnosticsStatus.textContent = diagnosticText(diagnostics);
        if (diagnostics?.hostManaged) {
          input.disabled = true;
          scale.disabled = true;
          safeArea.disabled = true;
          status.textContent = diagnostics.active ? "On · managed by NHD-TV" : "Off · managed by NHD-TV";
        }
      });
    });
  }

  refreshDiagnostics.addEventListener("click", inspectPage);
  void inspectPage();
})();
