import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "../src/main/contracts";

const mainSource = readFileSync(new URL("../src/main/index.ts", import.meta.url), "utf8");
const preloadSource = readFileSync(
  new URL("../src/main/shell-preload.ts", import.meta.url),
  "utf8"
);

describe("OpenAI credential IPC boundary", () => {
  it("uses dedicated credential channels", () => {
    expect(IPC_CHANNELS.getOpenAiCredentialStatus).toBe("nhd:openai:credential:status");
    expect(IPC_CHANNELS.saveOpenAiApiKey).toBe("nhd:openai:credential:save");
    expect(IPC_CHANNELS.clearOpenAiApiKey).toBe("nhd:openai:credential:clear");
  });

  it("protects every credential handler with the trusted shell sender policy", () => {
    for (const channel of [
      "getOpenAiCredentialStatus",
      "saveOpenAiApiKey",
      "clearOpenAiApiKey"
    ]) {
      const handler = mainSource.slice(mainSource.indexOf(`IPC_CHANNELS.${channel}`));
      expect(handler.slice(0, 500)).toContain("validateShellSender");
    }
  });

  it("never exposes a credential getter to the renderer", () => {
    expect(preloadSource).toContain("getOpenAiCredentialStatus");
    expect(preloadSource).toContain("saveOpenAiApiKey");
    expect(preloadSource).toContain("clearOpenAiApiKey");
    expect(preloadSource).not.toContain("getOpenAiApiKey");
    expect(preloadSource).not.toContain("openAiCredentialStore.getApiKey");
  });

  it("rejects Electron's weak Linux plaintext fallback", () => {
    expect(mainSource).toContain('safeStorage.getSelectedStorageBackend() !== "basic_text"');
  });
});
