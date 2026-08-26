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

  it("does not expose a credential or arbitrary-text control in the static page", () => {
    expect(REMOTE_HTML).not.toContain("input");
    expect(REMOTE_HTML).not.toContain("textarea");
    expect(REMOTE_JS).not.toContain("innerHTML");
    expect(REMOTE_JS).not.toMatch(/https?:\/\//);
  });

  it("confirms accepted commands with optional haptic feedback", () => {
    const commandRequest = REMOTE_JS.indexOf('await jsonRequest("/api/command"');
    const confirmation = REMOTE_JS.indexOf("confirmCommand(button);", commandRequest);

    expect(commandRequest).toBeGreaterThan(-1);
    expect(confirmation).toBeGreaterThan(commandRequest);
    expect(REMOTE_JS).toContain("navigator.vibrate(10)");
  });
});
