import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../src/renderer/index.html", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../src/renderer/index.ts", import.meta.url), "utf8");

describe("voice settings UI privacy boundary", () => {
  it("never prepopulates or retrieves the OpenAI key", () => {
    const keyInput = html.match(/<input\s+id="voice-key-input"[\s\S]*?\/>/)?.[0] ?? "";
    expect(keyInput).toContain('type="password"');
    expect(keyInput).not.toContain(" value=");
    expect(renderer).not.toContain("getOpenAiApiKey");
  });

  it("clears the password field only after a successful save", () => {
    const handler = renderer.slice(renderer.indexOf('voiceKeyForm.addEventListener("submit"'));
    const saveHandler = handler.slice(0, 1_500);
    expect(saveHandler.match(/voiceKeyInput\.value = ""/g)).toHaveLength(1);
    expect(saveHandler.indexOf('await window.nhd.saveOpenAiApiKey(apiKey)'))
      .toBeLessThan(saveHandler.indexOf('elements.voiceKeyInput.value = ""'));
    expect(saveHandler).toContain("setVoiceInlineError(");
    expect(saveHandler).toContain("elements.voiceKeyInput.focus()");
  });

  it("shows direct configured state and dynamic add or replace actions", () => {
    expect(html).toContain('id="voice-key-state"');
    expect(html).toContain('id="voice-key-label"');
    expect(html).toContain('id="voice-key-submit"');
    expect(renderer).toContain('? "Configured"');
    expect(renderer).toContain('? "Replace API key"');
    expect(renderer).toContain('? "Replace key"');
    expect(renderer).toContain(': "Add API key"');
    expect(renderer).toContain(': "Add key"');
  });

  it("keeps key and region failures inline until the corresponding input is corrected", () => {
    expect(html).toContain('id="voice-key-error" role="alert" hidden');
    expect(html).toContain('id="voice-region-error" role="alert" hidden');
    expect(renderer).toContain('voiceKeyInput.addEventListener("input"');
    expect(renderer).toContain('voiceRegionInput.addEventListener("input"');
    expect(renderer).toContain("setVoiceInlineError(elements.voiceKeyError");
    expect(renderer).toContain("setVoiceInlineError(elements.voiceRegionError");
  });

  it("focuses the requested setup section", () => {
    expect(renderer).toContain('openVoiceDialog(initialFocus: "key" | "region" = "key")');
    expect(renderer).toContain('openVoiceDialog("key")');
    expect(renderer).toContain('openVoiceDialog("region")');
    expect(renderer).toContain('initialFocus === "region"');
  });

  it("blocks enablement until an encrypted credential is configured", () => {
    expect(renderer).toContain('openAiCredentialStatus.state !== "configured"');
    expect(renderer).toContain("Add an OpenAI API key before enabling voice control.");
  });

  it("tests the saved key and intent model without pretending the TV owns the phone microphone", () => {
    expect(html).toContain('id="voice-test-button"');
    expect(html).toContain('id="voice-test-credential"');
    expect(html).toContain('id="voice-test-interpretation"');
    expect(html).toContain("Microphone and transcription are tested separately from the paired phone remote");
    expect(renderer).toContain("window.nhd.testOpenAiVoiceSetup()");
    expect(renderer).toContain("renderVoiceSetupDiagnostic");
  });

  it("states the transient audio and transcript policy", () => {
    expect(html).toContain("does not save microphone audio or transcripts");
    expect(html).toContain("a short recording and its transcript are sent to OpenAI");
  });
});
