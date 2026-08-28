import { WebContentsView, type BrowserWindow } from "electron";
import type { VoicePresentationState } from "../contracts";

const OVERLAY_DOCUMENT = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'" />
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
      body { display: grid; padding: 8px; place-items: center; }
      aside {
        display: grid;
        width: 100%;
        min-height: 108px;
        padding: 20px 24px;
        grid-template-columns: 52px minmax(0, 1fr);
        align-items: center;
        gap: 18px;
        overflow: hidden;
        border: 1px solid rgb(255 255 255 / 14%);
        border-radius: 24px;
        background: rgb(10 12 15 / 94%);
        box-shadow: 0 22px 70px rgb(0 0 0 / 54%), inset 0 1px rgb(255 255 255 / 8%);
        color: #f7f7f3;
        backdrop-filter: blur(24px);
      }
      .signal {
        position: relative;
        display: grid;
        width: 52px;
        height: 52px;
        grid-template-columns: repeat(3, 5px);
        place-content: center;
        gap: 4px;
        border-radius: 50%;
        background: #d7ff55;
        color: #10120d;
        box-shadow: 0 0 30px rgb(215 255 85 / 22%);
      }
      .signal i { width: 5px; height: 17px; border-radius: 999px; background: currentColor; animation: pulse 820ms ease-in-out infinite alternate; }
      .signal i:nth-child(2) { height: 28px; animation-delay: -260ms; }
      .signal i:nth-child(3) { animation-delay: -520ms; }
      .copy { display: grid; min-width: 0; gap: 5px; }
      small { color: #d7ff55; font-size: 12px; font-weight: 850; letter-spacing: .13em; text-transform: uppercase; }
      strong { display: -webkit-box; overflow: hidden; font-size: clamp(21px, 3.2vw, 30px); font-weight: 760; letter-spacing: -.025em; line-height: 1.15; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
      aside[data-phase="success"] .signal { background: #72e6a1; }
      aside[data-phase="confirmation"] .signal { background: #fbbf24; }
      aside[data-phase="error"] .signal { background: #ff6577; color: #fff; }
      aside[data-phase="success"] small { color: #72e6a1; }
      aside[data-phase="confirmation"] small { color: #fbbf24; }
      aside[data-phase="error"] small { color: #ff8795; }
      aside[data-phase="success"] .signal i,
      aside[data-phase="error"] .signal i { height: 18px; animation: none; transform: rotate(45deg); }
      aside[data-phase="success"] .signal i:first-child { width: 6px; height: 14px; transform: translate(6px, 4px) rotate(-42deg); }
      aside[data-phase="success"] .signal i:nth-child(2) { width: 6px; height: 25px; transform: translate(-4px, -1px) rotate(42deg); }
      aside[data-phase="success"] .signal i:last-child { display: none; }
      aside[data-phase="error"] .signal i:first-child { transform: translate(5px) rotate(45deg); }
      aside[data-phase="error"] .signal i:nth-child(2) { transform: translate(-4px) rotate(-45deg); }
      aside[data-phase="error"] .signal i:last-child { display: none; }
      @keyframes pulse { to { height: 30px; } }
      @media (prefers-reduced-motion: reduce) { .signal i { animation: none; } }
    </style>
  </head>
  <body>
    <aside id="voice" data-phase="listening" role="status" aria-live="polite" aria-atomic="true">
      <span class="signal" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="copy"><small id="label">AI Voice</small><strong id="detail">Listening…</strong></span>
    </aside>
  </body>
</html>`;

const OVERLAY_URL = `data:text/html;charset=utf-8,${encodeURIComponent(OVERLAY_DOCUMENT)}`;

export interface ProviderVoiceOverlayBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

export function providerVoiceOverlayBounds(
  contentWidth: number,
  contentHeight: number
): ProviderVoiceOverlayBounds {
  const safeWidth = Math.max(0, Math.floor(contentWidth));
  const safeHeight = Math.max(0, Math.floor(contentHeight));
  const outerInset = Math.max(16, Math.min(48, Math.round(safeWidth * 0.035)));
  const availableWidth = Math.max(0, safeWidth - outerInset * 2);
  const width = Math.min(920, availableWidth);
  const height = Math.min(196, Math.max(0, safeHeight - 32));
  const bottomInset = Math.max(16, Math.min(44, Math.round(safeHeight * 0.045)));
  return {
    height,
    width,
    x: Math.max(0, Math.round((safeWidth - width) / 2)),
    y: Math.max(0, safeHeight - height - bottomInset)
  };
}

function overlayCopy(state: VoicePresentationState): { copy: string; label: string } {
  if (state.phase === "transcript") {
    return { copy: state.transcript ?? "", label: "You said" };
  }
  if (state.phase === "success") {
    return { copy: state.detail ?? "Done", label: "Done" };
  }
  if (state.phase === "confirmation") {
    return { copy: state.detail ?? "Confirm on your phone.", label: "Confirm on phone" };
  }
  if (state.phase === "error") {
    return { copy: state.detail ?? "Voice control could not finish that", label: "Try again" };
  }
  return {
    copy: state.detail ?? (state.phase === "listening" ? "Listening…" : "Understanding…"),
    label: "AI Voice"
  };
}

/**
 * Presents voice feedback above a provider in a separate trusted WebContentsView.
 * Transcript text is never inserted into the provider's page or storage.
 */
export class ProviderVoiceOverlay {
  readonly #window: BrowserWindow;
  #ready = false;
  #renderVersion = 0;
  #state: VoicePresentationState | null = null;
  #view: WebContentsView | null = null;

  constructor(window: BrowserWindow) {
    this.#window = window;
  }

  hide(): void {
    this.#state = null;
    this.#renderVersion += 1;
    const view = this.#view;
    this.#view = null;
    this.#ready = false;
    if (view === null) return;
    try {
      this.#window.contentView.removeChildView(view);
    } catch {
      // The parent may already be closing.
    }
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }

  resize(): void {
    if (this.#view === null) return;
    const [width = 0, height = 0] = this.#window.getContentSize();
    this.#view.setBounds(providerVoiceOverlayBounds(width, height));
  }

  show(state: VoicePresentationState): void {
    if (state.phase === "hidden") {
      this.hide();
      return;
    }
    this.#state = state;
    this.#ensureView();
    this.#raiseView();
    this.resize();
    void this.#render();
  }

  #raiseView(): void {
    const view = this.#view;
    if (view === null || view.webContents.isDestroyed()) return;
    try {
      this.#window.contentView.removeChildView(view);
    } catch {
      // A newly recreated parent may not contain the overlay yet.
    }
    try {
      this.#window.contentView.addChildView(view);
    } catch {
      // The parent may be closing while a terminal voice state is published.
    }
  }

  #ensureView(): void {
    if (this.#view !== null) return;
    const view = new WebContentsView({
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: true,
        devTools: false,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    });
    this.#view = view;
    this.#ready = false;
    view.setBackgroundColor("#00000000");
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    view.webContents.on("will-navigate", (event, url) => {
      if (url !== OVERLAY_URL) event.preventDefault();
    });
    view.webContents.on("dom-ready", () => {
      if (this.#view !== view) return;
      this.#ready = true;
      void this.#render();
    });
    view.webContents.on("render-process-gone", () => {
      if (this.#view === view) this.hide();
    });
    this.#window.contentView.addChildView(view);
    this.resize();
    void view.webContents.loadURL(OVERLAY_URL).catch(() => {
      if (this.#view === view) this.hide();
    });
  }

  async #render(): Promise<void> {
    const view = this.#view;
    const state = this.#state;
    if (view === null || state === null || !this.#ready || view.webContents.isDestroyed()) return;
    const version = ++this.#renderVersion;
    const copy = overlayCopy(state);
    const payload = JSON.stringify({ ...copy, phase: state.phase });
    try {
      await view.webContents.executeJavaScript(`(() => {
        const state = ${payload};
        const root = document.querySelector("#voice");
        const label = document.querySelector("#label");
        const detail = document.querySelector("#detail");
        if (!(root instanceof HTMLElement) || !(label instanceof HTMLElement) || !(detail instanceof HTMLElement)) return;
        root.dataset.phase = state.phase;
        label.textContent = state.label;
        detail.textContent = state.copy;
      })()`);
    } catch {
      if (version === this.#renderVersion && this.#view === view) this.hide();
    }
  }
}
