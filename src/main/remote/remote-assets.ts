import { createLatestRemoteTextPump } from "../remote-text-pump";

export function precisionRelativeDelta(deltaPixels: number, extentPixels: number): number {
  if (
    !Number.isFinite(deltaPixels) ||
    !Number.isFinite(extentPixels) ||
    extentPixels <= 0 ||
    Math.abs(deltaPixels) < 0.45
  ) {
    return 0;
  }

  const normalized = deltaPixels / extentPixels;
  const magnitude = Math.abs(normalized);
  const gain = magnitude >= 0.08 ? 1.4 : magnitude >= 0.025 ? 1.22 : 1.06;
  return Math.max(-0.24, Math.min(0.24, normalized * gain));
}

export interface PrecisionPoint {
  x: number;
  y: number;
}

export function movePrecisionPoint(
  point: PrecisionPoint,
  deltaX: number,
  deltaY: number,
  width: number,
  height: number
): PrecisionPoint {
  return {
    x: Math.max(0, Math.min(1, point.x + precisionRelativeDelta(deltaX, width))),
    y: Math.max(0, Math.min(1, point.y + precisionRelativeDelta(deltaY, height)))
  };
}

export function precisionEdgeScroll(normalizedY: number, verticalDelta: number): number {
  const magnitude = Math.abs(verticalDelta);

  if (
    magnitude < 1.5 ||
    (normalizedY >= 0.12 && normalizedY <= 0.88) ||
    (normalizedY < 0.12 && verticalDelta >= 0) ||
    (normalizedY > 0.88 && verticalDelta <= 0)
  ) {
    return 0;
  }

  const direction = verticalDelta < 0 ? -1 : 1;
  const scaledMagnitude = Math.max(0.12, Math.min(1, magnitude / 18));
  return direction * Math.round(scaledMagnitude * 100) / 100;
}

export function precisionHorizontalScroll(
  horizontalDelta: number,
  verticalDelta: number
): number {
  const horizontalMagnitude = Math.abs(horizontalDelta);
  const verticalMagnitude = Math.abs(verticalDelta);

  if (
    !Number.isFinite(horizontalDelta) ||
    !Number.isFinite(verticalDelta) ||
    horizontalMagnitude < 2.5 ||
    horizontalMagnitude <= verticalMagnitude * 1.15
  ) {
    return 0;
  }

  const direction = horizontalDelta < 0 ? -1 : 1;
  const scaledMagnitude = Math.max(0.18, Math.min(1, horizontalMagnitude / 22));
  return direction * Math.round(scaledMagnitude * 100) / 100;
}

export const REMOTE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
    <meta name="theme-color" content="#05070b" />
    <title>NHD-TV Remote</title>
    <link rel="stylesheet" href="/remote.css" />
  </head>
  <body>
    <main class="remote-shell">
      <header class="remote-header">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">N</span>
          <strong>NHD Remote</strong>
        </div>
        <p id="connection-state" role="status"><span aria-hidden="true"></span>Requesting approval</p>
      </header>

      <section class="remote-card" aria-label="Television remote">
        <div class="remote-top-actions" aria-label="System controls">
          <button class="remote-icon-button" data-action="back" type="button" disabled aria-label="Back. Hold to force return Home">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <span id="remote-mode-label" aria-hidden="true">Navigate</span>
          <button class="remote-icon-button" data-action="home" type="button" disabled aria-label="NHD Home">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10.5 8-6.5 8 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" /><path d="M9.5 20v-6h5v6" /></svg>
          </button>
        </div>

        <div class="control-surface">
          <div class="dpad" aria-label="Directional pad">
            <button class="up" data-action="up" type="button" disabled aria-label="Up"><span aria-hidden="true"></span></button>
            <button class="left" data-action="left" type="button" disabled aria-label="Left"><span aria-hidden="true"></span></button>
            <button class="select" data-action="select" type="button" disabled aria-label="Select"><span aria-hidden="true"></span></button>
            <button class="right" data-action="right" type="button" disabled aria-label="Right"><span aria-hidden="true"></span></button>
            <button class="down" data-action="down" type="button" disabled aria-label="Down"><span aria-hidden="true"></span></button>
          </div>

          <div class="precision-pad" id="precision-pad" role="button" tabindex="0" aria-label="Swipe anywhere to move the cursor, lift and continue, or tap to select" hidden>
            <span class="precision-status" aria-hidden="true"><i></i></span>
          </div>
        </div>

        <div class="playback-controls" aria-label="Playback controls">
          <button data-action="rewind" data-feedback="Playback control sent" type="button" disabled aria-label="Rewind">
            <svg class="transport-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m11 6-7 6 7 6zm9 0-7 6 7 6z" /></svg>
          </button>
          <button class="media-primary" data-action="play-pause" data-feedback="Playback control sent" type="button" disabled aria-label="Play or pause">
            <svg class="play-pause-icon" viewBox="0 0 28 20" aria-hidden="true">
              <path class="play-shape" d="M2 2.5v15l10-7.5z" />
              <path class="pause-shape" d="M17 2.5h3.5v15H17zm7.5 0H28v15h-3.5z" />
            </svg>
          </button>
          <button data-action="fast-forward" data-feedback="Playback control sent" type="button" disabled aria-label="Fast forward">
            <svg class="transport-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m13 6 7 6-7 6zM4 6l7 6-7 6z" /></svg>
          </button>
        </div>

        <div class="volume-controls" aria-label="Volume controls">
          <button data-action="volume-down" data-feedback="Volume sent · TV support varies" type="button" disabled aria-label="Volume down"><span aria-hidden="true">−</span></button>
          <button data-action="mute" data-feedback="Mute sent · TV support varies" type="button" disabled aria-label="Mute">
            <svg class="mute-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4zM18 9l4 6m0-6-4 6" /></svg>
          </button>
          <button data-action="volume-up" data-feedback="Volume sent · TV support varies" type="button" disabled aria-label="Volume up"><span aria-hidden="true">+</span></button>
        </div>

        <div class="remote-utilities" aria-label="Remote tools">
          <button class="control-mode utility-button" id="control-mode" type="button" disabled aria-label="Use precision pointer">
            <svg class="pointer-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 3 6.7 16 2.2-6.1 6.1-2.2z" /></svg>
            <svg class="arrows-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18m-4-4 4 4-4 4M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4" /></svg>
          </button>
          <button class="quick-launch-toggle utility-button" id="quick-launch-toggle" type="button" disabled aria-label="Recent apps">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></svg>
          </button>
          <button class="search-toggle utility-button" id="search-toggle" type="button" disabled aria-label="Search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.5 15.5 4 4" /></svg>
          </button>
        </div>

        <section class="quick-launch-panel" id="quick-launch-panel" aria-labelledby="quick-launch-title" hidden>
          <div class="quick-launch-heading">
            <div>
              <small>Quick launch</small>
              <strong id="quick-launch-title">Recent apps</strong>
            </div>
            <button id="quick-launch-close" type="button" aria-label="Close recent apps">×</button>
          </div>
          <div class="quick-launch-list" id="quick-launch-list"></div>
          <p id="quick-launch-empty">Open an app on NHD-TV and it will appear here.</p>
        </section>

        <form class="search-panel" id="search-panel" hidden>
          <label id="search-label" for="search-query">Search your services</label>
          <div>
            <input
              id="search-query"
              type="search"
              maxlength="120"
              autocomplete="off"
              enterkeyhint="search"
              placeholder="Title, person, or topic"
            />
            <button id="search-submit" type="submit">Send</button>
          </div>
          <p>Use the microphone on your phone keyboard for voice dictation.</p>
        </form>

        <p class="privacy-note"><span aria-hidden="true"></span> Private local connection</p>
      </section>

      <p class="footnote">Rescan the QR code after NHD-TV restarts</p>
    </main>
    <script src="/remote.js" defer></script>
  </body>
