import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/main/index.ts", import.meta.url),
  "utf8"
);
const commandHandler = source.slice(
  source.indexOf("async function handleRemoteVoice("),
  source.indexOf("async function confirmRemoteVoice(")
);
const confirmationHandler = source.slice(
  source.indexOf("async function confirmRemoteVoice("),
  source.indexOf("function presentRemoteVoiceTimeout(")
);

describe("voice command deadline wiring", () => {
  it("finishes the full command before the phone server's hard deadline", () => {
    expect(source).toContain("VOICE_COMMAND_SOFT_TIMEOUT_MS = 50_000");
    expect(source).toContain("VOICE_CONFIRMATION_SOFT_TIMEOUT_MS = 32_000");
    expect(source).toContain("VOICE_UNDERSTANDING_TIMEOUT_MS = 52_000");
    expect(commandHandler).toContain("runVoiceStageWithDeadline(");
    expect(commandHandler).toContain("timeoutMs: VOICE_COMMAND_SOFT_TIMEOUT_MS");
    expect(commandHandler).toContain("signal,");
    expect(commandHandler).toContain("googleWatchResolver?.cancelActive()");
  });

  it("gives confirmed playback its own smaller execution budget", () => {
    expect(confirmationHandler).toContain("runVoiceStageWithDeadline(");
    expect(confirmationHandler).toContain("timeoutMs: VOICE_CONFIRMATION_SOFT_TIMEOUT_MS");
    expect(confirmationHandler).toContain(
      "Starting that choice took too long. Try the command again."
    );
  });

  it("surfaces a specific soft-deadline failure instead of a generic error", () => {
    const failure = source.slice(
      source.indexOf("function voiceFailure("),
      source.indexOf("async function handleRemoteVoice(")
    );
    expect(failure).toContain("error instanceof VoiceStageTimeoutError");
    expect(failure).toContain("error.message");
  });
});
