export const REMOTE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#05070b" />
    <title>NHD-TV Remote</title>
    <link rel="stylesheet" href="/remote.css" />
  </head>
  <body>
    <main class="remote-shell">
      <header class="remote-header">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">N</span>
          <span><strong>NHD</strong><small>REMOTE</small></span>
        </div>
        <p id="connection-state" role="status"><span aria-hidden="true"></span>Requesting approval</p>
      </header>

      <section class="remote-card" aria-label="Television remote">
        <div class="remote-title">
          <p class="eyebrow">NHD-TV</p>
          <h1>Living room</h1>
          <p>Tap to move the focus shown on your TV.</p>
        </div>

        <div class="dpad" aria-label="Directional pad">
          <span class="dpad-surface" aria-hidden="true"></span>
          <button class="up" data-action="up" type="button" disabled aria-label="Up"><span>▲</span></button>
          <button class="left" data-action="left" type="button" disabled aria-label="Left"><span>◀</span></button>
          <button class="select" data-action="select" type="button" disabled aria-label="Select"><span>OK</span></button>
          <button class="right" data-action="right" type="button" disabled aria-label="Right"><span>▶</span></button>
          <button class="down" data-action="down" type="button" disabled aria-label="Down"><span>▼</span></button>
        </div>

        <div class="system-actions">
          <button data-action="back" type="button" disabled><span aria-hidden="true">↩</span> Back</button>
          <button data-action="home" type="button" disabled><span aria-hidden="true">⌂</span> NHD Home</button>
          <button class="search-toggle" id="search-toggle" type="button" disabled><span aria-hidden="true">⌕</span> Search</button>
        </div>

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
  min-height: 100dvh;
  margin: 0;
  padding: max(1.2rem, env(safe-area-inset-top)) 1.15rem max(1.4rem, env(safe-area-inset-bottom));
  overflow-x: hidden;
  background:
    radial-gradient(circle at 78% -8%, rgb(22 107 255 / 38%), transparent 23rem),
    radial-gradient(circle at -12% 76%, rgb(126 34 206 / 24%), transparent 22rem),
    linear-gradient(180deg, #0a0e17 0%, #05070b 72%);
}

button {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.remote-shell { width: min(100%, 31rem); margin: 0 auto; }

.remote-header {
  display: flex;
  min-height: 2.8rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.brand { display: flex; align-items: center; gap: 0.65rem; }
.brand-mark {
  display: grid;
  width: 2.35rem;
  height: 2.35rem;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 0.78rem;
  background: linear-gradient(145deg, #1685ff, #6d28d9);
  box-shadow: inset 0 1px rgb(255 255 255 / 28%), 0 0.6rem 1.8rem rgb(26 92 255 / 25%);
  font-weight: 900;
}
.brand > span:last-child { display: grid; line-height: 1; }
.brand strong { font-size: 0.98rem; letter-spacing: 0.04em; }
.brand small { margin-top: 0.2rem; color: #8996ab; font-size: 0.55rem; font-weight: 850; letter-spacing: 0.18em; }

#connection-state {
  display: flex;
  margin: 0;
  align-items: center;
  gap: 0.4rem;
  color: #fcd34d;
  font-size: 0.72rem;
  font-weight: 800;
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
  margin-top: 1.15rem;
  padding: 1.5rem clamp(1.1rem, 5vw, 1.65rem) 1.2rem;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 13%);
  border-radius: 2rem;
  background: linear-gradient(155deg, rgb(25 31 45 / 92%), rgb(10 13 20 / 92%));
  box-shadow: inset 0 1px rgb(255 255 255 / 8%), 0 2rem 5rem rgb(0 0 0 / 42%);
  backdrop-filter: blur(24px);
}

.remote-title { text-align: center; }
.eyebrow { margin: 0; color: #7dbbff; font-size: 0.65rem; font-weight: 900; letter-spacing: 0.18em; text-transform: uppercase; }
h1 { margin: 0.28rem 0 0; font-size: clamp(2.05rem, 10vw, 3rem); letter-spacing: -0.055em; line-height: 1; }
.remote-title > p:last-child { margin: 0.55rem 0 0; color: #98a5b9; font-size: 0.78rem; }

.dpad {
  position: relative;
  display: grid;
  width: min(78vw, 20rem);
  aspect-ratio: 1;
  grid-template: repeat(3, 1fr) / repeat(3, 1fr);
  grid-template-areas: ". up ." "left select right" ". down .";
  margin: 1.55rem auto 1.25rem;
  padding: 0.5rem;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 50%;
  background: linear-gradient(145deg, #222a39, #111621);
  box-shadow: inset 0 1px 1px rgb(255 255 255 / 16%), inset 0 -1rem 2.2rem rgb(0 0 0 / 18%), 0 1.5rem 3rem rgb(0 0 0 / 34%);
}

.dpad-surface {
  position: absolute;
  inset: 30%;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 50%;
  background: #0d121c;
  box-shadow: inset 0 0.25rem 0.8rem rgb(0 0 0 / 45%);
}

.dpad button {
  position: relative;
  z-index: 1;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #e7edf7;
  font: inherit;
  font-size: 1rem;
  font-weight: 900;
}
.dpad button span { display: grid; min-width: 2.8rem; min-height: 2.8rem; place-items: center; border-radius: 50%; }
.dpad .up { grid-area: up; }
.dpad .left { grid-area: left; }
.dpad .select { grid-area: select; }
.dpad .right { grid-area: right; }
.dpad .down { grid-area: down; }
.dpad .select span {
  background: linear-gradient(145deg, #f8fafc, #cbd5e1);
  color: #101521;
  box-shadow: inset 0 1px #fff, 0 0.55rem 1.2rem rgb(0 0 0 / 38%);
  font-size: 0.8rem;
}

.dpad button:not(:disabled).is-pressed span,
.dpad button:not(:disabled):active span {
  transform: scale(0.88);
  background-color: rgb(255 255 255 / 9%);
  filter: brightness(1.25);
}
.dpad .select:not(:disabled).is-pressed span,
.dpad .select:not(:disabled):active span { background: #fff; }

button:disabled { opacity: 0.3; }

.system-actions { display: grid; grid-template-columns: 1fr 1.25fr 1fr; gap: 0.72rem; }
.system-actions button {
  display: flex;
  min-height: 3.55rem;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 1.1rem;
  background: linear-gradient(145deg, #242c3c, #171c28);
  color: #f8fafc;
  box-shadow: inset 0 1px rgb(255 255 255 / 10%), 0 0.65rem 1.3rem rgb(0 0 0 / 19%);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 850;
}
.system-actions button span { color: #9cc9ff; font-size: 1.15rem; }
.system-actions button:not(:disabled).is-pressed,
.system-actions button:not(:disabled):active { transform: scale(0.95); filter: brightness(1.25); }

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

.privacy-note { margin: 1.05rem 0 0; color: #7d899d; font-size: 0.67rem; text-align: center; }
.privacy-note span { margin-right: 0.25rem; color: #4ade80; font-size: 0.48rem; vertical-align: 0.08rem; }
.footnote { margin: 0.9rem 0 0; color: #677287; font-size: 0.68rem; text-align: center; }

@media (max-height: 700px) {
  .remote-card { padding-top: 1rem; }
  .remote-title > p:last-child { display: none; }
  .dpad { width: min(65vh, 18rem); margin-block: 1rem; }
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
  let controllerToken = sessionStorage.getItem("nhd-controller-token");
  let requestId = null;

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
  beginPairing();
})();`;
