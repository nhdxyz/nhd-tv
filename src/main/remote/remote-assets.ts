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
          <strong class="brand-wordmark">NHD<span>/</span>TV</strong>
          <small>Remote</small>
        </div>
        <p id="connection-state" role="status"><span aria-hidden="true"></span>Requesting approval</p>
      </header>

      <section class="remote-card" aria-label="Television remote">
        <div class="remote-context" aria-live="polite">
          <span>Controlling</span>
          <strong id="active-service-label">NHD Home</strong>
          <small id="remote-mode-label">Navigate</small>
        </div>

        <div class="remote-top-actions" aria-label="System controls">
          <button class="remote-icon-button" data-action="back" type="button" disabled aria-label="Back. Hold to force return Home">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button class="remote-icon-button" data-action="home" type="button" disabled aria-label="NHD Home">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10.5 8-6.5 8 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" /><path d="M9.5 20v-6h5v6" /></svg>
          </button>
        </div>

        <section class="voice-confirm" id="voice-confirm" aria-live="polite" hidden>
          <small>Confirm voice command</small>
          <strong id="voice-confirm-copy">Play this title?</strong>
          <div>
            <button id="voice-confirm-cancel" type="button">Cancel</button>
            <button id="voice-confirm-play" type="button">Play</button>
          </div>
        </section>

        <div class="control-surface">
          <div class="dpad" aria-label="Directional pad">
            <button class="up" data-action="up" data-repeat="true" type="button" disabled aria-label="Up"><span aria-hidden="true"></span></button>
            <button class="left" data-action="left" data-repeat="true" type="button" disabled aria-label="Left"><span aria-hidden="true"></span></button>
            <button class="select" data-action="select" type="button" disabled aria-label="Select"><span aria-hidden="true"></span></button>
            <button class="right" data-action="right" data-repeat="true" type="button" disabled aria-label="Right"><span aria-hidden="true"></span></button>
            <button class="down" data-action="down" data-repeat="true" type="button" disabled aria-label="Down"><span aria-hidden="true"></span></button>
          </div>

          <div class="precision-pad" id="precision-pad" role="button" tabindex="0" aria-label="Swipe anywhere to move the cursor, lift and continue, or tap to select" hidden>
            <span class="precision-status" aria-hidden="true"><i></i></span>
          </div>
        </div>

        <section class="voice-control" aria-label="AI voice control">
          <button class="voice-button" id="voice-button" type="button" disabled aria-label="Hold to speak a voice command" aria-describedby="voice-help">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.2" y="3" width="7.6" height="12" rx="3.8" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-3 0h6" /></svg>
            <span id="voice-button-copy">Hold to talk</span>
            <small>Ask NHD-TV</small>
          </button>
          <p class="voice-help" id="voice-help">Voice requires the secure Tailscale remote.</p>
        </section>

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
            <span id="control-mode-copy">Pointer</span>
          </button>
          <button class="search-toggle utility-button" id="search-toggle" type="button" disabled aria-label="Search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.5 15.5 4 4" /></svg>
            <span id="search-toggle-copy">Search</span>
          </button>
        </div>

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
  --accent: #d7ff55;
  --accent-ink: #11120e;
  --panel: #171716;
  --panel-raised: #222220;
  --touch-target: 3rem;
  color: #f2f2ee;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color-scheme: dark;
  -webkit-font-smoothing: antialiased;
}

* { box-sizing: border-box; }

