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

  it("clears the password field before and after saving", () => {
    const handler = renderer.slice(renderer.indexOf('voiceKeyForm.addEventListener("submit"'));
    expect(handler.slice(0, 1_500).match(/voiceKeyInput\.value = ""/g)).toHaveLength(2);
  });

  it("blocks enablement until an encrypted credential is configured", () => {
    expect(renderer).toContain('openAiCredentialStatus.state !== "configured"');
    expect(renderer).toContain("Add an OpenAI API key before enabling voice control.");
  });

  it("states the transient audio and transcript policy", () => {
    expect(html).toContain("does not save microphone audio or transcripts");
    expect(html).toContain("a short recording and its transcript are sent to OpenAI");
  });
});
