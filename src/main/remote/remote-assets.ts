export const REMOTE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#07090e" />
    <title>NHD-TV Remote</title>
    <link rel="stylesheet" href="/remote.css" />
  </head>
  <body>
    <main class="remote-shell">
      <header>
        <div class="brand"><span aria-hidden="true">N</span> NHD-TV</div>
        <p id="connection-state" role="status">Requesting TV approval…</p>
      </header>

      <section class="remote-card" aria-label="Television remote">
        <p class="eyebrow">Local remote</p>
        <h1>Living room control</h1>
        <p class="notice">Commands stay on this network. Password and payment entry are not supported.</p>

        <div class="dpad" aria-label="Directional pad">
          <button class="up" data-action="up" type="button" disabled aria-label="Up">▲</button>
          <button class="left" data-action="left" type="button" disabled aria-label="Left">◀</button>
          <button class="select" data-action="select" type="button" disabled aria-label="Select">OK</button>
          <button class="right" data-action="right" type="button" disabled aria-label="Right">▶</button>
          <button class="down" data-action="down" type="button" disabled aria-label="Down">▼</button>
        </div>

        <div class="system-actions">
          <button data-action="back" type="button" disabled>Back</button>
          <button data-action="home" type="button" disabled>Home</button>
        </div>
      </section>

      <p class="footnote">Session-only pairing · Rescan after NHD-TV restarts</p>
    </main>
    <script src="/remote.js" defer></script>
  </body>
</html>`;

export const REMOTE_CSS = `:root {
  color: #f8fafc;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color-scheme: dark;
}

* { box-sizing: border-box; }

body {
  min-height: 100dvh;
  margin: 0;
  padding: max(1.2rem, env(safe-area-inset-top)) 1.2rem max(1.4rem, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 80% 5%, rgb(37 99 235 / 30%), transparent 20rem),
    linear-gradient(180deg, #0c1019, #06070b);
}

button { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }

.remote-shell { width: min(100%, 32rem); margin: 0 auto; }

header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }

.brand { display: flex; align-items: center; gap: 0.55rem; font-weight: 850; letter-spacing: 0.06em; }
.brand span {
  display: grid; width: 2.2rem; height: 2.2rem; place-items: center; border-radius: 0.7rem;
  background: linear-gradient(145deg, #2563eb, #7c3aed); box-shadow: inset 0 1px rgb(255 255 255 / 25%);
}

#connection-state { margin: 0; color: #fcd34d; font-size: 0.78rem; font-weight: 750; text-align: right; }
#connection-state.connected { color: #86efac; }
#connection-state.error { color: #fda4af; }

.remote-card {
  margin-top: 1.2rem; padding: 1.45rem; border: 1px solid rgb(255 255 255 / 12%); border-radius: 1.6rem;
  background: rgb(14 18 28 / 84%); box-shadow: 0 2rem 5rem rgb(0 0 0 / 35%); backdrop-filter: blur(22px);
}

.eyebrow { margin: 0; color: #93c5fd; font-size: 0.68rem; font-weight: 850; letter-spacing: 0.16em; text-transform: uppercase; }
h1 { margin: 0.35rem 0 0; font-size: clamp(2rem, 10vw, 3.2rem); letter-spacing: -0.055em; line-height: 0.98; }
.notice { margin: 0.9rem 0 0; color: #aeb8ca; font-size: 0.82rem; line-height: 1.5; }

.dpad {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-areas: ". up ." "left select right" ". down .";
  gap: 0.65rem; width: min(100%, 22rem); margin: 2rem auto 0;
}

.dpad button, .system-actions button {
  border: 1px solid rgb(255 255 255 / 13%); background: linear-gradient(145deg, #222938, #151a24); color: #fff;
  box-shadow: inset 0 1px rgb(255 255 255 / 12%), 0 0.7rem 1.6rem rgb(0 0 0 / 22%); font: inherit; font-weight: 850;
}

.dpad button { aspect-ratio: 1; border-radius: 1.4rem; font-size: 1.4rem; }
.dpad .up { grid-area: up; }
.dpad .left { grid-area: left; }
.dpad .select { grid-area: select; background: linear-gradient(145deg, #f8fafc, #cbd5e1); color: #111827; font-size: 1rem; }
.dpad .right { grid-area: right; }
.dpad .down { grid-area: down; }

button:not(:disabled):active { transform: scale(0.93); filter: brightness(1.25); }
button:disabled { opacity: 0.35; }

.system-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; margin-top: 1.2rem; }
.system-actions button { min-height: 3.3rem; border-radius: 1rem; }
.footnote { margin: 1rem 0 0; color: #7f899c; font-size: 0.72rem; text-align: center; }
`;

export const REMOTE_JS = `(() => {
  const state = document.querySelector("#connection-state");
  const buttons = Array.from(document.querySelectorAll("button[data-action]"));
  let controllerToken = sessionStorage.getItem("nhd-controller-token");
  let requestId = null;

  function setState(message, kind) {
    state.textContent = message;
    state.className = kind || "";
  }

  function setEnabled(enabled) {
    buttons.forEach((button) => { button.disabled = !enabled; });
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
      setState("Scan the current QR code on NHD-TV", "error");
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
      setState("Approve this phone on the TV");
      setTimeout(pollDecision, 500);
    } catch (error) {
      setState(error instanceof Error ? error.message : String(error), "error");
    }
  }

  async function sendAction(action) {
    if (!controllerToken) return;
    if (navigator.vibrate) navigator.vibrate(8);

    try {
      await jsonRequest("/api/command", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + controllerToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action })
      });
    } catch (error) {
      controllerToken = null;
      sessionStorage.removeItem("nhd-controller-token");
      setEnabled(false);
      setState(error instanceof Error ? error.message : "Remote disconnected", "error");
    }
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => sendAction(button.dataset.action));
  });

  setEnabled(false);
  beginPairing();
})();`;
