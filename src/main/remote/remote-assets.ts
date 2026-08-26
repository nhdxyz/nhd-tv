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
          <button class="remote-icon-button" data-action="back" type="button" disabled aria-label="Back">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <span aria-hidden="true">Navigate</span>
          <button class="remote-icon-button" data-action="home" type="button" disabled aria-label="NHD Home">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10.5 8-6.5 8 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" /><path d="M9.5 20v-6h5v6" /></svg>
          </button>
        </div>

        <div class="control-surface">
          <div class="dpad" aria-label="Directional pad">
            <button class="up" data-action="up" type="button" disabled aria-label="Up"><span>↑</span></button>
            <button class="left" data-action="left" type="button" disabled aria-label="Left"><span>←</span></button>
            <button class="select" data-action="select" type="button" disabled aria-label="Select"><span aria-hidden="true"></span></button>
            <button class="right" data-action="right" type="button" disabled aria-label="Right"><span>→</span></button>
            <button class="down" data-action="down" type="button" disabled aria-label="Down"><span>↓</span></button>
          </div>

          <div class="precision-pad" id="precision-pad" role="button" tabindex="0" aria-label="Move freely, edge-scroll, and tap a highlighted item" hidden>
            <span class="precision-guide precision-guide-x" aria-hidden="true"></span>
            <span class="precision-guide precision-guide-y" aria-hidden="true"></span>
            <span class="precision-dot" aria-hidden="true"></span>
            <span class="precision-copy">Move freely<small>Edges scroll · Tap selects</small></span>
            <span class="precision-status" aria-hidden="true"><i></i> Target locked</span>
          </div>
        </div>

        <button class="control-mode" id="control-mode" type="button" disabled>Use precision pad</button>

        <button class="search-toggle" id="search-toggle" type="button" disabled>Search</button>

        <form class="search-panel" id="search-panel" hidden>
          <label for="search-query">Search your services</label>
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

        <p class="privacy-note"><span aria-hidden="true">●</span> Local, session-only connection</p>
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
  padding: max(0.65rem, env(safe-area-inset-top)) 0.7rem max(0.75rem, env(safe-area-inset-bottom));
  overflow: hidden;
  background:
    radial-gradient(circle at 78% -8%, rgb(22 107 255 / 38%), transparent 23rem),
    radial-gradient(circle at -12% 76%, rgb(126 34 206 / 24%), transparent 22rem),
    linear-gradient(180deg, #0a0e17 0%, #05070b 72%);
}

html,
body { touch-action: manipulation; overscroll-behavior: none; }

button {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
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
  min-height: 2.25rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.brand { display: flex; align-items: center; gap: 0.5rem; }
.brand-mark {
  display: grid;
  width: 1.9rem;
  height: 1.9rem;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 0.58rem;
  background: linear-gradient(145deg, #1685ff, #6d28d9);
  box-shadow: inset 0 1px rgb(255 255 255 / 28%), 0 0.6rem 1.8rem rgb(26 92 255 / 25%);
  font-weight: 900;
}
.brand strong { font-size: 0.8rem; letter-spacing: 0.02em; }

#connection-state {
  display: flex;
  min-width: 0;
  max-width: 58%;
  margin: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 0.4rem;
  color: #fcd34d;
  font-size: 0.66rem;
  font-weight: 800;
  line-height: 1.2;
  text-align: right;
}
#connection-state span {
  width: 0.47rem;
  height: 0.47rem;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 0.25rem rgb(252 211 77 / 10%);
}
#connection-state.connected { color: #86efac; }
#connection-state.connected span { box-shadow: 0 0 0 0.25rem rgb(134 239 172 / 10%); }
#connection-state.error { color: #fda4af; }

