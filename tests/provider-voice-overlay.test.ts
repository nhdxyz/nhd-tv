import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { providerVoiceOverlayBounds } from "../src/main/voice/provider-voice-overlay";

describe("provider voice overlay", () => {
  it("centers a bounded bottom overlay on television-sized content", () => {
    expect(providerVoiceOverlayBounds(1920, 1080)).toEqual({
      height: 224,
      width: 1_040,
      x: 440,
      y: 812
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
    expect(indexSource).toContain('mainWindow.on("resize", () => providerVoiceOverlay?.resize())');
    expect(indexSource).toContain("serviceHost.activeServiceId !== null");
    expect(indexSource).toContain("intendedUrl: playbackUrl");
    expect(indexSource).toContain("profileNameHint: activeVoiceProfileName()");
    expect(indexSource).toContain(
      'plan.intent.action === "lookup" || plan.intent.action === "play"'
    );
    expect(indexSource).toContain("VOICE_TRANSCRIPT_MIN_DISPLAY_MS");
    expect(indexSource).toContain("VOICE_CONFIRMATION_DISPLAY_MS");
    expect(indexSource).toContain('result.outcome === "confirmation-required" ? "confirmation"');
    expect(indexSource).toContain("voiceProviderCommandHandled(plan.intent, automated)");
    expect(overlaySource).toContain("new WebContentsView");
    expect(overlaySource).toContain("this.#raiseView()");
    expect(overlaySource).toContain("this.#window.contentView.removeChildView(view)");
    expect(overlaySource).toContain("this.#window.contentView.addChildView(view)");
    expect(overlaySource).toContain("detail.textContent = state.copy");
    expect(overlaySource).toContain("-webkit-line-clamp: 3");
    expect(overlaySource).toContain("grid-template-columns: 64px minmax(0, 1fr)");
    expect(overlaySource).toContain("font-size: clamp(24px, 3.4vw, 34px)");
    expect(overlaySource).not.toContain("innerHTML");
  });

  it("replaces a finalized transcript with truthful execution progress", () => {
    const indexSource = readFileSync(
      new URL("../src/main/index.ts", import.meta.url),
      "utf8"
    );
    const progress = indexSource.slice(
      indexSource.indexOf("function presentPhoneVoiceProgress"),
      indexSource.indexOf("function presentPhoneVoiceResult")
    );

    expect(indexSource).toContain(
      'presentPhoneVoiceProgress("Understanding your request…", commandId)'
    );
    expect(progress).toContain("remainingVoiceTranscriptDisplayMilliseconds(");
    expect(progress).toContain("activeVoiceProcessingCommandId !== commandId");
    expect(indexSource).toContain('presentPhoneVoiceProgress("Checking your services…")');
    expect(indexSource).toContain('presentPhoneVoiceProgress(`Opening ${definition.name}…`)');
    expect(indexSource).toContain(
      'presentPhoneVoiceProgress(`Starting ${result.resolvedTitle ?? plan.intent.title}…`)'
    );
  });
});
