import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  remotePostHeadersAreAllowed,
  shouldAutoApprovePairing
} from "../src/main/remote/phone-remote-server";
import {
  movePrecisionPoint,
  precisionEdgeScroll,
  precisionHorizontalScroll,
  precisionRelativeDelta,
  REMOTE_CSS,
  REMOTE_HTML,
  REMOTE_JS
} from "../src/main/remote/remote-assets";

describe("phone remote boundary", () => {
  const expectedOrigin = "http://192.0.2.10:43123";
  const serverSource = readFileSync(
    new URL("../src/main/remote/phone-remote-server.ts", import.meta.url),
    "utf8"
  );

  it("serves syntactically valid standalone JavaScript", () => {
    expect(() => new Function(REMOTE_JS)).not.toThrow();
  });

  it("requires JSON from the exact QR-code origin", () => {
    expect(remotePostHeadersAreAllowed({
      "content-type": "application/json",
      origin: expectedOrigin
    }, expectedOrigin)).toBe(true);
    expect(remotePostHeadersAreAllowed({
      "content-type": "application/json",
      origin: "http://example.test"
    }, expectedOrigin)).toBe(false);
    expect(remotePostHeadersAreAllowed({
      "content-type": "text/plain",
      origin: expectedOrigin
    }, expectedOrigin)).toBe(false);
    expect(remotePostHeadersAreAllowed({
      "content-type": "application/json",
      origin: expectedOrigin
    }, null)).toBe(false);
  });

  it("auto-approves only the first remote when the device preference allows it", () => {
    expect(shouldAutoApprovePairing(0, true)).toBe(true);
    expect(shouldAutoApprovePairing(0, false)).toBe(false);
    expect(shouldAutoApprovePairing(1, true)).toBe(false);
    expect(shouldAutoApprovePairing(2, true)).toBe(false);
  });

  it("exposes only the bounded search text field and no credential controls", () => {
    expect(REMOTE_HTML.match(/<input\b/g)).toHaveLength(1);
    expect(REMOTE_HTML).toContain('type="search"');
    expect(REMOTE_HTML).toContain('maxlength="120"');
    expect(REMOTE_HTML).not.toMatch(/type="(?:email|password|tel)"/);
    expect(REMOTE_HTML).not.toContain("textarea");
    expect(REMOTE_JS).not.toContain("innerHTML");
    expect(REMOTE_JS).not.toMatch(/https?:\/\//);
    expect(REMOTE_JS).toContain('await jsonRequest("/api/search"');
    expect(REMOTE_JS).toContain('await jsonRequest("/api/text"');
    expect(REMOTE_JS).toContain('body: JSON.stringify({ submit, text })');
    expect(REMOTE_JS).toContain('fetch("/api/disconnect"');
    expect(REMOTE_JS).toContain('await jsonRequest("/api/heartbeat"');
    expect(REMOTE_JS).toContain('setInterval(() => void sendHeartbeat(), 10_000)');
    expect(REMOTE_JS).toContain('window.addEventListener("pagehide", disconnectRemote)');
  });

  it("uses the compact arrow layout without decorative system glyphs or room copy", () => {
    expect(REMOTE_HTML).toContain('<span>↑</span>');
    expect(REMOTE_HTML).toContain('<span>←</span>');
    expect(REMOTE_HTML).toContain('<span>→</span>');
    expect(REMOTE_HTML).toContain('<span>↓</span>');
    expect(REMOTE_HTML).not.toContain("Living room");
    expect(REMOTE_HTML).not.toContain(">OK<");
    expect(REMOTE_HTML).not.toContain("↩");
    expect(REMOTE_HTML).not.toContain("⌂");
  });

  it("fills the phone viewport and keeps icon-only system actions in the top corners", () => {
    expect(REMOTE_CSS).toContain("height: 100dvh");
    expect(REMOTE_CSS).toContain(".remote-shell {");
    expect(REMOTE_CSS).toContain("height: 100%;");
    expect(REMOTE_CSS).toContain(".remote-card {");
    expect(REMOTE_CSS).toContain("flex: 1;");
    expect(REMOTE_HTML).toContain('class="remote-top-actions"');
    expect(REMOTE_HTML).toContain('data-action="back" type="button" disabled aria-label="Back. Hold to force return Home"');
    expect(REMOTE_HTML).toContain('data-action="home" type="button" disabled aria-label="NHD Home"');
    expect(REMOTE_HTML.match(/<svg\b/g)).toHaveLength(3);
    expect(REMOTE_HTML).not.toContain(">Back<");
    expect(REMOTE_HTML).not.toContain(">NHD Home<");
  });

  it("prevents accidental viewport and trackpad zoom on the appliance remote", () => {
    expect(REMOTE_HTML).toContain("maximum-scale=1");
    expect(REMOTE_HTML).toContain("user-scalable=no");
    expect(REMOTE_JS).toContain('"gesturestart"');
    expect(REMOTE_JS).toContain("event.ctrlKey");
  });

  it("confirms accepted commands with optional haptic feedback", () => {
    const commandRequest = REMOTE_JS.indexOf('await jsonRequest("/api/command"');
    const confirmation = REMOTE_JS.indexOf("confirmCommand(button);", commandRequest);

    expect(commandRequest).toBeGreaterThan(-1);
    expect(confirmation).toBeGreaterThan(commandRequest);
    expect(REMOTE_JS).toContain("navigator.vibrate(10)");
  });

  it("exposes accessible media controls and clearly qualifies volume routing", () => {
    for (const action of [
      "play-pause",
      "rewind",
      "fast-forward",
      "volume-down",
      "volume-up",
      "mute"
    ]) {
      expect(REMOTE_HTML).toContain(`data-action="${action}"`);
    }
    expect(REMOTE_HTML).toContain('aria-label="Playback controls"');
    expect(REMOTE_HTML).toContain('aria-label="Volume controls"');
    expect(REMOTE_HTML).toContain('aria-label="Play or pause"');
    expect(REMOTE_HTML).toContain('class="play-pause-icon"');
    expect(REMOTE_HTML).not.toContain("⏯");
    expect(REMOTE_HTML).toContain("TV support varies");
    expect(REMOTE_CSS).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(REMOTE_CSS).toContain(".playback-controls button { min-height: 3rem; }");
    expect(REMOTE_JS).toContain("error.status = response.status");
    expect(serverSource).toContain("MIN_COMMAND_INTERVAL_MS");
    expect(serverSource).toContain("writeJson(response, 429");
  });

  it("offers a deliberate long-press emergency return without double-sending Back", () => {
    expect(REMOTE_HTML).toContain("Hold to force return Home");
    expect(REMOTE_JS).toContain('sendAction("force-home", button)');
    expect(REMOTE_JS).toContain("backHoldTriggered = true");
    expect(REMOTE_JS).toContain("}, 1_200)");
  });

  it("prevents iPhone text selection outside the intentional search field", () => {
    expect(REMOTE_CSS).toContain("-webkit-touch-callout: none");
    expect(REMOTE_CSS).toContain("-webkit-user-select: none");
    expect(REMOTE_CSS).toContain("-webkit-user-select: text");
    expect(REMOTE_JS).toContain('document.addEventListener("selectstart"');
    expect(REMOTE_JS).toContain('event.target.closest("input") === null');
  });

  it("offers an authenticated three-app quick launcher without exposing service URLs", () => {
    expect(REMOTE_HTML).toContain('id="quick-launch-toggle"');
    expect(REMOTE_HTML).toContain('id="quick-launch-panel"');
    expect(REMOTE_HTML).toContain('id="quick-launch-list"');
    expect(REMOTE_JS).toContain('jsonRequest("/api/apps"');
    expect(REMOTE_JS).toContain('jsonRequest("/api/launch"');
    expect(REMOTE_JS).toContain("body: JSON.stringify({ serviceId: service.id })");
    expect(REMOTE_JS).toContain("document.createElement(\"button\")");
    expect(REMOTE_JS).toContain(".slice(0, 3)");
    expect(serverSource).toContain('url.pathname === "/api/apps"');
    expect(serverSource).toContain('url.pathname === "/api/launch"');
    expect(serverSource).toContain("Object.keys(body).some((key) => key !== \"serviceId\")");
    expect(REMOTE_JS).not.toContain("startUrl");
  });

  it("keeps arrows as the default and offers a bounded relative precision pad", () => {
    expect(REMOTE_HTML).toContain('class="dpad"');
    expect(REMOTE_HTML).toContain('id="precision-pad"');
    expect(REMOTE_HTML).not.toContain('class="precision-dot"');
    expect(REMOTE_HTML).not.toContain('class="precision-guide');
    expect(REMOTE_HTML).toContain('class="precision-status"');
    expect(REMOTE_HTML).toContain('id="control-mode"');
    expect(REMOTE_CSS).toContain('.dpad[hidden] { display: none; }');
    expect(REMOTE_JS).toContain("usePrecisionMode(false)");
    expect(REMOTE_JS).toContain("POINTER_INTERVAL_MS = 32");
    expect(REMOTE_JS).toContain('await jsonRequest("/api/pointer"');
    expect(REMOTE_JS).toContain('queuePointer(pointerInput(virtualPointer, "move", 0), true)');
    expect(REMOTE_JS).toContain("pointerGesture.totalDistance < 18 && elapsed < 650");
    expect(REMOTE_JS).toContain("edgeScroll(point.y, verticalDelta)");
    expect(REMOTE_JS).toContain("horizontalScroll(horizontalDelta, verticalDelta)");
    expect(REMOTE_JS).toContain("virtualPointer = movePrecisionPoint(");
    expect(REMOTE_JS).toContain("event.getCoalescedEvents");
    expect(REMOTE_JS).toContain("clearTimeout(pointerFlushTimer)");
    expect(REMOTE_JS).toContain("event.isPrimary === false");
    expect(REMOTE_JS).toContain('queuePointer({ phase: "hide", scroll: 0, scrollX: 0, x: 0.5, y: 0.5 }, true)');
    expect(REMOTE_JS).toContain('classList.toggle("has-snap", result.snapped === true)');
    expect(REMOTE_JS).toContain('precisionTextEntryAvailable = result.textEntryAvailable === true');
    expect(REMOTE_JS).toContain('phase === "tap" && precisionTextEntryAvailable');
    expect(REMOTE_JS).toContain("searchQuery.focus()");
    expect(REMOTE_JS).toContain('searchPanel.scrollIntoView({ block: "nearest" })');
    expect(REMOTE_JS).toContain('searchQuery.addEventListener("input"');
    expect(REMOTE_JS).toContain('if (phase === "tap" && precisionTextEntryAvailable) openProviderKeyboard()');
    expect(REMOTE_JS).toContain('result.throttled !== true');
    expect(REMOTE_HTML).not.toContain("Swipe to move");
    expect(REMOTE_HTML).not.toContain("Follow the cursor on your TV");
    expect(REMOTE_HTML).not.toContain("precision-status-copy");
    expect(REMOTE_CSS).toContain("-webkit-user-select: none");
    expect(REMOTE_JS).not.toContain("renderPointerPoint");
    expect(REMOTE_JS).not.toContain("event.clientX - rect.left");
    expect(REMOTE_JS).not.toContain('y < 0.12 ? -1 : y > 0.88 ? 1 : 0');
    expect(REMOTE_JS).not.toContain("movementX");
    expect(REMOTE_JS).not.toContain("movementY");
  });

  it("uses a bounded relative delta with jitter rejection and acceleration", () => {
    expect(precisionRelativeDelta(0.2, 300)).toBe(0);
    expect(precisionRelativeDelta(3, 300)).toBeCloseTo(0.0106);
    expect(precisionRelativeDelta(15, 300)).toBeCloseTo(0.061);
    expect(precisionRelativeDelta(30, 300)).toBeCloseTo(0.14);
    expect(precisionRelativeDelta(-30, 300)).toBeCloseTo(-0.14);
    expect(precisionRelativeDelta(300, 300)).toBe(0.24);
    expect(precisionRelativeDelta(3, 0)).toBe(0);
  });

  it("continues the virtual cursor across independent swipes", () => {
    const firstSwipe = movePrecisionPoint({ x: 0.5, y: 0.5 }, 60, -60, 300, 300);
    const secondSwipe = movePrecisionPoint(firstSwipe, 60, -60, 300, 300);

    expect(firstSwipe).toEqual({ x: 0.74, y: 0.26 });
    expect(secondSwipe.x).toBeCloseTo(0.98);
    expect(secondSwipe.y).toBeCloseTo(0.02);
    expect(movePrecisionPoint(secondSwipe, 60, -60, 300, 300)).toEqual({ x: 1, y: 0 });
  });

  it("does not teleport on touch-down and taps from the persistent cursor", () => {
    const pointerDownStart = REMOTE_JS.indexOf('precisionPad.addEventListener("pointerdown"');
    const pointerMoveStart = REMOTE_JS.indexOf('precisionPad.addEventListener("pointermove"');
    const pointerDownHandler = REMOTE_JS.slice(pointerDownStart, pointerMoveStart);

    expect(pointerDownHandler).not.toContain("moveVirtualPointer");
    expect(pointerDownHandler).not.toContain("queuePointer");
    expect(pointerDownHandler).not.toContain("openProviderKeyboard");
    expect(REMOTE_JS).toContain('? virtualPointer\n      : moveVirtualPointer');
    expect(REMOTE_HTML).not.toContain("Follow the cursor on your TV");
  });

  it("serializes direct text updates and waits for confirmed TV-field readiness", () => {
    expect(REMOTE_JS).toContain("const textPump = createTextPump(sendRemoteText, () => {");
    expect(REMOTE_JS).toContain("if (inFlight || pending === null) return");
    expect(REMOTE_JS).toContain("pending = {");
    expect(REMOTE_JS).toContain("if (pending?.submit === true && !submit) return");
    expect(REMOTE_JS).toContain("directTextEntryReady = false");
    expect(REMOTE_JS).toContain("confirmProviderKeyboard()");
    expect(REMOTE_JS).toContain("rejectProviderKeyboard()");
    expect(REMOTE_JS).toContain("TEXT_ENTRY_DEBOUNCE_MS = 120");
    expect(REMOTE_JS).toContain("function resetTextEntry() {");
    expect(REMOTE_JS).toContain('if (document.body.classList.contains("is-typing")) resetTextEntry()');
    expect(REMOTE_JS).toContain('remoteModeLabel.textContent = "Navigate"');
  });

  it("waits for committed phone keyboard composition before sending text", () => {
    expect(REMOTE_JS).toContain("event.isComposing");
    expect(REMOTE_JS).toContain('searchQuery.addEventListener("compositionend"');
  });

  it("scales edge scrolling with deliberate movement and preserves direction", () => {
    expect(precisionEdgeScroll(0.5, 12)).toBe(0);
    expect(precisionEdgeScroll(0.05, 8)).toBe(0);
    expect(precisionEdgeScroll(0.05, -1)).toBe(0);
    expect(precisionEdgeScroll(0.05, -3)).toBe(-0.17);
    expect(precisionEdgeScroll(0.95, 9)).toBe(0.5);
    expect(precisionEdgeScroll(0.95, 30)).toBe(1);
  });

  it("turns deliberate horizontal swipes into rail scrolling without stealing vertical motion", () => {
    expect(precisionHorizontalScroll(2, 0)).toBe(0);
    expect(precisionHorizontalScroll(12, 14)).toBe(0);
    expect(precisionHorizontalScroll(4, 1)).toBe(0.18);
    expect(precisionHorizontalScroll(11, 1)).toBe(0.5);
    expect(precisionHorizontalScroll(-11, 1)).toBe(-0.5);
    expect(precisionHorizontalScroll(40, 1)).toBe(1);
  });
});
