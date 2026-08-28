import { describe, expect, it, vi } from "vitest";
import type { VoiceAudioClip } from "../src/main/voice/openai-voice-client";
import { VoiceCommandSession } from "../src/main/voice/voice-command-session";
import type { VoiceIntent } from "../src/main/voice/voice-intent";

const clip: VoiceAudioClip = {
  bytes: new Uint8Array([1, 2, 3]),
  durationMs: 1_000,
  mimeType: "audio/webm"
};

function mediaIntent(): VoiceIntent {
  return {
    action: "play",
    creator: null,
    episode: 3,
    kind: "media",
    mediaType: "episode",
    providerHint: "netflix",
    recency: null,
    season: 1,
    title: "Breaking Bad"
  };
}

function context(playbackMode: "automatic" | "confirm" = "confirm") {
  return {
    activeServiceId: null,
    enabledServiceIds: ["netflix"],
    muted: null,
    playbackMode,
    playing: null,
    serviceOrder: ["netflix"]
  } as const;
}

describe("voice command session", () => {
  it("executes control commands without confirmation", async () => {
    const execute = vi.fn(async () => ({ detail: "Volume sent", handled: true }));
    const session = new VoiceCommandSession({
      execute,
      getContext: () => context(),
      understand: async () => ({
        intent: { action: "volume-up", kind: "control" },
        transcript: "turn it up"
      })
    });

    await expect(session.process(clip)).resolves.toEqual({
      detail: "Volume sent",
      outcome: "completed",
      transcript: "turn it up"
    });
    expect(execute).toHaveBeenCalledWith({ action: "volume-up", kind: "remote-action" });
  });

  it("requires and consumes a short-lived playback confirmation", async () => {
    let now = 1_000;
    const execute = vi.fn(async () => ({ detail: "Opening episode", handled: true }));
    const session = new VoiceCommandSession({
      execute,
      getContext: () => context("confirm"),
      now: () => now,
      randomToken: () => "confirmation_token_1234",
      understand: async () => ({ intent: mediaIntent(), transcript: "play breaking bad" })
    });

    await expect(session.process(clip)).resolves.toEqual({
      confirmationId: "confirmation_token_1234",
      detail: "Play Breaking Bad, season 1, episode 3?",
      outcome: "confirmation-required",
      transcript: "play breaking bad"
    });
    expect(execute).not.toHaveBeenCalled();
    await expect(session.confirm("confirmation_token_1234")).resolves.toMatchObject({
      detail: "Opening episode",
      outcome: "completed"
    });
    expect(execute).toHaveBeenCalledTimes(1);
    await expect(session.confirm("confirmation_token_1234")).resolves.toMatchObject({
      outcome: "failed"
    });

    now += 31_000;
  });

  it("revalidates the active profile and enabled services when confirmation is tapped", async () => {
    let currentContext = context("confirm");
    const execute = vi.fn(async () => ({ detail: "Checked current profile", handled: true }));
    const session = new VoiceCommandSession({
      execute,
      getContext: () => currentContext,
      randomToken: () => "confirmation_token_profile",
      understand: async () => ({ intent: mediaIntent(), transcript: "play breaking bad" })
    });

    await expect(session.process(clip)).resolves.toMatchObject({
      outcome: "confirmation-required"
    });
    currentContext = {
      ...context("automatic"),
      enabledServiceIds: [],
      serviceOrder: []
    };
    await expect(session.confirm("confirmation_token_profile")).resolves.toMatchObject({
      outcome: "completed"
    });
    expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({
      candidateServiceIds: [],
      confirmationRequired: false,
      kind: "resolve-media",
      launchAllowed: false
    }));
  });

  it("expires confirmations and executes automatic playback directly", async () => {
    let now = 1_000;
    const execute = vi.fn(async () => ({ detail: "Opening episode", handled: true }));
    const session = new VoiceCommandSession({
      execute,
      getContext: () => context("confirm"),
      now: () => now,
      randomToken: () => "confirmation_token_5678",
      understand: async () => ({ intent: mediaIntent(), transcript: "play it" })
    });
    await session.process(clip);
    now += 30_001;
    await expect(session.confirm("confirmation_token_5678")).resolves.toMatchObject({
      outcome: "failed"
    });

    const automatic = new VoiceCommandSession({
      execute,
      getContext: () => context("automatic"),
      understand: async () => ({ intent: mediaIntent(), transcript: "play it" })
    });
    await expect(automatic.process(clip)).resolves.toMatchObject({ outcome: "completed" });
  });
});
