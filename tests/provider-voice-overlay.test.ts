import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { providerVoiceOverlayBounds } from "../src/main/voice/provider-voice-overlay";

describe("provider voice overlay", () => {
  it("centers a bounded bottom overlay on television-sized content", () => {
    expect(providerVoiceOverlayBounds(1920, 1080)).toEqual({
      height: 148,
      width: 920,
      x: 500,
      y: 888
    });
  });

  it("stays within unusually small content bounds", () => {
    const bounds = providerVoiceOverlayBounds(280, 120);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(280);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(120);
  });

  it("mirrors ephemeral voice state without inserting it into a provider page", () => {
    const indexSource = readFileSync(
      new URL("../src/main/index.ts", import.meta.url),
      "utf8"
    );
    const overlaySource = readFileSync(
      new URL("../src/main/voice/provider-voice-overlay.ts", import.meta.url),
      "utf8"
    );

    expect(indexSource).toContain("providerVoiceOverlay?.show(currentVoicePresentation)");
    expect(indexSource).toContain("serviceHost.activeServiceId !== null");
    expect(indexSource).toContain("intendedUrl: playbackUrl");
    expect(indexSource).toContain("profileNameHint: activeVoiceProfileName()");
    expect(overlaySource).toContain("new WebContentsView");
    expect(overlaySource).toContain("detail.textContent = state.copy");
    expect(overlaySource).not.toContain("innerHTML");
  });
});
