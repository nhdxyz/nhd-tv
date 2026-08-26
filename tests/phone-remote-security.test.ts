import { describe, expect, it } from "vitest";
import {
  remotePostHeadersAreAllowed,
  shouldAutoApprovePairing
} from "../src/main/remote/phone-remote-server";
import {
  movePrecisionPoint,
  precisionEdgeScroll,
  precisionRelativeDelta,
  REMOTE_CSS,
  REMOTE_HTML,
  REMOTE_JS
} from "../src/main/remote/remote-assets";

describe("phone remote boundary", () => {
  const expectedOrigin = "http://192.0.2.10:43123";

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
    expect(REMOTE_HTML).toContain('data-action="back" type="button" disabled aria-label="Back"');
    expect(REMOTE_HTML).toContain('data-action="home" type="button" disabled aria-label="NHD Home"');
    expect(REMOTE_HTML.match(/<svg\b/g)).toHaveLength(2);
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
    expect(REMOTE_JS).toContain("edgeScroll(point.x, horizontalDelta)");
    expect(REMOTE_JS).toContain("virtualPointer = movePrecisionPoint(");
    expect(REMOTE_JS).toContain("event.getCoalescedEvents");
    expect(REMOTE_JS).toContain("clearTimeout(pointerFlushTimer)");
    expect(REMOTE_JS).toContain("event.isPrimary === false");
    expect(REMOTE_JS).toContain('queuePointer({ phase: "hide", scroll: 0, scrollX: 0, x: 0.5, y: 0.5 }, true)');
    expect(REMOTE_JS).toContain('classList.toggle("has-snap", result.snapped === true)');
    expect(REMOTE_JS).toContain('precisionTextEntryAvailable = result.textEntryAvailable === true');
    expect(REMOTE_JS).toContain('phase === "tap" && precisionTextEntryAvailable');
    expect(REMOTE_JS).toContain("searchQuery.focus()");
    expect(REMOTE_JS).toContain("searchQuery.focus({ preventScroll: true })");
    expect(REMOTE_JS).toContain('searchQuery.addEventListener("input"');
    expect(REMOTE_JS).toContain('if (precisionTextEntryAvailable) openProviderKeyboard()');
    expect(REMOTE_JS).toContain('result.throttled !== true');
    expect(REMOTE_HTML).toContain("Follow the cursor on your TV · Tap anywhere");
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
    expect(REMOTE_JS).toContain('? virtualPointer\n      : moveVirtualPointer');
    expect(REMOTE_HTML).toContain("Follow the cursor on your TV · Tap anywhere");
  });

  it("scales edge scrolling with deliberate movement and preserves direction", () => {
    expect(precisionEdgeScroll(0.5, 12)).toBe(0);
    expect(precisionEdgeScroll(0.05, 8)).toBe(0);
    expect(precisionEdgeScroll(0.05, -1)).toBe(0);
    expect(precisionEdgeScroll(0.05, -3)).toBe(-0.17);
    expect(precisionEdgeScroll(0.95, 9)).toBe(0.5);
    expect(precisionEdgeScroll(0.95, 30)).toBe(1);
  });
});