body {
  height: 100dvh;
  min-height: 100dvh;
  margin: 0;
  padding: max(0.7rem, env(safe-area-inset-top)) 0.8rem max(0.75rem, env(safe-area-inset-bottom));
  overflow: hidden;
  background: #090909;
  background: radial-gradient(circle at 50% -12%, #25251f 0, #11110f 28%, #090909 58%);
}

body::before {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  height: 0.18rem;
  background: var(--accent);
  content: "";
  opacity: 0.9;
}

body[data-active-service="youtube"] {
  --accent: #ff2642;
  --accent-ink: #fff;
}

body[data-active-service="netflix"] {
  --accent: #e50914;
  --accent-ink: #fff;
}

body[data-active-service="disney-plus"] {
  --accent: #88a6ff;
  --accent-ink: #071023;
}

body[data-active-service="spotify"] {
  --accent: #1ed760;
  --accent-ink: #07140b;
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
  width: min(100%, 24rem);
  height: 100%;
  min-height: 0;
  margin: 0 auto;
  flex-direction: column;
}

.remote-header {
  display: flex;
  min-height: 2.55rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.brand { display: flex; align-items: baseline; gap: 0.45rem; color: #f1f1ed; }
.brand-wordmark {
  font-size: 0.82rem;
  font-weight: 950;
  letter-spacing: -0.035em;
}
.brand-wordmark span { color: var(--accent); }
.brand small {
  color: #777773;
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

#connection-state {
  display: flex;
  min-width: 0;
  max-width: 58%;
  margin: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 0.38rem;
  color: #d8b56c;
  font-size: 0.66rem;
  font-weight: 700;
  line-height: 1.2;
  text-align: right;
}
#connection-state span {
  width: 0.46rem;
  height: 0.46rem;
  border-radius: 50%;
  background: currentColor;
}
#connection-state.connected { color: #9bd8a8; }
#connection-state.error { color: #fda4af; }

.remote-card {
  position: relative;
  display: flex;
  min-height: 0;
  margin-top: 0.45rem;
  padding: 0.78rem;
  flex: 1;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid #30302d;
  border-radius: 1.8rem;
  background: rgb(21 21 20 / 96%);
  box-shadow: inset 0 1px rgb(255 255 255 / 4%), 0 1.4rem 3.2rem rgb(0 0 0 / 44%);
}

.remote-context {
  display: grid;
  min-height: 3.2rem;
  padding: 0.42rem 0.55rem 0.52rem;
  grid-template-columns: 1fr auto;
  align-items: center;
  column-gap: 0.8rem;
  border-bottom: 1px solid #2b2b29;
}
.remote-context > span {
  grid-column: 1;
  color: #74746f;
  font-size: 0.5rem;
  font-weight: 850;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.remote-context > strong {
  grid-column: 1;
  overflow: hidden;
  color: #f2f2ee;
  font-size: 0.98rem;
  font-weight: 760;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.remote-context > small {
  grid-column: 2;
  grid-row: 1 / span 2;
  display: flex;
  padding: 0;
  align-items: center;
  gap: 0.35rem;
  color: var(--accent);
  font-size: 0.52rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.remote-context > small::before {
  width: 0.38rem;
  height: 0.38rem;
  border-radius: 50%;
  background: currentColor;
  content: "";
}

.remote-top-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  min-height: 3.4rem;
  padding: 0 0.15rem;
  justify-content: space-between;
}
.remote-icon-button {
  display: grid;
  width: var(--touch-target);
  height: var(--touch-target);
  place-items: center;
  border-radius: 999px;
  border: 1px solid #30302d;
  background: #1e1e1c;
  color: #c9c9c4;
}

.voice-control {
  display: grid;
  flex: 0 0 auto;
  gap: 0.35rem;
  margin-bottom: 0.62rem;
}
.voice-button {
  display: grid;
  width: 100%;
  min-height: 4.5rem;
  padding: 0.72rem 1rem;
  grid-template-columns: 2.55rem 1fr;
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 0.82rem;
  border: 0;
  border-radius: 1.35rem;
  background: var(--accent);
  color: var(--accent-ink);
  box-shadow: 0 0.7rem 1.6rem color-mix(in srgb, var(--accent) 14%, transparent), inset 0 1px rgb(255 255 255 / 20%);
  text-align: left;
  touch-action: none;
}
.voice-button svg {
  grid-column: 1;
  grid-row: 1 / span 2;
  width: 2rem;
  height: 2rem;
  justify-self: center;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.75;
}
.voice-button span {
  align-self: end;
  font-size: 1rem;
  font-weight: 900;
  letter-spacing: -0.02em;
  line-height: 1.1;
}
.voice-button small {
  align-self: start;
  font-size: 0.57rem;
  font-weight: 850;
  letter-spacing: 0.12em;
  opacity: 0.68;
  text-transform: uppercase;
}
.voice-button:not(:disabled):active,
.voice-button.is-recording { transform: scale(0.975); }
.voice-button.is-recording {
  background: #ff465f;
  color: #fff;
  animation: voice-pulse 1s ease-in-out infinite;
}
.voice-button.is-processing { animation: voice-pulse 0.7s ease-in-out infinite; }
.voice-button:disabled { background: #282826; color: #74746f; box-shadow: inset 0 0 0 1px #333330; }
.voice-help {
  min-height: 0.8rem;
  margin: 0;
  overflow: hidden;
  color: #85857e;
  font-size: 0.58rem;
  line-height: 1.25;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.voice-confirm {
  position: absolute;
  z-index: 5;
  right: 0.8rem;
  left: 0.8rem;
  top: 6.9rem;
  display: grid;
  padding: 1rem;
  gap: 0.5rem;
  border: 1px solid color-mix(in srgb, var(--accent) 38%, #30302d);
  border-radius: 1rem;
  background: rgb(25 25 23 / 98%);
  box-shadow: 0 1.2rem 2.5rem rgb(0 0 0 / 62%);
}
.voice-confirm[hidden] { display: none; }
.voice-confirm small { color: var(--accent); font-size: 0.55rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; }
.voice-confirm strong { font-size: 0.9rem; line-height: 1.35; }
.voice-confirm > div { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.voice-confirm button {
  min-height: 3rem;
  border: 1px solid #3b3b37;
  border-radius: 0.7rem;
  background: #242422;
  color: #eee;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 850;
}
#voice-confirm-play { border-color: var(--accent); background: var(--accent); color: var(--accent-ink); }
@keyframes voice-pulse { 50% { box-shadow: 0 0 0 0.4rem rgb(255 70 95 / 13%), 0 0.8rem 1.8rem rgb(255 70 95 / 14%); } }
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
.remote-icon-button:not(:disabled):active {
  border-color: #494945;
  background: #292927;
  transform: scale(0.94);
}

.control-surface {
  display: grid;
  min-height: 0;
  padding: 0.2rem 0 0.55rem;
  flex: 1 1 auto;
  place-items: center;
}
.control-surface > * { grid-area: 1 / 1; }

.dpad {
  position: relative;
  display: grid;
  width: clamp(11rem, 30dvh, 15.75rem);
  aspect-ratio: 1;
  grid-template: repeat(3, 1fr) / repeat(3, 1fr);
  grid-template-areas: ". up ." "left select right" ". down .";
  gap: 0;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid #3a3a36;
  border-radius: 50%;
  background: #20201e;
  box-shadow: inset 0 1px rgb(255 255 255 / 6%), inset 0 -1rem 2rem rgb(0 0 0 / 18%), 0 1rem 2.4rem rgb(0 0 0 / 32%);
}
.dpad[hidden] { display: none; }

.dpad button {
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #a7a7a1;
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
  width: 0.8rem;
  height: 0.8rem;
  border-top: 2px solid currentColor;
  border-left: 2px solid currentColor;
  content: "";
}
.dpad .up span::before { transform: translateY(0.15rem) rotate(45deg); }
.dpad .left span::before { transform: translateX(0.15rem) rotate(-45deg); }
.dpad .right span::before { transform: translateX(-0.15rem) rotate(135deg); }
.dpad .down span::before { transform: translateY(-0.15rem) rotate(225deg); }
.dpad .select span {
  width: 4.45rem;
  height: 4.45rem;
  margin: auto;
  border: 2px solid var(--accent);
  border-radius: 50%;
  background: #111110;
  box-shadow: inset 0 1px rgb(255 255 255 / 8%), 0 0.7rem 1.5rem rgb(0 0 0 / 34%);
}

.dpad button:not(:disabled).is-pressed span,
.dpad button:not(:disabled).is-repeating span,
.dpad button:not(:disabled):active span {
  background-color: rgb(255 255 255 / 9%);
  color: #fff;
}
.dpad button:not(:disabled):active { transform: scale(0.96); }
.dpad .select:not(:disabled).is-pressed span,
.dpad .select:not(:disabled):active span { background: var(--accent); border-color: var(--accent); transform: scale(0.93); }

.precision-pad {
  position: relative;
  display: grid;
  width: clamp(11rem, 30dvh, 15.75rem);
  aspect-ratio: 1;
  margin: 0 auto;
  place-content: center;
  overflow: hidden;
  border: 1px solid #3a3a36;
  border-radius: 50%;
  outline: 0;
  background: #20201e;
  color: #e9e9e4;
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
.precision-pad.is-tracking { border-color: var(--accent); }
.precision-pad.is-tracking::before { opacity: 0.88; transform: scale(1.16); }
.precision-pad.has-snap {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 6%);
}
.precision-pad.has-snap::before { background: radial-gradient(circle, color-mix(in srgb, var(--accent) 18%, transparent), transparent 68%); }
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
  background: #10100f;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 0.25rem);
  transition: opacity 120ms ease, transform 120ms ease;
}
.precision-status i {
  width: 0.38rem;
  height: 0.38rem;
  border-radius: 50%;
  background: var(--accent);
}
.precision-pad.has-snap .precision-status { opacity: 1; transform: translate(-50%, 0); }

.playback-controls,
.volume-controls {
  display: grid;
  overflow: hidden;
  flex: 0 0 auto;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.38rem;
  border: 0;
  border-radius: 0.9rem;
  background: transparent;
}
.playback-controls { margin-bottom: 0.46rem; }
.volume-controls {
  margin-bottom: 0.46rem;
  gap: 0;
  border: 1px solid #30302d;
  background: #1c1c1a;
}
.playback-controls button,
.volume-controls button {
  display: grid;
  place-items: center;
  border: 1px solid #30302d;
  border-radius: 0.82rem;
  background: var(--panel-raised);
  color: #cacac5;
  font: inherit;
  font-size: 1rem;
  font-weight: 750;
}
.playback-controls button { min-height: 3rem; }
.volume-controls button {
  min-height: 2.75rem;
  border-width: 0 1px 0 0;
  border-radius: 0;
  background: transparent;
}
.volume-controls button:last-child { border-right: 0; }
.playback-controls button.media-primary {
  border-color: #deded8;
  background: #deded8;
  color: #111110;
}
.playback-controls button:not(:disabled).is-pressed,
.playback-controls button:not(:disabled):active,
.volume-controls button:not(:disabled).is-pressed,
.volume-controls button:not(:disabled):active { background: #30302d; }
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
  display: grid;
  min-height: 3.15rem;
  margin-bottom: 0;
  align-items: center;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.46rem;
}
.utility-button {
  display: flex;
  width: 100%;
  min-width: 0;
  height: 3.15rem;
  padding: 0 0.55rem;
  align-items: center;
  justify-content: center;
  gap: 0.38rem;
  border: 1px solid #2d2d2a;
  border-radius: 0.78rem;
  background: #1a1a19;
  color: #9f9f99;
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
.utility-button > span {
  overflow: hidden;
  font-size: 0.62rem;
  font-weight: 780;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.utility-button:not(:disabled):active { background: #2a2a27; color: #fff; transform: scale(0.96); }
.control-mode .arrows-icon { display: none; }
.control-mode.is-precision .pointer-icon { display: none; }
.control-mode.is-precision .arrows-icon { display: block; }

button:disabled { opacity: 0.42; }
button:focus-visible,
.precision-pad:focus-visible,
input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.search-panel {
  margin-top: 0.65rem;
  padding: 0.8rem;
  border: 1px solid #30302d;
  border-radius: 0.95rem;
  background: #1a1a18;
}
.search-panel[hidden] { display: none; }
.search-panel label { display: block; margin-bottom: 0.55rem; color: #deded9; font-size: 0.74rem; font-weight: 750; }
.search-panel > div { display: grid; grid-template-columns: 1fr auto; gap: 0.55rem; }
.search-panel input {
  min-width: 0;
  min-height: 3rem;
  padding: 0 0.85rem;
  border: 1px solid #3a3a36;
  border-radius: 0.8rem;
  outline: none;
  background: #111110;
  color: #fff;
  font: inherit;
  font-size: 1rem;
}
.search-panel input:focus { border-color: var(--accent); box-shadow: 0 0 0 0.13rem color-mix(in srgb, var(--accent) 14%, transparent); }
.search-panel button {
  min-width: 4rem;
  border: 0;
  border-radius: 0.8rem;
  background: #deded8;
  color: #111110;
  font: inherit;
  font-weight: 900;
}
.search-panel p { margin: 0.55rem 0 0; color: #808079; font-size: 0.67rem; line-height: 1.4; }

body.is-typing .control-surface,
body.is-typing .control-mode,
body.is-typing .voice-control,
body.is-typing .playback-controls,
body.is-typing .volume-controls { display: none; }
body.is-typing .remote-card { justify-content: flex-start; }
body.is-typing .remote-utilities { display: none; }

.confirmed { animation: confirmed 220ms ease-out; }
.is-repeating { filter: brightness(1.16); }
@keyframes confirmed { 50% { filter: brightness(1.4); } }

.privacy-note { display: flex; margin: 0.42rem 0 0; flex: 0 0 auto; align-items: center; justify-content: center; gap: 0.32rem; color: #70706a; font-size: 0.58rem; text-align: center; }
.privacy-note span { width: 0.32rem; height: 0.32rem; border-radius: 50%; background: #75b486; }
body:not(.is-connected) .privacy-note { display: none; }
.footnote { margin: 0.45rem 0 0; color: #5f5f5a; font-size: 0.58rem; text-align: center; }
body.is-connected .footnote { display: none; }

@media (max-height: 700px) {
  .remote-card { padding: 0.68rem; }
  .remote-context { min-height: 2.85rem; padding-block: 0.38rem; }
  .remote-top-actions { min-height: 3.15rem; }
  .dpad,
  .precision-pad { width: clamp(10.5rem, 27dvh, 13rem); }
  .voice-control { margin-bottom: 0.45rem; }
  .voice-button { min-height: 4.15rem; padding-block: 0.58rem; }
  .remote-utilities { min-height: 3rem; }
  .utility-button { height: 3rem; }
  .playback-controls button { min-height: 2.85rem; }
  .volume-controls button { min-height: 2.75rem; }
  .privacy-note { margin-top: 0.38rem; }
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
  const searchLabel = document.querySelector("#search-label");
  const remoteModeLabel = document.querySelector("#remote-mode-label");
  const activeServiceLabel = document.querySelector("#active-service-label");
  const controlModeCopy = document.querySelector("#control-mode-copy");
  const searchToggleCopy = document.querySelector("#search-toggle-copy");
  const voiceButton = document.querySelector("#voice-button");
  const voiceButtonCopy = document.querySelector("#voice-button-copy");
  const voiceHelp = document.querySelector("#voice-help");
  const voiceConfirm = document.querySelector("#voice-confirm");
  const voiceConfirmCopy = document.querySelector("#voice-confirm-copy");
  const voiceConfirmCancel = document.querySelector("#voice-confirm-cancel");
  const voiceConfirmPlay = document.querySelector("#voice-confirm-play");
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
  let currentSearchLabel = "Search NHD-TV";
  let remoteEnabled = false;
  let voiceAvailable = false;
  let voiceAvailabilityDetail = "Voice control is still checking.";
  let voiceRecorder = null;
  let voiceCommandId = null;
  let voiceStream = null;
  let voiceChunks = [];
  let voiceStartedAt = 0;
  let voiceStopTimer = null;
  let voiceStarting = false;
  let voiceReleaseRequested = false;
  let voiceDiscardRequested = false;
  let voiceProcessing = false;
  let pendingVoiceConfirmation = null;
  const POINTER_INTERVAL_MS = 32;
  const TEXT_ENTRY_DEBOUNCE_MS = 120;
  const DIRECTION_REPEAT_DELAY_MS = 380;
  const DIRECTION_REPEAT_INTERVAL_MS = 115;
  const precisionRelativeDelta = (${precisionRelativeDelta.toString()});
  const movePrecisionPoint = (${movePrecisionPoint.toString()});
  const edgeScroll = (${precisionEdgeScroll.toString()});
  const horizontalScroll = (${precisionHorizontalScroll.toString()});
  const createTextPump = (${createLatestRemoteTextPump.toString()});
  const supportedVoiceMimeType = (() => {
    if (typeof MediaRecorder === "undefined") return null;
    for (const mimeType of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"]) {
      if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
    }
    return null;
  })();

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

  function updateVoiceButton() {
    const browserReady = window.isSecureContext &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function" &&
      supportedVoiceMimeType !== null;
    const ready = remoteEnabled && voiceAvailable && browserReady;
    voiceButton.disabled = !ready || voiceProcessing;
    voiceButton.classList.toggle("is-processing", voiceProcessing);
    voiceHelp.textContent = !window.isSecureContext
      ? "Voice requires the secure Tailscale QR code."
      : supportedVoiceMimeType === null
        ? "This browser cannot record a supported voice format."
        : voiceAvailabilityDetail;
  }

  function renderVoiceStatus(status) {
    voiceAvailable = Boolean(status && status.available === true);
    voiceAvailabilityDetail = status && typeof status.detail === "string"
      ? status.detail.replace(/\\s+/g, " ").trim().slice(0, 160)
      : "Voice control is unavailable.";
    updateVoiceButton();
  }

  function renderContext(context) {
    if (!context || typeof context !== "object") return;
    const serviceName = typeof context.activeServiceName === "string"
      ? context.activeServiceName.replace(/\\s+/g, " ").trim().slice(0, 48)
      : "";
    const serviceId = typeof context.activeServiceId === "string" &&
      /^[a-z0-9-]{1,64}$/.test(context.activeServiceId)
      ? context.activeServiceId
      : "home";
    const searchCopy = typeof context.searchLabel === "string"
      ? context.searchLabel.replace(/\\s+/g, " ").trim().slice(0, 64)
      : "";
    document.body.dataset.activeService = serviceId;
    activeServiceLabel.textContent = serviceName || "NHD Home";
    currentSearchLabel = searchCopy || "Search NHD-TV";
    searchToggle.setAttribute("aria-label", currentSearchLabel);
    searchToggleCopy.textContent = serviceId === "home" ? "Search" : serviceName || "Search";
    if (!directTextEntry && searchPanel.hidden) searchLabel.textContent = currentSearchLabel;
  }

  function setEnabled(enabled) {
    remoteEnabled = enabled;
    document.body.classList.toggle("is-connected", enabled);
    buttons.forEach((button) => { button.disabled = !enabled; });
    searchToggle.disabled = !enabled;
    searchSubmit.disabled = !enabled;
    controlMode.disabled = !enabled;
    updateVoiceButton();
    if (!enabled) {
      resetTextEntry();
    }
  }

  function confirmCommand(button, haptic = true) {
    button.classList.remove("confirmed");
    void button.offsetWidth;
    button.classList.add("confirmed");
    setTimeout(() => button.classList.remove("confirmed"), 240);
    if (haptic && navigator.vibrate) navigator.vibrate(10);
  }

  async function jsonRequest(path, options) {
    const response = await fetch(path, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || body.detail || "Remote request failed");
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function createVoiceCommandId() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return "voice-" + Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  function sendVoiceActivity(phase, keepalive = false, commandId = voiceCommandId) {
    const token = controllerToken;
    if (!token || !commandId) return;
    try {
      void fetch("/api/voice/activity", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ commandId, phase }),
        keepalive
      }).catch(() => {});
    } catch {}
  }

  function closeVoiceConfirmation() {
    const pending = pendingVoiceConfirmation;
    pendingVoiceConfirmation = null;
    voiceConfirm.hidden = true;
    return pending;
  }

  function showVoiceConfirmation(pending) {
    pendingVoiceConfirmation = pending;
    voiceConfirmCopy.textContent = pending.detail;
    voiceConfirm.hidden = false;
  }

  async function cancelVoiceConfirmation(pending, showStatus) {
    if (!controllerToken || pending === null) return;
    try {
      await jsonRequest("/api/voice/confirm/cancel", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + controllerToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ confirmationId: pending.confirmationId })
      });
      if (showStatus) setState("Voice command cancelled", "connected");
    } catch (error) {
      if (showStatus && (!error || error.status !== 410)) {
        setState(error instanceof Error ? error.message : "Could not cancel voice command", "error");
      }
    }
  }

  function stopVoiceStream() {
    if (voiceStream !== null) {
      voiceStream.getTracks().forEach((track) => track.stop());
      voiceStream = null;
    }
  }

  function clearVoiceStopTimer() {
    if (voiceStopTimer !== null) {
      clearTimeout(voiceStopTimer);
      voiceStopTimer = null;
    }
  }

  async function uploadVoiceRecording(blob, durationMs, commandId) {
    if (!controllerToken || !commandId) return;
    voiceProcessing = true;
    voiceButtonCopy.textContent = "Understanding";
    updateVoiceButton();
    setState("Understanding voice command…");
    try {
      const result = await jsonRequest("/api/voice", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + controllerToken,
          "Content-Type": blob.type,
          "X-NHD-TV-Audio-Duration-Ms": String(durationMs),
          "X-NHD-TV-Voice-Command-Id": commandId
        },
        body: blob
      });
      if (
        result.outcome === "confirmation-required" &&
        typeof result.confirmationId === "string"
      ) {
        showVoiceConfirmation({
          commandId,
          confirmationId: result.confirmationId,
          detail: typeof result.detail === "string"
            ? result.detail.slice(0, 200)
            : "Play this title?"
        });
        setState("Confirm on your phone", "connected");
        if (navigator.vibrate) navigator.vibrate([14, 40, 14]);
      } else {
        closeVoiceConfirmation();
        setState(
          typeof result.detail === "string" ? result.detail : "Voice command sent",
          result.outcome === "failed" ? "error" : "connected"
        );
        if (result.outcome !== "failed" && navigator.vibrate) navigator.vibrate(18);
      }
    } catch (error) {
      // A 422 is the main process's sanitized voice-command failure response;
      // it has already published the TV error and must not be hidden by a
      // subsequent cancellation activity event.
      if (!error || error.status !== 422) sendVoiceActivity("cancelled", false, commandId);
      setState(error instanceof Error ? error.message : "Voice command failed", "error");
    } finally {
      voiceProcessing = false;
      voiceButtonCopy.textContent = "Hold to talk";
      updateVoiceButton();
    }
  }

  function finishVoiceRecording() {
    const recorder = voiceRecorder;
    if (recorder === null || recorder.state === "inactive") return;
    sendVoiceActivity("understanding");
    recorder.stop();
  }

  function cancelVoiceRecording() {
    voiceReleaseRequested = true;
    voiceDiscardRequested = true;
    sendVoiceActivity("cancelled", true);
    const recorder = voiceRecorder;
    if (recorder !== null && recorder.state !== "inactive") recorder.stop();
  }

  async function startVoiceRecording() {
    if (
      voiceButton.disabled ||
      voiceStarting ||
      voiceRecorder !== null ||
      voiceProcessing ||
      supportedVoiceMimeType === null
    ) return;

    const supersededConfirmation = closeVoiceConfirmation();
    if (supersededConfirmation !== null) {
      void cancelVoiceConfirmation(supersededConfirmation, false);
    }
    voiceCommandId = createVoiceCommandId();
    voiceStarting = true;
    voiceReleaseRequested = false;
    voiceDiscardRequested = false;
    setState("Starting microphone…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true
        },
        video: false
      });
      if (voiceReleaseRequested) {
        const commandId = voiceCommandId;
        voiceCommandId = null;
        stream.getTracks().forEach((track) => track.stop());
        sendVoiceActivity("cancelled", false, commandId);
        setState("Microphone ready — hold again to speak", "connected");
        return;
      }

      voiceStream = stream;
      const recorder = new MediaRecorder(stream, {
        audioBitsPerSecond: 64_000,
        mimeType: supportedVoiceMimeType
      });
      const commandId = voiceCommandId;
      if (!commandId) throw new Error("Voice command correlation was lost");
      voiceChunks = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) voiceChunks.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        const recordedChunks = voiceChunks;
        voiceChunks = [];
        const durationMs = Math.max(0, Math.round(performance.now() - voiceStartedAt));
        const mimeType = recorder.mimeType.split(";", 1)[0] ||
          supportedVoiceMimeType.split(";", 1)[0];
        voiceRecorder = null;
        if (voiceCommandId === commandId) voiceCommandId = null;
        clearVoiceStopTimer();
        stopVoiceStream();
        voiceButton.classList.remove("is-recording");
        voiceButtonCopy.textContent = "Hold to talk";
        if (voiceDiscardRequested) {
          voiceDiscardRequested = false;
          recordedChunks.length = 0;
          setState("Voice command cancelled", "connected");
          updateVoiceButton();
          return;
        }
        if (durationMs < 150 || recordedChunks.length === 0) {
          recordedChunks.length = 0;
          sendVoiceActivity("cancelled", false, commandId);
          setState("Hold the microphone a little longer", "error");
          updateVoiceButton();
          return;
        }
        const blob = new Blob(recordedChunks, { type: mimeType });
        recordedChunks.length = 0;
        void uploadVoiceRecording(blob, durationMs, commandId);
      }, { once: true });
      voiceStartedAt = performance.now();
      recorder.start(250);
      voiceRecorder = recorder;
      voiceButton.classList.add("is-recording");
      voiceButtonCopy.textContent = "Listening";
      sendVoiceActivity("listening", false, commandId);
      setState("Listening…", "connected");
      if (navigator.vibrate) navigator.vibrate(12);
      voiceStopTimer = setTimeout(() => {
        finishVoiceRecording();
        if (navigator.vibrate) navigator.vibrate(24);
      }, 19_500);
    } catch (error) {
      const commandId = voiceCommandId;
      voiceRecorder = null;
      voiceCommandId = null;
      voiceChunks = [];
      voiceStartedAt = 0;
      clearVoiceStopTimer();
      stopVoiceStream();
      voiceButton.classList.remove("is-recording");
      voiceButtonCopy.textContent = "Hold to talk";
      sendVoiceActivity("cancelled", false, commandId);
      const denied = error && typeof error === "object" && error.name === "NotAllowedError";
      setState(
        denied ? "Allow microphone access in Safari to use voice" : "The microphone is unavailable",
        "error"
      );
    } finally {
      voiceStarting = false;
      updateVoiceButton();
    }
  }

  async function confirmVoiceCommand() {
    if (!controllerToken || pendingVoiceConfirmation === null || voiceProcessing) return;
    const pending = pendingVoiceConfirmation;
    const confirmationId = pending.confirmationId;
    closeVoiceConfirmation();
    voiceProcessing = true;
    updateVoiceButton();
    setState("Starting playback…");
    try {
      const result = await jsonRequest("/api/voice/confirm", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + controllerToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ confirmationId })
      });
      setState(result.detail || "Voice command confirmed", "connected");
      if (navigator.vibrate) navigator.vibrate(18);
    } catch (error) {
      if (error && (error.status === 409 || error.status >= 500)) {
        showVoiceConfirmation(pending);
      }
      setState(error instanceof Error ? error.message : "Voice confirmation failed", "error");
    } finally {
      voiceProcessing = false;
      updateVoiceButton();
    }
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
    searchLabel.textContent = currentSearchLabel;
    searchQuery.placeholder = "Title, person, or topic";
    searchPanel.hidden = true;
    document.body.classList.remove("is-typing");
    showNavigationMode();
  }

  async function sendAction(action, button, quiet = false) {
    if (document.body.classList.contains("is-typing")) {
      resetTextEntry();
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
      renderContext(result.context);
      if (result.handled !== false) confirmCommand(button, !quiet);
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
      const result = await jsonRequest("/api/heartbeat", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + controllerToken,
          "Content-Type": "application/json"
        },
        body: "{}"
      });
      renderContext(result.context);
      renderVoiceStatus(result.voice);
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
      const result = await jsonRequest("/api/search", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + controllerToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query })
      });
      renderContext(result.context);
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
      const result = await jsonRequest("/api/text", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + controllerToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ submit, text })
      });
      renderContext(result.context);
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
    controlModeCopy.textContent = enabled ? "Arrows" : "Pointer";
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
    resetTextEntry();
    searchLabel.textContent = currentSearchLabel;
    searchQuery.placeholder = "Title, person, or topic";
    searchPanel.hidden = false;
    document.body.classList.add("is-typing");
    remoteModeLabel.textContent = "Search";
    searchQuery.focus();
    searchPanel.scrollIntoView({ block: "nearest" });
  });

  voiceButton.addEventListener("pointerdown", (event) => {
    if (event.isPrimary === false || voiceButton.disabled) return;
    event.preventDefault();
    voiceButton.setPointerCapture(event.pointerId);
    void startVoiceRecording();
  });
  const releaseVoiceButton = () => {
    voiceReleaseRequested = true;
    finishVoiceRecording();
  };
  voiceButton.addEventListener("pointerup", releaseVoiceButton);
  voiceButton.addEventListener("pointercancel", cancelVoiceRecording);
  voiceButton.addEventListener("keydown", (event) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      void startVoiceRecording();
    }
  });
  voiceButton.addEventListener("keyup", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      releaseVoiceButton();
    }
  });
  voiceButton.addEventListener("click", (event) => event.preventDefault());
  voiceConfirmCancel.addEventListener("click", () => {
    const pending = closeVoiceConfirmation();
    if (pending !== null) void cancelVoiceConfirmation(pending, true);
  });
  voiceConfirmPlay.addEventListener("click", () => void confirmVoiceCommand());

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
    let directionHoldTimer = null;
    let directionRepeatTimer = null;
    let pointerDispatched = false;
    const stopDirectionRepeat = () => {
      if (directionHoldTimer !== null) clearTimeout(directionHoldTimer);
      if (directionRepeatTimer !== null) clearInterval(directionRepeatTimer);
      directionHoldTimer = null;
      directionRepeatTimer = null;
      button.classList.remove("is-repeating");
    };
    const release = (expectClick) => {
      button.classList.remove("is-pressed");
      stopDirectionRepeat();
      if (!expectClick) pointerDispatched = false;
      if (button.dataset.action === "back" && backHoldTimer !== null) {
        clearTimeout(backHoldTimer);
        backHoldTimer = null;
      }
    };
    button.addEventListener("pointerdown", (event) => {
      if (button.disabled || event.isPrimary === false) return;
      button.classList.add("is-pressed");
      if (button.dataset.repeat === "true") {
        pointerDispatched = true;
        void sendAction(button.dataset.action, button);
        directionHoldTimer = setTimeout(() => {
          directionHoldTimer = null;
          button.classList.add("is-repeating");
          directionRepeatTimer = setInterval(() => {
            void sendAction(button.dataset.action, button, true);
          }, DIRECTION_REPEAT_INTERVAL_MS);
        }, DIRECTION_REPEAT_DELAY_MS);
      }
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
    button.addEventListener("pointerup", () => release(true));
    button.addEventListener("pointercancel", () => release(false));
    button.addEventListener("pointerleave", () => release(false));
    button.addEventListener("click", () => {
      if (button.dataset.repeat === "true" && pointerDispatched) {
        pointerDispatched = false;
        return;
      }
      if (button.dataset.action === "back" && backHoldTriggered) {
        backHoldTriggered = false;
        return;
      }
      void sendAction(button.dataset.action, button);
    });
  });

  setEnabled(false);
  usePrecisionMode(false);
  window.addEventListener("pagehide", () => {
    cancelVoiceRecording();
    disconnectRemote();
  });
  setInterval(() => void sendHeartbeat(), 10_000);
  beginPairing();
})();`;
