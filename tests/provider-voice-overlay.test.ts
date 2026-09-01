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
    const bounds = providerVoiceOverlayBounds(280, 120, "clarification");
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(280);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(120);
  });

  it("provides more vertical room for three clarification choices", () => {
    expect(providerVoiceOverlayBounds(1920, 1080, "clarification")).toEqual({
      height: 420,
      width: 1_040,
      x: 440,
      y: 616
    });
    expect(providerVoiceOverlayBounds(1920, 1080, "success").height).toBe(224);
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
    expect(indexSource).toContain('result.outcome === "confirmation-required"');
    expect(indexSource).toContain('hasChoices ? "clarification" : "success"');
    expect(indexSource).toContain("voiceProviderCommandHandled(plan.intent, automationResult)");
    expect(indexSource).toContain('automationResult === "playing-windowed"');
    expect(indexSource).toContain("but I couldn't verify full screen");
    expect(overlaySource).toContain("new WebContentsView");
    expect(overlaySource).toContain("this.#raiseView()");
    expect(overlaySource).toContain("this.#window.contentView.removeChildView(view)");
    expect(overlaySource).toContain("this.#window.contentView.addChildView(view)");
    expect(overlaySource).toContain("detail.textContent = state.copy");
    expect(overlaySource).toContain("instruction.textContent = state.instruction");
    expect(overlaySource).toContain('id="instruction"');
    expect(overlaySource).toContain("Hold the mic again and say");
    expect(overlaySource).toContain('id="choices"');
    expect(overlaySource).toContain("ordinal.textContent = String(choice.ordinal)");
    expect(overlaySource).toContain("primary.textContent = choice.primaryLabel");
    expect(overlaySource).toContain("secondary.textContent = choice.secondaryLabel");
    expect(overlaySource).toContain('state.phase === "clarification"');
    expect(overlaySource).toContain('aria-label="Choices"');
    expect(overlaySource).toContain("-webkit-line-clamp: 3");
    expect(overlaySource).toContain("grid-template-columns: 58px minmax(0, 1fr)");
    expect(overlaySource).toContain("font-size: clamp(30px, 3.1vw, 42px)");
    expect(overlaySource).not.toContain("innerHTML");
  });

  it("uses a restrained provider-neutral command tray with explicit voice states", () => {
    const overlaySource = readFileSync(
      new URL("../src/main/voice/provider-voice-overlay.ts", import.meta.url),
      "utf8"
    );

    expect(overlaySource).toContain('background: rgb(14 15 17 / 98%)');
    expect(overlaySource).toContain('<small id="label">Voice</small>');
    expect(overlaySource).toContain('id="phase-label">Listening</span>');
    expect(overlaySource).toContain('aside[data-phase="listening"] .levels { display: flex; }');
    expect(overlaySource).toContain('class="state-icon icon-success"');
    expect(overlaySource).toContain('class="state-icon icon-confirmation"');
    expect(overlaySource).toContain('class="state-icon icon-error"');
    expect(overlaySource).toContain('success: "Complete"');
    expect(overlaySource).toContain('confirmation: "Confirmation"');
    expect(overlaySource).toContain('error: "Needs attention"');
    expect(overlaySource).not.toContain("AI Voice");
    expect(overlaySource).not.toContain("#d7ff55");
    expect(overlaySource).not.toContain("backdrop-filter");
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
