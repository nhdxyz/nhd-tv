import { describe, expect, it } from "vitest";
import { remotePostHeadersAreAllowed } from "../src/main/remote/phone-remote-server";
import { REMOTE_HTML, REMOTE_JS } from "../src/main/remote/remote-assets";

describe("phone remote boundary", () => {
  const expectedOrigin = "http://192.0.2.10:43123";

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

  it("exposes only the bounded search text field and no credential controls", () => {
    expect(REMOTE_HTML.match(/<input\b/g)).toHaveLength(1);
    expect(REMOTE_HTML).toContain('type="search"');
    expect(REMOTE_HTML).toContain('maxlength="120"');
    expect(REMOTE_HTML).not.toMatch(/type="(?:email|password|tel)"/);
    expect(REMOTE_HTML).not.toContain("textarea");
    expect(REMOTE_JS).not.toContain("innerHTML");
    expect(REMOTE_JS).not.toMatch(/https?:\/\//);
    expect(REMOTE_JS).toContain('await jsonRequest("/api/search"');
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

  it("keeps arrows as the default and offers a bounded precision pad", () => {
    expect(REMOTE_HTML).toContain('class="dpad"');
    expect(REMOTE_HTML).toContain('id="precision-pad"');
    expect(REMOTE_HTML).toContain('class="precision-dot"');
    expect(REMOTE_HTML).toContain('id="control-mode"');
    expect(REMOTE_JS).toContain("usePrecisionMode(false)");
    expect(REMOTE_JS).toContain("POINTER_INTERVAL_MS = 40");
    expect(REMOTE_JS).toContain('await jsonRequest("/api/pointer"');
    expect(REMOTE_JS).toContain("distance < 14");
    expect(REMOTE_JS).toContain('y < 0.12 ? -1 : y > 0.88 ? 1 : 0');
    expect(REMOTE_JS).not.toContain("movementX");
    expect(REMOTE_JS).not.toContain("movementY");
  });
});
