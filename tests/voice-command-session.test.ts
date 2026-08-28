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
  it("publishes the final transcript before planning and execution", async () => {
    const sequence: string[] = [];
    const session = new VoiceCommandSession({
      execute: async () => {
        sequence.push("execute");
        return { detail: "Playing", handled: true };
      },
      getContext: () => {
        sequence.push("context");
        return context("automatic");
      },
      onTranscript: (transcript) => sequence.push(`transcript:${transcript}`),
      understand: async (_clip, _signal, onTranscript) => {
        sequence.push("transcribed");
        onTranscript?.("play breaking bad");
        sequence.push("interpreted");
        return {
          intent: mediaIntent(),
          transcript: "play breaking bad"
        };
      }
    });

    await session.process(clip);

    expect(sequence).toEqual([
      "transcribed",
      "transcript:play breaking bad",
      "interpreted",
      "context",
      "execute"
    ]);
  });

  it("keeps an early transcript when intent interpretation later fails", async () => {
    const onTranscript = vi.fn();
    const session = new VoiceCommandSession({
      execute: vi.fn(),
      getContext: () => context(),
      onTranscript,
      understand: async (_clip, _signal, reportTranscript) => {
        reportTranscript?.("play something");
        throw new Error("interpretation failed");
      }
    });

    await expect(session.process(clip)).rejects.toThrow("interpretation failed");
    expect(onTranscript).toHaveBeenCalledOnce();
    expect(onTranscript).toHaveBeenCalledWith("play something");
  });

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

  it("cancels exactly one pending confirmation without consuming another", async () => {
    const confirmationIds = [
      "confirmation_token_first",
      "confirmation_token_second"
    ];
    const execute = vi.fn(async () => ({ detail: "Playing episode", handled: true }));
    const session = new VoiceCommandSession({
      execute,
      getContext: () => context("confirm"),
      randomToken: () => confirmationIds.shift() ?? "confirmation_token_fallback",
      understand: async () => ({ intent: mediaIntent(), transcript: "play breaking bad" })
    });

    const first = await session.process(clip);
    const second = await session.process(clip);
    expect(first.outcome).toBe("confirmation-required");
    expect(second.outcome).toBe("confirmation-required");

    expect(session.cancel(first.confirmationId)).toBe(true);
    expect(session.cancel(first.confirmationId)).toBe(false);
    await expect(session.confirm(first.confirmationId)).resolves.toMatchObject({
      outcome: "failed"
    });
    expect(execute).not.toHaveBeenCalled();

    await expect(session.confirm(second.confirmationId)).resolves.toMatchObject({
      outcome: "completed"
    });
    expect(execute).toHaveBeenCalledOnce();
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