</html>`;

export const REMOTE_CSS = `:root {
  color: #f8fafc;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color-scheme: dark;
  -webkit-font-smoothing: antialiased;
}

* { box-sizing: border-box; }

body {
  height: 100dvh;
  min-height: 100dvh;
  margin: 0;
  padding: max(0.65rem, env(safe-area-inset-top)) 0.8rem max(0.7rem, env(safe-area-inset-bottom));
  overflow: hidden;
  background:
    radial-gradient(circle at 50% -18%, rgb(69 93 145 / 18%), transparent 24rem),
    #07090d;
}

html,
body {
  touch-action: manipulation;
  overscroll-behavior: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

button {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

input {
  -webkit-touch-callout: default;
  -webkit-user-select: text;
  user-select: text;
}

.remote-shell {
  display: flex;
  width: min(100%, 25rem);
  height: 100%;
  min-height: 0;
  margin: 0 auto;
  flex-direction: column;
}

.remote-header {
  display: flex;
  min-height: 2rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.brand { display: flex; align-items: center; gap: 0.4rem; color: #aab2c0; }
.brand-mark {
  display: grid;
  width: 1.55rem;
  height: 1.55rem;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 0.48rem;
  background: #171b23;
  color: #e7ebf2;
  font-size: 0.67rem;
  font-weight: 850;
}
.brand strong { font-size: 0.7rem; font-weight: 750; letter-spacing: 0.01em; }

#connection-state {
  display: flex;
  min-width: 0;
  max-width: 58%;
  margin: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 0.38rem;
  color: #d6b978;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1.2;
  text-align: right;
}
#connection-state span {
  width: 0.38rem;
  height: 0.38rem;
  border-radius: 50%;
  background: currentColor;
}
#connection-state.connected { color: #9dd6ad; }
#connection-state.error { color: #fda4af; }

.remote-card {
  display: flex;
  min-height: 0;
  margin-top: 0.45rem;
  padding: 0.8rem;
  flex: 1;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 1.8rem;
  background: #0e1117;
  box-shadow: 0 1.4rem 4rem rgb(0 0 0 / 28%);
}

.remote-top-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
}
.remote-top-actions > span {
  color: #707986;
  font-size: 0.56rem;
  font-weight: 750;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
.remote-icon-button {
  display: grid;
  width: 2.85rem;
  height: 2.85rem;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #c5cbd5;
}
.remote-icon-button svg {
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.9;
}
.remote-icon-button:not(:disabled).is-pressed,
.remote-icon-button:not(:disabled):active { background: #1a1f28; transform: scale(0.94); }

.control-surface {
  display: grid;
  min-height: 0;
  padding: 0.35rem 0 0.55rem;
  flex: 1 1 auto;
  place-items: center;
}
.control-surface > * { grid-area: 1 / 1; }

.dpad {
  display: grid;
  width: min(81vw, 39dvh, 19rem);
  aspect-ratio: 1;
  grid-template: repeat(3, 1fr) / repeat(3, 1fr);
  grid-template-areas: ". up ." "left select right" ". down .";
  gap: 0;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 9%);
  border-radius: 50%;
  background: #171b22;
  box-shadow: inset 0 1px rgb(255 255 255 / 5%), 0 1rem 2.8rem rgb(0 0 0 / 20%);
}
.dpad[hidden] { display: none; }

.dpad button {
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #9ea7b5;
  font: inherit;
}
.dpad button span { display: grid; width: 100%; height: 100%; place-items: center; border-radius: inherit; }
.dpad .up { grid-area: up; }
.dpad .left { grid-area: left; }
.dpad .select { grid-area: select; }
.dpad .right { grid-area: right; }
.dpad .down { grid-area: down; }
.dpad .up span::before,
.dpad .left span::before,
.dpad .right span::before,
.dpad .down span::before {
  width: 0.68rem;
  height: 0.68rem;
  border-top: 1.5px solid currentColor;
  border-left: 1.5px solid currentColor;
  content: "";
}
.dpad .up span::before { transform: translateY(0.15rem) rotate(45deg); }
.dpad .left span::before { transform: translateX(0.15rem) rotate(-45deg); }
.dpad .right span::before { transform: translateX(-0.15rem) rotate(135deg); }
.dpad .down span::before { transform: translateY(-0.15rem) rotate(225deg); }
.dpad .select span {
  width: 4.1rem;
  height: 4.1rem;
  margin: auto;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 50%;
  background: #20252e;
  box-shadow: inset 0 1px rgb(255 255 255 / 6%);
}

.dpad button:not(:disabled).is-pressed span,
.dpad button:not(:disabled):active span {
  background-color: rgb(255 255 255 / 5%);
  color: #fff;
}
.dpad button:not(:disabled):active { transform: scale(0.96); }
.dpad .select:not(:disabled).is-pressed span,
.dpad .select:not(:disabled):active span { background: #e8ebf0; }

.precision-pad {
  position: relative;
  display: grid;
  width: min(81vw, 39dvh, 19rem);
  aspect-ratio: 1;
  margin: 0 auto;
  place-content: center;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 9%);
  border-radius: 50%;
  outline: 0;
  background: radial-gradient(circle, #1c2129, #151920 72%);
  color: #eaf2ff;
  text-align: center;
  touch-action: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
.precision-pad * {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
.precision-pad[hidden] { display: none; }
.precision-pad::after {
  position: absolute;
  inset: 18%;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 50%;
  content: "";
  pointer-events: none;
}
.precision-pad::before {
  position: absolute;
  width: 68%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(148 163 184 / 12%), transparent 68%);
  content: "";
  opacity: 0.55;
  pointer-events: none;
  transition: opacity 140ms ease, transform 180ms ease;
}
.precision-pad.is-tracking { border-color: rgb(167 191 229 / 48%); }
.precision-pad.is-tracking::before { opacity: 0.88; transform: scale(1.16); }
.precision-pad.has-snap {
  border-color: rgb(175 204 226 / 48%);
  box-shadow: inset 0 0 0 1px rgb(175 204 226 / 8%);
}
.precision-pad.has-snap::before { background: radial-gradient(circle, rgb(148 184 216 / 18%), transparent 68%); }
.precision-status {
  position: absolute;
  z-index: 3;
  bottom: 0.9rem;
  left: 50%;
  display: grid;
  width: 0.9rem;
  height: 0.9rem;
  padding: 0;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 999px;
  background: rgb(4 17 30 / 82%);
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 0.25rem);
  transition: opacity 120ms ease, transform 120ms ease;
}
.precision-status i {
  width: 0.38rem;
  height: 0.38rem;
  border-radius: 50%;
  background: #dbe5ef;
}
.precision-pad.has-snap .precision-status { opacity: 1; transform: translate(-50%, 0); }

.playback-controls,
.volume-controls {
  display: grid;
  overflow: hidden;
  flex: 0 0 auto;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 999px;
  background: rgb(255 255 255 / 8%);
}
.playback-controls { margin-bottom: 0.45rem; }
.volume-controls { margin-bottom: 0.55rem; }
.playback-controls button,
.volume-controls button {
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 0;
  background: #171b22;
  color: #b9c1cd;
  font: inherit;
  font-size: 1rem;
  font-weight: 750;
}
.playback-controls button { min-height: 2.85rem; }
.volume-controls button { min-height: 2.35rem; }
.playback-controls button.media-primary {
  background: #e8ebef;
  color: #11141a;
}
.playback-controls button:not(:disabled).is-pressed,
.playback-controls button:not(:disabled):active,
.volume-controls button:not(:disabled).is-pressed,
.volume-controls button:not(:disabled):active { background: #262c35; }
.playback-controls button.media-primary:not(:disabled).is-pressed,
.playback-controls button.media-primary:not(:disabled):active { background: #fff; }
.playback-controls span,
.volume-controls span { display: inline-flex; align-items: center; gap: 0.08rem; }
.transport-icon { width: 1.2rem; height: 1.2rem; fill: currentColor; }
.mute-icon { width: 1.15rem; height: 1.15rem; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.6; }
.play-pause-icon { width: 1.65rem; height: 1.2rem; fill: currentColor; }
.play-shape { opacity: 1; }
.pause-shape { opacity: 0.88; }

.remote-utilities {
  display: flex;
  min-height: 2.85rem;
  margin-bottom: 0;
  align-items: center;
  justify-content: center;
  gap: 1.1rem;
}
.utility-button {
  display: grid;
  width: 2.75rem;
  height: 2.75rem;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #8f98a6;
}
.utility-button svg {
  width: 1.18rem;
  height: 1.18rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}
.utility-button:not(:disabled):active { background: #1c2129; color: #fff; transform: scale(0.94); }
.control-mode .arrows-icon { display: none; }
.control-mode.is-precision .pointer-icon { display: none; }
.control-mode.is-precision .arrows-icon { display: block; }

.quick-launch-panel {
  min-height: 0;
  padding: 0.75rem;
  flex: 1 1 auto;
  overflow-y: auto;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 1.15rem;
  background: #141820;
}
.quick-launch-panel[hidden] { display: none; }
.quick-launch-heading {
  display: flex;
  margin-bottom: 0.7rem;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.quick-launch-heading div { display: grid; gap: 0.08rem; }
.quick-launch-heading small {
  color: #7f8998;
  font-size: 0.56rem;
  font-weight: 900;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}
.quick-launch-heading strong { font-size: 0.88rem; }
.quick-launch-heading button {
  width: 2.35rem;
  height: 2.35rem;
  border: 0;
  border-radius: 50%;
  background: #1d222b;
  color: #d8d5e5;
  font: inherit;
  font-size: 1.15rem;
}
.quick-launch-list { display: grid; gap: 0.5rem; }
.quick-app {
  display: grid;
  min-height: 3.45rem;
  padding: 0.55rem 0.7rem;
  grid-template-columns: 2.25rem 1fr auto;
  align-items: center;
  gap: 0.65rem;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 0.85rem;
  background: #1a1f27;
  color: #f8fafc;
  font: inherit;
  text-align: left;
}
.quick-app > span {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  place-items: center;
  border-radius: 0.7rem;
  background: #2a303b;
  font-size: 0.8rem;
  font-weight: 950;
}
.quick-app strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.quick-app small { color: #9aa8bb; font-size: 0.6rem; font-weight: 850; }
.quick-app:active { transform: scale(0.98); filter: brightness(1.2); }
#quick-launch-empty { margin: 1.1rem 0; color: #8e9bad; font-size: 0.7rem; line-height: 1.45; text-align: center; }

button:disabled { opacity: 0.3; }

.search-panel {
  margin-top: 0.65rem;
  padding: 0.8rem;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 1.15rem;
  background: #141820;
}
.search-panel[hidden] { display: none; }
.search-panel label { display: block; margin-bottom: 0.55rem; color: #d9dde5; font-size: 0.74rem; font-weight: 750; }
.search-panel > div { display: grid; grid-template-columns: 1fr auto; gap: 0.55rem; }
.search-panel input {
  min-width: 0;
  min-height: 3rem;
  padding: 0 0.85rem;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 0.8rem;
  outline: none;
  background: #0d1016;
  color: #fff;
  font: inherit;
  font-size: 1rem;
}
.search-panel input:focus { border-color: #8996aa; box-shadow: 0 0 0 0.16rem rgb(148 163 184 / 10%); }
.search-panel button {
  min-width: 4rem;
  border: 0;
  border-radius: 0.8rem;
  background: #e8ebef;
  color: #11141a;
  font: inherit;
  font-weight: 900;
}
.search-panel p { margin: 0.55rem 0 0; color: #7d899d; font-size: 0.67rem; line-height: 1.4; }

body.is-typing .control-surface,
body.is-typing .control-mode,
body.is-typing .quick-launch-toggle,
body.is-typing .playback-controls,
body.is-typing .volume-controls { display: none; }
body.is-typing .remote-card { justify-content: flex-start; }
body.is-typing .remote-utilities { display: none; }
body.is-launching .control-surface,
body.is-launching .playback-controls,
body.is-launching .control-mode,
body.is-launching .search-toggle,
body.is-launching .volume-controls { display: none; }
body.is-launching .remote-utilities { display: none; }

.confirmed { animation: confirmed 220ms ease-out; }
@keyframes confirmed { 50% { filter: brightness(1.4); } }

.privacy-note { display: flex; margin: 0.45rem 0 0; flex: 0 0 auto; align-items: center; justify-content: center; gap: 0.32rem; color: #6f7784; font-size: 0.58rem; text-align: center; }
.privacy-note span { width: 0.32rem; height: 0.32rem; border-radius: 50%; background: #75b486; }
body:not(.is-connected) .privacy-note { display: none; }
.footnote { margin: 0.5rem 0 0; color: #616a77; font-size: 0.58rem; text-align: center; }
body.is-connected .footnote { display: none; }

@media (max-height: 700px) {
  .remote-card { padding: 0.75rem; }
  .remote-icon-button { width: 2.8rem; height: 2.8rem; }
  .dpad,
  .precision-pad { width: min(78vw, 31dvh, 15rem); }
  .remote-utilities { min-height: 2.5rem; }
  .utility-button { width: 2.45rem; height: 2.45rem; }
  .playback-controls button { min-height: 2.65rem; }
  .volume-controls button { min-height: 2.35rem; }
  .privacy-note { margin-top: 0.5rem; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: 0.01ms !important; }
}
`;

export const REMOTE_JS = `(() => {
  const state = document.querySelector("#connection-state");
  const buttons = Array.from(document.querySelectorAll("button[data-action]"));
  const searchToggle = document.querySelector("#search-toggle");
  const searchPanel = document.querySelector("#search-panel");
  const searchQuery = document.querySelector("#search-query");
  const searchSubmit = document.querySelector("#search-submit");
  const dpad = document.querySelector(".dpad");
  const precisionPad = document.querySelector("#precision-pad");
  const controlMode = document.querySelector("#control-mode");
  const quickLaunchToggle = document.querySelector("#quick-launch-toggle");
  const quickLaunchPanel = document.querySelector("#quick-launch-panel");
  const quickLaunchClose = document.querySelector("#quick-launch-close");
  const quickLaunchList = document.querySelector("#quick-launch-list");
  const quickLaunchEmpty = document.querySelector("#quick-launch-empty");
  const searchLabel = document.querySelector("#search-label");
  const remoteModeLabel = document.querySelector("#remote-mode-label");
  let controllerToken = sessionStorage.getItem("nhd-controller-token");
  let requestId = null;
  let pointerGesture = null;
  let pendingPointer = null;
  let pointerFlushTimer = null;
  let pointerRequestInFlight = false;
  let lastPointerSentAt = 0;
  let virtualPointer = { x: 0.5, y: 0.5 };
  let precisionTextEntryAvailable = false;
  let directTextEntry = false;
  let directTextEntryReady = false;
  let pendingDirectText = null;
  let textEntryTimer = null;
  let backHoldTimer = null;
  let backHoldTriggered = false;
  const POINTER_INTERVAL_MS = 32;
  const TEXT_ENTRY_DEBOUNCE_MS = 120;
  const precisionRelativeDelta = (${precisionRelativeDelta.toString()});
  const movePrecisionPoint = (${movePrecisionPoint.toString()});
  const edgeScroll = (${precisionEdgeScroll.toString()});
  const horizontalScroll = (${precisionHorizontalScroll.toString()});
  const createTextPump = (${createLatestRemoteTextPump.toString()});

  for (const gestureEvent of ["gesturestart", "gesturechange"]) {
    document.addEventListener(gestureEvent, (event) => event.preventDefault(), { passive: false });
  }
  document.addEventListener("selectstart", (event) => {
    if (!(event.target instanceof Element) || event.target.closest("input") === null) {
      event.preventDefault();
    }
  });
  document.addEventListener("wheel", (event) => {
    if (event.ctrlKey) event.preventDefault();
  }, { passive: false });

  function setState(message, kind) {
    const dot = document.createElement("span");
    dot.setAttribute("aria-hidden", "true");
    state.replaceChildren(dot, document.createTextNode(message));
    state.className = kind || "";
  }

  function setEnabled(enabled) {
    document.body.classList.toggle("is-connected", enabled);
    buttons.forEach((button) => { button.disabled = !enabled; });
    searchToggle.disabled = !enabled;
    searchSubmit.disabled = !enabled;
    controlMode.disabled = !enabled;
    quickLaunchToggle.disabled = !enabled;
    if (!enabled) {
      resetTextEntry();
      closeQuickLaunch();
    }
  }

  function confirmCommand(button) {
    button.classList.remove("confirmed");
    void button.offsetWidth;
    button.classList.add("confirmed");
    setTimeout(() => button.classList.remove("confirmed"), 240);
    if (navigator.vibrate) navigator.vibrate(10);
  }

  async function jsonRequest(path, options) {
    const response = await fetch(path, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || "Remote request failed");
      error.status = response.status;
      throw error;
    }
    return body;
  }

  async function pollDecision() {
    if (!requestId) return;

    try {
      const result = await jsonRequest("/api/pair/" + encodeURIComponent(requestId));
      if (result.state === "approved") {
        controllerToken = result.token;
        sessionStorage.setItem("nhd-controller-token", controllerToken);
        history.replaceState(null, "", location.pathname);
        setEnabled(true);
        setState("Connected", "connected");
        void sendHeartbeat();
        return;
      }
      if (result.state === "denied" || result.state === "expired" || result.state === "unknown") {
        throw new Error(result.state === "denied" ? "Pairing was denied on the TV" : "Pairing expired — rescan the QR code");
      }
      setTimeout(pollDecision, 900);
    } catch (error) {
      setState(error instanceof Error ? error.message : String(error), "error");
    }
  }

  async function beginPairing() {
    if (controllerToken) {
      setEnabled(true);
      setState("Connected", "connected");
      void sendHeartbeat();
      return;
    }

    const token = location.hash.slice(1);
    if (!token) {
      setState("Scan the current TV code", "error");
      return;
    }

    try {
      const result = await jsonRequest("/api/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      requestId = result.requestId;
      history.replaceState(null, "", location.pathname);
      setState("Approve on your TV");
      setTimeout(pollDecision, 500);
    } catch (error) {
      setState(error instanceof Error ? error.message : String(error), "error");
    }
  }

  function disconnectRemote() {
    if (!controllerToken) return;
    const token = controllerToken;
    controllerToken = null;
    sessionStorage.removeItem("nhd-controller-token");
    void fetch("/api/disconnect", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: "{}",
      keepalive: true
    });
  }

  function showNavigationMode() {
    remoteModeLabel.textContent = dpad.hidden ? "Pointer" : "Navigate";
  }

  function resetTextEntry() {
    directTextEntry = false;
    directTextEntryReady = false;
    pendingDirectText = null;
    if (textEntryTimer !== null) {
      clearTimeout(textEntryTimer);
      textEntryTimer = null;
    }
    searchQuery.value = "";
    searchQuery.blur();
    searchLabel.textContent = "Search your services";
    searchQuery.placeholder = "Title, person, or topic";
    searchPanel.hidden = true;
    document.body.classList.remove("is-typing");
    showNavigationMode();
  }

  function closeQuickLaunch() {
    quickLaunchPanel.hidden = true;
    document.body.classList.remove("is-launching");
    showNavigationMode();
  }

  function renderRecentApps(services) {
    quickLaunchList.replaceChildren();
    const safeServices = Array.isArray(services)
      ? services.filter((service) =>
        service && typeof service.id === "string" && typeof service.name === "string"
      ).slice(0, 3)
      : [];
    quickLaunchEmpty.hidden = safeServices.length > 0;

    for (const service of safeServices) {
      const button = document.createElement("button");
      const mark = document.createElement("span");
      const name = document.createElement("strong");
      const action = document.createElement("small");
      button.type = "button";
      button.className = "quick-app";
      button.setAttribute("aria-label", "Open " + service.name);
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = service.name.slice(0, 1).toUpperCase();
      name.textContent = service.name;
      action.textContent = "Open";
      button.append(mark, name, action);
      button.addEventListener("click", () => void launchRecentApp(service, button));
      quickLaunchList.append(button);
    }
  }

  async function openQuickLaunch() {
    if (!controllerToken) return;
    resetTextEntry();
    quickLaunchPanel.hidden = false;
    quickLaunchEmpty.hidden = false;
    quickLaunchEmpty.textContent = "Loading recent apps…";
    document.body.classList.add("is-launching");
    remoteModeLabel.textContent = "Recent apps";

    try {
      const result = await jsonRequest("/api/apps", {
        headers: { "Authorization": "Bearer " + controllerToken }
      });
      quickLaunchEmpty.textContent = "Open an app on NHD-TV and it will appear here.";
      renderRecentApps(result.services);
    } catch (error) {
      if (error && error.status === 401) {
        controllerToken = null;
        sessionStorage.removeItem("nhd-controller-token");
        setEnabled(false);
      }
      quickLaunchEmpty.textContent = error instanceof Error ? error.message : "Recent apps unavailable";
      setState(quickLaunchEmpty.textContent, "error");
    }
  }

  async function launchRecentApp(service, button) {
    if (!controllerToken) return;
    button.disabled = true;
    try {
      await jsonRequest("/api/launch", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + controllerToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ serviceId: service.id })
      });
      confirmCommand(button);
      closeQuickLaunch();
      setState(service.name + " opened", "connected");
    } catch (error) {
      button.disabled = false;
      setState(error instanceof Error ? error.message : "App launch failed", "error");
    }
  }

  async function sendAction(action, button) {
    if (document.body.classList.contains("is-typing")) {
      resetTextEntry();
      if (action === "back") {
        confirmCommand(button);
        return;
      }
    }
    if (document.body.classList.contains("is-launching")) {
      closeQuickLaunch();
      if (action === "back") {
        confirmCommand(button);
        return;
      }
    }
    if (!controllerToken) return;

    try {
      const result = await jsonRequest("/api/command", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + controllerToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action })
      });
      if (result.handled !== false) confirmCommand(button);
      const feedback = result.detail || button.dataset.feedback;
      if (feedback) setState(feedback, result.handled === false ? "error" : "connected");
    } catch (error) {
      if (error && error.status === 401) {
        controllerToken = null;
        sessionStorage.removeItem("nhd-controller-token");
        setEnabled(false);
      }
      setState(error instanceof Error ? error.message : "Remote disconnected", "error");
    }
  }

  async function sendHeartbeat() {
    if (!controllerToken) return;
    try {
      await jsonRequest("/api/heartbeat", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + controllerToken,
          "Content-Type": "application/json"
        },
        body: "{}"
      });
    } catch (error) {
      controllerToken = null;
      sessionStorage.removeItem("nhd-controller-token");
      setEnabled(false);
      setState(error instanceof Error ? error.message : "Remote disconnected", "error");
    }
  }

  async function sendSearch(query) {
    if (!controllerToken) return;

    try {
      await jsonRequest("/api/search", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + controllerToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query })
      });
      resetTextEntry();
      confirmCommand(searchToggle);
      setState("Search ready on TV", "connected");
    } catch (error) {
      setState(error instanceof Error ? error.message : "Search failed", "error");
    }
  }

  async function sendRemoteText(text, submit) {
    if (!controllerToken) {
      const error = new Error("Remote disconnected — rescan the TV code");
      setState(error.message, "error");
      throw error;
    }

    try {
      await jsonRequest("/api/text", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + controllerToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ submit, text })
      });
      setState(submit ? "Search sent to TV" : "Typing on TV", "connected");
      if (submit) {
        resetTextEntry();
        confirmCommand(searchToggle);
      }
    } catch (error) {
      setState(error instanceof Error ? error.message : "Text entry failed", "error");
      throw error;
    }
  }

  const textPump = createTextPump(sendRemoteText, () => {
    resetTextEntry();
  });

  function usePrecisionMode(enabled) {
    dpad.hidden = enabled;
    precisionPad.hidden = !enabled;
    if (enabled) {
      if (controllerToken) {
        queuePointer(pointerInput(virtualPointer, "move", 0), true);
      }
    } else {
      pointerGesture = null;
      precisionTextEntryAvailable = false;
      precisionPad.dataset.textEntryAvailable = "false";
      precisionPad.classList.remove("has-snap", "is-tracking");
      if (controllerToken) {
        queuePointer({ phase: "hide", scroll: 0, scrollX: 0, x: 0.5, y: 0.5 }, true);
      }
    }
    controlMode.classList.toggle("is-precision", enabled);
    controlMode.setAttribute("aria-label", enabled ? "Use arrow buttons" : "Use precision pointer");
    showNavigationMode();
  }

  async function flushPointer() {
    pointerFlushTimer = null;
    if (pointerRequestInFlight || !pendingPointer || !controllerToken) return;
    const input = pendingPointer;
    pendingPointer = null;
    pointerRequestInFlight = true;
    lastPointerSentAt = performance.now();
    try {
      const result = await jsonRequest("/api/pointer", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + controllerToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(input)
      });
      if (result.throttled !== true) {
        precisionTextEntryAvailable = result.textEntryAvailable === true;
        precisionPad.dataset.textEntryAvailable = String(precisionTextEntryAvailable);
        precisionPad.classList.toggle("has-snap", result.snapped === true);
        if (input.phase === "tap") {
          if (precisionTextEntryAvailable) {
            if (!directTextEntry) openProviderKeyboard();
            confirmProviderKeyboard();
          } else {
            rejectProviderKeyboard();
          }
        }
      }
      if (result.snapChanged && navigator.vibrate) navigator.vibrate(7);
    } catch (error) {
      controllerToken = null;
      sessionStorage.removeItem("nhd-controller-token");
      setEnabled(false);
      pointerGesture = null;
      precisionTextEntryAvailable = false;
      precisionPad.classList.remove("has-snap", "is-tracking");
      rejectProviderKeyboard();
      setState(error instanceof Error ? error.message : "Remote disconnected", "error");
    } finally {
      pointerRequestInFlight = false;
      if (pendingPointer) queuePointer(pendingPointer);
    }
  }

  function queuePointer(input, immediate) {
    pendingPointer = input;
    if (immediate && pointerFlushTimer !== null) {
      clearTimeout(pointerFlushTimer);
      pointerFlushTimer = null;
    }
    if (pointerRequestInFlight || pointerFlushTimer !== null) return;
    const elapsed = performance.now() - lastPointerSentAt;
    const wait = immediate ? 0 : Math.max(0, POINTER_INTERVAL_MS - elapsed);
    pointerFlushTimer = setTimeout(flushPointer, wait);
  }

  function moveVirtualPointer(deltaX, deltaY) {
    const rect = precisionPad.getBoundingClientRect();
    virtualPointer = movePrecisionPoint(
      virtualPointer,
      deltaX,
      deltaY,
      rect.width,
      rect.height
    );
    return virtualPointer;
  }

  function pointerInput(point, phase, scroll, scrollX) {
    return { phase, scroll: scroll || 0, scrollX: scrollX || 0, x: point.x, y: point.y };
  }

  function openProviderKeyboard() {
    if (!directTextEntry) searchQuery.value = "";
    directTextEntry = true;
    directTextEntryReady = false;
    pendingDirectText = null;
    searchLabel.textContent = "Connecting to the TV text box…";
    searchQuery.placeholder = "Type in the selected search box";
    searchPanel.hidden = false;
    document.body.classList.add("is-typing");
    remoteModeLabel.textContent = "Typing";
    searchQuery.focus();
    searchPanel.scrollIntoView({ block: "nearest" });
    setTimeout(() => searchPanel.scrollIntoView({ block: "nearest" }), 180);
  }

  function confirmProviderKeyboard() {
    if (!directTextEntry) return;
    directTextEntryReady = true;
    searchLabel.textContent = "Type on your TV";
    const pending = pendingDirectText;
    pendingDirectText = null;
    if (pending !== null) {
      if (pending.submit) {
        directTextEntry = false;
        directTextEntryReady = false;
      }
      textPump.enqueue(pending.text, pending.submit);
    }
  }

  function rejectProviderKeyboard() {
    if (!directTextEntry) return;
    resetTextEntry();
    setState("That TV text box is not available", "error");
  }

  function queueDirectText(text, submit) {
    if (!directTextEntryReady) {
      pendingDirectText = { submit, text };
      return;
    }
    if (submit) {
      directTextEntry = false;
      directTextEntryReady = false;
    }
    textPump.enqueue(text, submit);
  }

  function scheduleDirectText() {
    pendingDirectText = { submit: false, text: searchQuery.value };
    if (!directTextEntryReady) return;
    if (textEntryTimer !== null) clearTimeout(textEntryTimer);
    textEntryTimer = setTimeout(() => {
      textEntryTimer = null;
      const pending = pendingDirectText;
      pendingDirectText = null;
      if (pending !== null) textPump.enqueue(pending.text, pending.submit);
    }, TEXT_ENTRY_DEBOUNCE_MS);
  }

  function latestPointerEvent(event) {
    const coalesced = typeof event.getCoalescedEvents === "function"
      ? event.getCoalescedEvents()
      : [];
    return coalesced.length > 0 ? coalesced[coalesced.length - 1] : event;
  }

  controlMode.addEventListener("click", () => usePrecisionMode(!dpad.hidden));

  precisionPad.addEventListener("pointerdown", (event) => {
    if (pointerGesture !== null || event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    event.preventDefault();
    pointerGesture = {
      id: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      startedAt: performance.now(),
      totalDistance: 0
    };
    precisionPad.setPointerCapture(event.pointerId);
    precisionPad.classList.add("is-tracking");
  });
  precisionPad.addEventListener("pointermove", (event) => {
    if (!pointerGesture || pointerGesture.id !== event.pointerId) return;
    event.preventDefault();
    const currentEvent = latestPointerEvent(event);
    const horizontalDelta = currentEvent.clientX - pointerGesture.lastX;
    const verticalDelta = currentEvent.clientY - pointerGesture.lastY;
    pointerGesture.totalDistance += Math.hypot(horizontalDelta, verticalDelta);
    const point = moveVirtualPointer(horizontalDelta, verticalDelta);
    const scroll = pointerGesture.totalDistance >= 8
      ? edgeScroll(point.y, verticalDelta)
      : 0;
    const scrollX = pointerGesture.totalDistance >= 8
      ? horizontalScroll(horizontalDelta, verticalDelta)
      : 0;
    pointerGesture.lastX = currentEvent.clientX;
    pointerGesture.lastY = currentEvent.clientY;
    queuePointer(pointerInput(point, "move", scroll, scrollX), false);
  });
  precisionPad.addEventListener("pointercancel", () => {
    pointerGesture = null;
    precisionPad.classList.remove("is-tracking");
  });
  precisionPad.addEventListener("pointerup", (event) => {
    if (!pointerGesture || pointerGesture.id !== event.pointerId) return;
    event.preventDefault();
    const horizontalDelta = event.clientX - pointerGesture.lastX;
    const verticalDelta = event.clientY - pointerGesture.lastY;
    const finalDistance = Math.hypot(horizontalDelta, verticalDelta);
    pointerGesture.totalDistance += finalDistance;
    const elapsed = performance.now() - pointerGesture.startedAt;
    const phase = pointerGesture.totalDistance < 18 && elapsed < 650 ? "tap" : "move";
    const point = phase === "tap" || finalDistance < 0.45
      ? virtualPointer
      : moveVirtualPointer(horizontalDelta, verticalDelta);
    pointerGesture = null;
    precisionPad.classList.remove("is-tracking");
    if (phase === "tap" && precisionTextEntryAvailable) openProviderKeyboard();
    queuePointer(pointerInput(point, phase, 0), true);
  });
  precisionPad.addEventListener("keydown", (event) => {
    const actions = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Enter: "select", " ": "select" };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    void sendAction(action, precisionPad);
  });

  searchToggle.addEventListener("click", () => {
    if (searchToggle.disabled) return;
    if (!searchPanel.hidden) {
      resetTextEntry();
      return;
    }
    closeQuickLaunch();
    resetTextEntry();
    searchLabel.textContent = "Search your services";
    searchQuery.placeholder = "Title, person, or topic";
    searchPanel.hidden = false;
    document.body.classList.add("is-typing");
    remoteModeLabel.textContent = "Search";
    searchQuery.focus();
    searchPanel.scrollIntoView({ block: "nearest" });
  });

  quickLaunchToggle.addEventListener("click", () => {
    if (quickLaunchToggle.disabled) return;
    if (!quickLaunchPanel.hidden) {
      closeQuickLaunch();
      return;
    }
    void openQuickLaunch();
  });
  quickLaunchClose.addEventListener("click", closeQuickLaunch);

  searchPanel.addEventListener("submit", (event) => {
    event.preventDefault();
    if (textEntryTimer !== null) {
      clearTimeout(textEntryTimer);
      textEntryTimer = null;
    }
    if (directTextEntry) {
      pendingDirectText = null;
      queueDirectText(searchQuery.value, true);
      return;
    }
    const query = searchQuery.value.replace(/\\s+/g, " ").trim();
    if (query.length > 0 && query.length <= 120) void sendSearch(query);
  });

  searchQuery.addEventListener("input", (event) => {
    if (!directTextEntry || event.isComposing) return;
    scheduleDirectText();
  });
  searchQuery.addEventListener("compositionend", () => {
    if (directTextEntry) scheduleDirectText();
  });

  buttons.forEach((button) => {
    const release = () => {
      button.classList.remove("is-pressed");
      if (button.dataset.action === "back" && backHoldTimer !== null) {
        clearTimeout(backHoldTimer);
        backHoldTimer = null;
      }
    };
    button.addEventListener("pointerdown", () => {
      button.classList.add("is-pressed");
      if (button.dataset.action === "back") {
        backHoldTriggered = false;
        if (backHoldTimer !== null) clearTimeout(backHoldTimer);
        backHoldTimer = setTimeout(() => {
          backHoldTimer = null;
          backHoldTriggered = true;
          if (navigator.vibrate) navigator.vibrate(24);
          void sendAction("force-home", button);
        }, 1_200);
      }
    });
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
    button.addEventListener("click", () => {
      if (button.dataset.action === "back" && backHoldTriggered) {
        backHoldTriggered = false;
        return;
      }
      void sendAction(button.dataset.action, button);
    });
  });

  setEnabled(false);
  usePrecisionMode(false);
  window.addEventListener("pagehide", disconnectRemote);
  setInterval(() => void sendHeartbeat(), 10_000);
  beginPairing();
})();`;
