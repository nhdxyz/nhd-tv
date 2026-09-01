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
      body { display: grid; padding: 10px; place-items: center; }
      aside {
        display: grid;
        width: 100%;
        min-height: 148px;
        padding: 26px 32px;
        grid-template-columns: 58px minmax(0, 1fr);
        align-items: center;
        gap: 24px;
        overflow: hidden;
        border: 1px solid #2b2d31;
        border-radius: 18px;
        background: rgb(14 15 17 / 98%);
        box-shadow: 0 18px 48px rgb(0 0 0 / 48%);
        color: #f7f7f8;
      }
      .state-mark {
        display: grid;
        width: 58px;
        height: 58px;
        place-content: center;
        border: 1px solid #34363b;
        border-radius: 14px;
        background: #1d1f22;
        color: #f7f7f8;
      }
      .levels { display: none; height: 28px; align-items: center; gap: 5px; }
      .levels i { width: 4px; height: 12px; border-radius: 2px; background: currentColor; animation: level 760ms ease-in-out infinite alternate; }
      .levels i:nth-child(2) { height: 25px; animation-delay: -240ms; }
      .levels i:nth-child(3) { height: 17px; animation-delay: -480ms; }
      .state-icon { display: none; width: 30px; height: 30px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2.2; }
      aside[data-phase="listening"] .levels { display: flex; }
      aside[data-phase="understanding"] .icon-working,
      aside[data-phase="transcript"] .icon-transcript,
      aside[data-phase="success"] .icon-success,
      aside[data-phase="clarification"] .icon-clarification,
      aside[data-phase="confirmation"] .icon-confirmation,
      aside[data-phase="error"] .icon-error { display: block; }
      aside[data-phase="success"] .state-mark { color: #74d99f; }
      aside[data-phase="confirmation"] .state-mark { color: #f2c66d; }
      aside[data-phase="error"] .state-mark { color: #ff858f; }
      .copy { display: grid; min-width: 0; gap: 8px; }
      .meta { display: flex; min-width: 0; align-items: center; gap: 12px; }
      small { color: #f7f7f8; font-size: 15px; font-weight: 780; letter-spacing: .12em; text-transform: uppercase; }
      .phase-label { color: #9b9ea6; font-size: 15px; font-weight: 650; }
      strong { display: -webkit-box; overflow: hidden; font-size: clamp(30px, 3.1vw, 42px); font-weight: 680; letter-spacing: -.025em; line-height: 1.12; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
      .choices { display: grid; gap: 8px; margin: 14px 0 0; padding: 0; list-style: none; }
      .choices[hidden] { display: none; }
      .choices li { display: grid; min-width: 0; padding: 10px 14px; grid-template-columns: 42px minmax(0, 1fr); align-items: center; gap: 14px; border: 1px solid #303238; border-radius: 12px; background: #191a1d; }
      .ordinal { display: grid; width: 42px; height: 42px; place-items: center; border: 1px solid #3b3d43; border-radius: 10px; background: #24262a; color: #f7f7f8; font-size: 19px; font-weight: 760; }
      .labels { display: grid; min-width: 0; gap: 3px; }
      .primary, .secondary { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .primary { font-size: 22px; font-weight: 700; }
      .secondary { color: #a9abb2; font-size: 17px; font-weight: 540; }
      .instruction { color: #b9bbc2; font-size: 18px; font-weight: 560; line-height: 1.4; }
      .instruction[hidden] { display: none; }
      aside[data-phase="clarification"] { align-items: start; }
      aside[data-phase="clarification"] .state-mark { margin-top: 2px; }
      @keyframes level { to { height: 27px; } }
      @media (prefers-reduced-motion: reduce) { .levels i { animation: none; } }
    </style>
  </head>
  <body>
    <aside id="voice" data-phase="listening" role="status" aria-live="polite" aria-atomic="true">
      <span class="state-mark" aria-hidden="true">
        <span class="levels"><i></i><i></i><i></i></span>
        <svg class="state-icon icon-working" viewBox="0 0 32 32"><circle cx="7" cy="16" r="1.5"></circle><circle cx="16" cy="16" r="1.5"></circle><circle cx="25" cy="16" r="1.5"></circle></svg>
        <svg class="state-icon icon-transcript" viewBox="0 0 32 32"><path d="M7 9h18M7 16h15M7 23h11"></path></svg>
        <svg class="state-icon icon-success" viewBox="0 0 32 32"><path d="m7 17 6 6L26 9"></path></svg>
        <svg class="state-icon icon-clarification" viewBox="0 0 32 32"><path d="M11.5 11.5a5 5 0 0 1 9.4 2.4c0 4-4.9 4.1-4.9 7.1M16 26h.01"></path></svg>
        <svg class="state-icon icon-confirmation" viewBox="0 0 32 32"><rect x="9" y="5" width="14" height="22" rx="2.5"></rect><path d="m12.5 17 2.5 2.5 5-5"></path></svg>
        <svg class="state-icon icon-error" viewBox="0 0 32 32"><path d="M16 7 27 26H5L16 7Z"></path><path d="M16 13v6M16 23h.01"></path></svg>
      </span>
      <div class="copy">
        <div class="meta"><small id="label">Voice</small><span class="phase-label" id="phase-label">Listening</span></div>
        <strong id="detail">Listening…</strong>
        <span class="instruction" id="instruction" hidden></span>
        <ol class="choices" id="choices" aria-label="Choices" role="list" hidden></ol>
      </div>
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
  contentHeight: number,
  phase: VoicePresentationState["phase"] = "understanding"
): ProviderVoiceOverlayBounds {
  const safeWidth = Math.max(0, Math.floor(contentWidth));
  const safeHeight = Math.max(0, Math.floor(contentHeight));
  const outerInset = Math.max(16, Math.min(48, Math.round(safeWidth * 0.035)));
  const availableWidth = Math.max(0, safeWidth - outerInset * 2);
  const width = Math.min(1_040, availableWidth);
  const maximumHeight = phase === "clarification" ? 420 : 224;
  const height = Math.min(maximumHeight, Math.max(0, safeHeight - 32));
  const bottomInset = Math.max(16, Math.min(44, Math.round(safeHeight * 0.045)));
  return {
    height,
    width,
    x: Math.max(0, Math.round((safeWidth - width) / 2)),
    y: Math.max(0, safeHeight - height - bottomInset)
  };
}

function clarificationInstruction(choiceCount: number): string {
  if (choiceCount <= 1) return "Hold the mic again and say “the first one.”";
  if (choiceCount === 2) {
    return "Hold the mic again and say “the first one” or “the second one.”";
  }
  return "Hold the mic again and say “the first one,” “the second one,” or “the third one.”";
}

function overlayCopy(
  state: VoicePresentationState
): { copy: string; instruction: string | null; label: string } {
  if (state.phase === "transcript") {
    return { copy: state.transcript ?? "", instruction: null, label: "Voice" };
  }
  if (state.phase === "success") {
    return { copy: state.detail ?? "Done", instruction: null, label: "Voice" };
  }
  if (state.phase === "clarification") {
    return {
      copy: state.detail ?? "Which one did you mean?",
      instruction: clarificationInstruction(state.choices?.length ?? 0),
      label: "Voice"
    };
  }
  if (state.phase === "confirmation") {
    return { copy: state.detail ?? "Confirm on your phone.", instruction: null, label: "Voice" };
  }
  if (state.phase === "error") {
    return {
      copy: state.detail ?? "Voice control could not finish that",
      instruction: null,
      label: "Voice"
    };
  }
  return {
    copy: state.detail ?? (state.phase === "listening" ? "Listening…" : "Understanding…"),
    instruction: null,
    label: "Voice"
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
    this.#view.setBounds(providerVoiceOverlayBounds(
      width,
      height,
      this.#state?.phase ?? "hidden"
    ));
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
    const choices = state.phase === "clarification"
      ? state.choices?.slice(0, 3).map((choice) => ({
        ordinal: choice.ordinal,
        primaryLabel: choice.primaryLabel,
        secondaryLabel: choice.secondaryLabel
      })) ?? []
      : [];
    const payload = JSON.stringify({ ...copy, choices, phase: state.phase });
    try {
      await view.webContents.executeJavaScript(`(() => {
        const state = ${payload};
        const root = document.querySelector("#voice");
        const label = document.querySelector("#label");
        const phaseLabel = document.querySelector("#phase-label");
        const detail = document.querySelector("#detail");
        const instruction = document.querySelector("#instruction");
        const choices = document.querySelector("#choices");
        if (!(root instanceof HTMLElement) || !(label instanceof HTMLElement) || !(phaseLabel instanceof HTMLElement) || !(detail instanceof HTMLElement) || !(instruction instanceof HTMLElement) || !(choices instanceof HTMLOListElement)) return;
        root.dataset.phase = state.phase;
        label.textContent = state.label;
        phaseLabel.textContent = ({
          listening: "Listening",
          understanding: "Working",
          transcript: "Heard",
          success: "Complete",
          clarification: "Choose one",
          confirmation: "Confirmation",
          error: "Needs attention"
        })[state.phase] ?? "Working";
        detail.textContent = state.copy;
        instruction.textContent = state.instruction ?? "";
        instruction.hidden = typeof state.instruction !== "string";
        choices.replaceChildren();
        for (const choice of state.phase === "clarification" ? state.choices : []) {
          const item = document.createElement("li");
          item.value = choice.ordinal;
          const ordinal = document.createElement("span");
          ordinal.className = "ordinal";
          ordinal.textContent = String(choice.ordinal);
          const labels = document.createElement("span");
          labels.className = "labels";
          const primary = document.createElement("span");
          primary.className = "primary";
          primary.textContent = choice.primaryLabel;
          labels.append(primary);
          if (typeof choice.secondaryLabel === "string") {
            const secondary = document.createElement("span");
            secondary.className = "secondary";
            secondary.textContent = choice.secondaryLabel;
            labels.append(secondary);
          }
          item.append(ordinal, labels);
          choices.append(item);
        }
        choices.hidden = state.phase !== "clarification" || state.choices.length === 0;
      })()`);
    } catch {
      if (version === this.#renderVersion && this.#view === view) this.hide();
    }
  }
}