.remote-card {
  display: flex;
  min-height: 0;
  margin-top: 0.65rem;
  padding: 1rem;
  flex: 1;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid rgb(255 255 255 / 13%);
  border-radius: 1.45rem;
  background: linear-gradient(155deg, rgb(25 31 45 / 92%), rgb(10 13 20 / 92%));
  box-shadow: inset 0 1px rgb(255 255 255 / 8%), 0 2rem 5rem rgb(0 0 0 / 42%);
  backdrop-filter: blur(24px);
}

.remote-top-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
}
.remote-top-actions > span {
  color: #75839a;
  font-size: 0.62rem;
  font-weight: 850;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.remote-icon-button {
  display: grid;
  width: 3.15rem;
  height: 3.15rem;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 13%);
  border-radius: 1rem;
  background: linear-gradient(145deg, #222b3b, #141a25);
  color: #f8fafc;
  box-shadow: inset 0 1px rgb(255 255 255 / 11%), 0 0.65rem 1.3rem rgb(0 0 0 / 19%);
}
.remote-icon-button svg {
  width: 1.35rem;
  height: 1.35rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.9;
}
.remote-icon-button:not(:disabled).is-pressed,
.remote-icon-button:not(:disabled):active { transform: scale(0.93); filter: brightness(1.3); }

.control-surface {
  display: grid;
  min-height: 0;
  padding: 0.45rem 0;
  flex: 1 1 auto;
  place-items: center;
}
.control-surface > * { grid-area: 1 / 1; }

.dpad {
  display: grid;
  width: min(78vw, 41dvh, 20rem);
  aspect-ratio: 1;
  grid-template: repeat(3, 1fr) / repeat(3, 1fr);
  grid-template-areas: ". up ." "left select right" ". down .";
  gap: 0.42rem;
  margin: 0 auto;
}
.dpad[hidden] { display: none; }

.dpad button {
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 1.2rem;
  background: linear-gradient(145deg, #252e3f, #151b27);
  color: #e7edf7;
  box-shadow: inset 0 1px rgb(255 255 255 / 11%), 0 0.55rem 1rem rgb(0 0 0 / 20%);
  font: inherit;
  font-size: 1.75rem;
  font-weight: 900;
}
.dpad button span { display: grid; width: 100%; height: 100%; place-items: center; border-radius: inherit; }
.dpad .up { grid-area: up; }
.dpad .left { grid-area: left; }
.dpad .select { grid-area: select; }
.dpad .right { grid-area: right; }
.dpad .down { grid-area: down; }
.dpad .select span {
  width: 1.15rem;
  height: 1.15rem;
  margin: auto;
  border: 0.18rem solid #dbeafe;
  border-radius: 0.38rem;
  background: #93c5fd;
  box-shadow: 0 0 1rem rgb(96 165 250 / 55%);
}

.dpad button:not(:disabled).is-pressed span,
.dpad button:not(:disabled):active span {
  transform: scale(0.9);
  background-color: rgb(255 255 255 / 10%);
  filter: brightness(1.25);
}
.dpad button:not(:disabled):active { transform: scale(0.94); }
.dpad .select:not(:disabled).is-pressed span,
.dpad .select:not(:disabled):active span { background: #fff; }

.precision-pad {
  position: relative;
  display: grid;
  width: min(78vw, 41dvh, 20rem);
  aspect-ratio: 1;
  margin: 0 auto;
  place-content: center;
  overflow: hidden;
  border: 1px solid rgb(125 187 255 / 24%);
  border-radius: 2rem;
  outline: 0;
  background:
    radial-gradient(circle at center, rgb(37 99 235 / 19%), transparent 8rem),
    linear-gradient(rgb(125 187 255 / 5%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(125 187 255 / 5%) 1px, transparent 1px),
    linear-gradient(145deg, #202a3b, #111722);
  background-size: auto, 2rem 2rem, 2rem 2rem, auto;
  color: #eaf2ff;
  text-align: center;
  touch-action: none;
  user-select: none;
}
.precision-pad[hidden] { display: none; }
.precision-pad::after {
  position: absolute;
  inset: 0.55rem;
  border: 1px solid rgb(125 187 255 / 8%);
  border-radius: 1.5rem;
  content: "";
  pointer-events: none;
}
.precision-guide {
  position: absolute;
  z-index: 1;
  background: linear-gradient(90deg, transparent, rgb(125 211 252 / 48%), transparent);
  opacity: 0.48;
  pointer-events: none;
  transition: opacity 100ms ease;
}
.precision-guide-x {
  top: 50%;
  right: 0.7rem;
  left: 0.7rem;
  height: 1px;
  transform: translateY(-50%);
}
.precision-guide-y {
  top: 0.7rem;
  bottom: 0.7rem;
  left: 50%;
  width: 1px;
  background: linear-gradient(180deg, transparent, rgb(125 211 252 / 48%), transparent);
  transform: translateX(-50%);
}
.precision-copy {
  display: grid;
  position: relative;
  z-index: 1;
  color: rgb(234 242 255 / 58%);
  font-size: 0.82rem;
  font-weight: 900;
  pointer-events: none;
  transition: opacity 120ms ease;
}
.precision-copy small { margin-top: 0.35rem; color: #75839a; font-size: 0.65rem; }
.precision-dot {
  position: absolute;
  z-index: 2;
  top: 50%;
  left: 50%;
  width: 1.45rem;
  height: 1.45rem;
  border: 2px solid rgb(239 246 255 / 94%);
  border-radius: 50%;
  background: radial-gradient(circle at 38% 34%, #fff 0 13%, #7dd3fc 16%, #1685ff 64%);
  box-shadow:
    0 0 0 0.48rem rgb(22 133 255 / 20%),
    0 0 2.1rem 0.8rem rgb(37 99 235 / 62%);
  pointer-events: none;
  transform: translate(-50%, -50%);
  transition: box-shadow 100ms ease, transform 100ms ease;
}
.precision-pad.is-tracking { border-color: #7dbbff; }
.precision-pad.is-tracking .precision-copy,
.precision-pad.has-snap .precision-copy { opacity: 0.16; }
.precision-pad.is-tracking .precision-dot {
  box-shadow:
    0 0 0 0.52rem rgb(22 133 255 / 22%),
    0 0 2.2rem 0.85rem rgb(37 99 235 / 64%);
  transform: translate(-50%, -50%) scale(1.12);
}
.precision-pad.has-snap {
  border-color: #7dd3fc;
  box-shadow: inset 0 0 0 1px rgb(125 211 252 / 20%), 0 0 2rem rgb(14 165 233 / 16%);
}
.precision-pad.has-snap .precision-guide { opacity: 0.88; }
.precision-pad.has-snap .precision-dot {
  background: radial-gradient(circle at 38% 34%, #fff 0 18%, #a5f3fc 20%, #06b6d4 65%);
  box-shadow:
    0 0 0 0.55rem rgb(34 211 238 / 24%),
    0 0 2.5rem 0.95rem rgb(14 165 233 / 72%);
  transform: translate(-50%, -50%) scale(1.16);
}
.precision-status {
  position: absolute;
  z-index: 3;
  bottom: 0.9rem;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.38rem 0.62rem;
  border: 1px solid rgb(125 211 252 / 25%);
  border-radius: 999px;
  background: rgb(4 17 30 / 82%);
  color: #a5f3fc;
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.04em;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 0.25rem);
  transition: opacity 120ms ease, transform 120ms ease;
  white-space: nowrap;
}
.precision-status i {
  width: 0.38rem;
  height: 0.38rem;
  border-radius: 50%;
  background: #67e8f9;
  box-shadow: 0 0 0.65rem #22d3ee;
}
.precision-pad.has-snap .precision-status { opacity: 1; transform: translate(-50%, 0); }

.control-mode {
  flex: 0 0 auto;
  width: 100%;
  min-height: 2.65rem;
  margin: 0 0 0.65rem;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 0.8rem;
  background: rgb(255 255 255 / 5%);
  color: #b9c4d4;
  font: inherit;
  font-size: 0.7rem;
  font-weight: 850;
}

button:disabled { opacity: 0.3; }

.search-toggle {
  width: 100%;
  min-height: 3.15rem;
  margin-top: 0.6rem;
  flex: 0 0 auto;
  border: 1px solid rgb(125 187 255 / 30%);
  border-radius: 0.9rem;
  background: linear-gradient(145deg, #18345e, #15223a);
  color: #eff6ff;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 900;
}
.search-toggle:not(:disabled).is-pressed,
.search-toggle:not(:disabled):active { transform: scale(0.97); filter: brightness(1.2); }

.search-panel {
  margin-top: 0.8rem;
  padding: 0.9rem;
  border: 1px solid rgb(125 187 255 / 28%);
  border-radius: 1rem;
  background: rgb(5 9 16 / 72%);
}
.search-panel[hidden] { display: none; }
.search-panel label { display: block; margin-bottom: 0.55rem; color: #dbeafe; font-size: 0.76rem; font-weight: 850; }
.search-panel > div { display: grid; grid-template-columns: 1fr auto; gap: 0.55rem; }
.search-panel input {
  min-width: 0;
  min-height: 3rem;
  padding: 0 0.85rem;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 0.8rem;
  outline: none;
  background: #101622;
  color: #fff;
  font: inherit;
  font-size: 1rem;
}
.search-panel input:focus { border-color: #7dbbff; box-shadow: 0 0 0 0.2rem rgb(125 187 255 / 18%); }
.search-panel button {
  min-width: 4rem;
  border: 0;
  border-radius: 0.8rem;
  background: #f8fafc;
  color: #101521;
  font: inherit;
  font-weight: 900;
}
.search-panel p { margin: 0.55rem 0 0; color: #7d899d; font-size: 0.67rem; line-height: 1.4; }

.confirmed { animation: confirmed 220ms ease-out; }
@keyframes confirmed { 50% { filter: brightness(1.4); } }

.privacy-note { margin: 0.65rem 0 0; flex: 0 0 auto; color: #7d899d; font-size: 0.64rem; text-align: center; }
.privacy-note span { margin-right: 0.25rem; color: #4ade80; font-size: 0.48rem; vertical-align: 0.08rem; }
.footnote { margin: 0.6rem 0 0; color: #677287; font-size: 0.63rem; text-align: center; }

@media (max-height: 700px) {
  .remote-card { padding: 0.75rem; }
  .remote-icon-button { width: 2.8rem; height: 2.8rem; }
  .dpad,
  .precision-pad { width: min(78vw, 38dvh, 15rem); }
  .control-mode { min-height: 2.4rem; margin-bottom: 0.5rem; }
  .search-toggle { min-height: 2.8rem; margin-top: 0.5rem; }
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
  const precisionDot = document.querySelector(".precision-dot");
  const precisionGuideX = document.querySelector(".precision-guide-x");
  const precisionGuideY = document.querySelector(".precision-guide-y");
  const controlMode = document.querySelector("#control-mode");
  let controllerToken = sessionStorage.getItem("nhd-controller-token");
  let requestId = null;
  let pointerGesture = null;
  let pendingPointer = null;
  let pointerFlushTimer = null;
  let pointerRequestInFlight = false;
  let lastPointerSentAt = 0;
  const POINTER_INTERVAL_MS = 40;

  for (const gestureEvent of ["gesturestart", "gesturechange"]) {
    document.addEventListener(gestureEvent, (event) => event.preventDefault(), { passive: false });
  }
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
    buttons.forEach((button) => { button.disabled = !enabled; });
    searchToggle.disabled = !enabled;
    searchSubmit.disabled = !enabled;
    controlMode.disabled = !enabled;
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
    if (!response.ok) throw new Error(body.error || "Remote request failed");
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

  async function sendAction(action, button) {
    if (!controllerToken) return;

    try {
      await jsonRequest("/api/command", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + controllerToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action })
      });
      confirmCommand(button);
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
      searchQuery.value = "";
      searchPanel.hidden = true;
      confirmCommand(searchToggle);
      setState("Search ready on TV", "connected");
    } catch (error) {
      setState(error instanceof Error ? error.message : "Search failed", "error");
    }
  }

  function usePrecisionMode(enabled) {
    dpad.hidden = enabled;
    precisionPad.hidden = !enabled;
    if (!enabled) precisionPad.classList.remove("has-snap", "is-tracking");
    controlMode.textContent = enabled ? "Use arrow buttons" : "Use precision pad";
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
      precisionPad.classList.toggle("has-snap", result.snapped === true);
      if (result.snapChanged && navigator.vibrate) navigator.vibrate(7);
    } catch (error) {
      controllerToken = null;
      sessionStorage.removeItem("nhd-controller-token");
      setEnabled(false);
      precisionPad.classList.remove("has-snap", "is-tracking");
      setState(error instanceof Error ? error.message : "Remote disconnected", "error");
    } finally {
      pointerRequestInFlight = false;
      if (pendingPointer) queuePointer(pendingPointer);
    }
  }

  function queuePointer(input, immediate) {
    pendingPointer = input;
    if (pointerRequestInFlight || pointerFlushTimer !== null) return;
    const elapsed = performance.now() - lastPointerSentAt;
    const wait = immediate ? 0 : Math.max(0, POINTER_INTERVAL_MS - elapsed);
    pointerFlushTimer = setTimeout(flushPointer, wait);
  }

  function pointerInput(event, phase) {
    const rect = precisionPad.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const scroll = phase === "move" ? y < 0.12 ? -1 : y > 0.88 ? 1 : 0 : 0;
    precisionDot.style.left = (x * 100) + "%";
    precisionDot.style.top = (y * 100) + "%";
    precisionGuideX.style.top = (y * 100) + "%";
    precisionGuideY.style.left = (x * 100) + "%";
    return { phase, scroll, x, y };
  }

  controlMode.addEventListener("click", () => usePrecisionMode(!dpad.hidden));

  precisionPad.addEventListener("pointerdown", (event) => {
    pointerGesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    precisionPad.setPointerCapture(event.pointerId);
    precisionPad.classList.add("is-tracking");
    queuePointer(pointerInput(event, "move"), true);
  });
  precisionPad.addEventListener("pointermove", (event) => {
    if (!pointerGesture || pointerGesture.id !== event.pointerId) return;
    queuePointer(pointerInput(event, "move"), false);
  });
  precisionPad.addEventListener("pointercancel", () => {
    pointerGesture = null;
    precisionPad.classList.remove("is-tracking");
  });
  precisionPad.addEventListener("pointerup", (event) => {
    if (!pointerGesture || pointerGesture.id !== event.pointerId) return;
    const distance = Math.hypot(
      event.clientX - pointerGesture.x,
      event.clientY - pointerGesture.y
    );
    const phase = distance < 14 ? "tap" : "move";
    pointerGesture = null;
    precisionPad.classList.remove("is-tracking");
    queuePointer(pointerInput(event, phase), true);
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
    searchPanel.hidden = !searchPanel.hidden;
    if (!searchPanel.hidden) searchQuery.focus();
  });

  searchPanel.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = searchQuery.value.replace(/\\s+/g, " ").trim();
    if (query.length > 0 && query.length <= 120) void sendSearch(query);
  });

  buttons.forEach((button) => {
    const release = () => button.classList.remove("is-pressed");
    button.addEventListener("pointerdown", () => button.classList.add("is-pressed"));
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
    button.addEventListener("click", () => sendAction(button.dataset.action, button));
  });

  setEnabled(false);
  usePrecisionMode(false);
  beginPairing();
})();`;
