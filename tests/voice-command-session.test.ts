import { describe, expect, it, vi } from "vitest";
import type { VoiceAudioClip } from "../src/main/voice/openai-voice-client";
import { VoiceCommandSession } from "../src/main/voice/voice-command-session";
import type { VoiceIntent } from "../src/main/voice/voice-intent";

const clip: VoiceAudioClip = {
  bytes: new Uint8Array([1, 2, 3]),
  durationMs: 1_000,
  mimeType: "audio/webm"
};

const stableAuthority = () => "profile-a:7:netflix";

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
    services: [{ id: "netflix", name: "Netflix" }],
    serviceOrder: ["netflix"]
  } as const;
}

describe("voice command session", () => {
  it("runs a trusted parsed choice without recording or transcription", async () => {
    const execute = vi.fn(async () => ({ detail: "Playing choice", handled: true }));
    const understand = vi.fn();
    const session = new VoiceCommandSession({
      execute,
      getContext: () => context("automatic"),
      understand
    });

    await expect(session.processIntent(mediaIntent())).resolves.toEqual({
      detail: "Playing choice",
      outcome: "completed"
    });
    expect(understand).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledOnce();
  });

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

  it("propagates cancellation into command execution", async () => {
    const controller = new AbortController();
    let startedExecution: (() => void) | null = null;
    const executionStarted = new Promise<void>((resolve) => {
      startedExecution = resolve;
    });
    const session = new VoiceCommandSession({
      execute: (_plan, signal) => new Promise((_resolve, reject) => {
        expect(signal).toBe(controller.signal);
        startedExecution?.();
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
      getContext: () => context("automatic"),
      understand: async () => ({
        intent: { action: "volume-up", kind: "control" },
        transcript: "turn it up"
      })
    });

    const operation = session.process(clip, controller.signal);
    await executionStarted;
    const timeout = new Error("voice deadline reached");
    controller.abort(timeout);

    await expect(operation).rejects.toBe(timeout);
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

  it("preserves safe numbered choices returned by command execution", async () => {
    const choices = [{
      id: "watch-provider-netflix",
      ordinal: 1 as const,
      primaryLabel: "Netflix"
    }];
    const session = new VoiceCommandSession({
      execute: async () => ({ choices, detail: "Choose a service", handled: true }),
      getContext: () => context(),
      understand: async () => ({
        intent: { action: "volume-up", kind: "control" },
        transcript: "choose one"
      })
    });

    await expect(session.process(clip)).resolves.toMatchObject({
      choices,
      outcome: "completed"
    });
  });

  it("opens an enabled app without playback confirmation", async () => {
    const execute = vi.fn(async () => ({ detail: "Opened Netflix", handled: true }));
    const session = new VoiceCommandSession({
      execute,
      getContext: () => context("confirm"),
      understand: async () => ({
        intent: { kind: "app", title: "Netflix" },
        transcript: "open netflix"
      })
    });

    await expect(session.process(clip)).resolves.toMatchObject({
      outcome: "completed",
      transcript: "open netflix"
    });
    expect(execute).toHaveBeenCalledWith({
      kind: "launch-service",
      serviceId: "netflix",
      serviceName: "Netflix"
    });
  });

  it("never asks for confirmation when no eligible playback app is enabled", async () => {
    const execute = vi.fn(async () => ({ detail: "Unavailable", handled: false }));
    const session = new VoiceCommandSession({
      execute,
      getContext: () => ({
        ...context("confirm"),
        enabledServiceIds: [],
        serviceOrder: []
      }),
      randomToken: () => "confirmation_should_not_exist",
      understand: async () => ({ intent: mediaIntent(), transcript: "play breaking bad" })
    });

    await expect(session.process(clip)).resolves.toMatchObject({ outcome: "failed" });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("requires and consumes a short-lived playback confirmation", async () => {
    let now = 1_000;
    const execute = vi.fn(async () => ({ detail: "Opening episode", handled: true }));
    const session = new VoiceCommandSession({
      execute,
      getAuthorityKey: stableAuthority,
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

  it("accepts a spoken yes only when it is bound to the pending confirmation", async () => {
    const intents: VoiceIntent[] = [
      mediaIntent(),
      { action: "confirm", kind: "confirmation" }
    ];
    const execute = vi.fn(async () => ({ detail: "Playing Breaking Bad", handled: true }));
    const session = new VoiceCommandSession({
      execute,
      getAuthorityKey: stableAuthority,
      getContext: () => context("confirm"),
      randomToken: () => "confirmation_spoken_yes",
      understand: async () => ({
        intent: intents.shift() ?? { kind: "unknown" },
        transcript: intents.length === 1 ? "play breaking bad" : "yes"
      })
    });

    await expect(session.process(clip)).resolves.toMatchObject({
      confirmationId: "confirmation_spoken_yes",
      outcome: "confirmation-required"
    });
    await expect(session.process(
      clip,
      undefined,
      "confirmation_spoken_yes"
    )).resolves.toEqual({
      detail: "Playing Breaking Bad",
      outcome: "completed",
      transcript: "yes"
    });
    expect(execute).toHaveBeenCalledOnce();

    const unboundExecute = vi.fn(async () => ({ detail: "No confirmation", handled: false }));
    const unbound = new VoiceCommandSession({
      execute: unboundExecute,
      getContext: () => context(),
      understand: async () => ({
        intent: { action: "confirm", kind: "confirmation" },
        transcript: "yes"
      })
    });
    await expect(unbound.process(clip)).resolves.toMatchObject({ outcome: "failed" });
    expect(execute).toHaveBeenCalledOnce();
    expect(unboundExecute).toHaveBeenCalledWith(expect.objectContaining({
      handled: false,
      kind: "no-op"
    }));
  });

  it("cancels a bound playback request by voice without executing it", async () => {
    const intents: VoiceIntent[] = [
      mediaIntent(),
      { action: "cancel", kind: "confirmation" }
    ];
    const execute = vi.fn(async () => ({ detail: "Playing", handled: true }));
    const session = new VoiceCommandSession({
      execute,
      getAuthorityKey: stableAuthority,
      getContext: () => context("confirm"),
      randomToken: () => "confirmation_spoken_no",
      understand: async () => ({
        intent: intents.shift() ?? { kind: "unknown" },
        transcript: intents.length === 1 ? "play breaking bad" : "no"
      })
    });

    await session.process(clip);
    await expect(session.process(
      clip,
      undefined,
      "confirmation_spoken_no"
    )).resolves.toEqual({
      detail: "Cancelled that playback request.",
      outcome: "completed",
      transcript: "no"
    });
    expect(execute).not.toHaveBeenCalled();
    await expect(session.confirm("confirmation_spoken_no")).resolves.toMatchObject({
      outcome: "failed"
    });
  });

  it("supersedes a bound confirmation when the user gives a different command", async () => {
    const intents: VoiceIntent[] = [mediaIntent(), { action: "volume-up", kind: "control" }];
    const execute = vi.fn(async () => ({ detail: "Volume sent", handled: true }));
    const session = new VoiceCommandSession({
      execute,
      getAuthorityKey: stableAuthority,
      getContext: () => context("confirm"),
      randomToken: () => "confirmation_superseded",
      understand: async () => ({
        intent: intents.shift() ?? { kind: "unknown" },
        transcript: intents.length === 1 ? "play breaking bad" : "turn it up"
      })
    });

    await session.process(clip);
    await expect(session.process(
      clip,
      undefined,
      "confirmation_superseded"
    )).resolves.toMatchObject({ outcome: "completed", transcript: "turn it up" });
    expect(execute).toHaveBeenCalledOnce();
    await expect(session.confirm("confirmation_superseded")).resolves.toMatchObject({
      outcome: "failed"
    });
  });

  it("revalidates the active profile and enabled services when confirmation is tapped", async () => {
    let currentContext = context("confirm");
    const execute = vi.fn(async () => ({ detail: "Checked current profile", handled: true }));
    const session = new VoiceCommandSession({
      execute,
      getAuthorityKey: stableAuthority,
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
      getAuthorityKey: stableAuthority,
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
      getAuthorityKey: stableAuthority,
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

  it("rejects a profile A confirmation after the TV switches to profile B", async () => {
    let authorityKey = "profile-a:7:netflix";
    const execute = vi.fn(async () => ({ detail: "Playing", handled: true }));
    const session = new VoiceCommandSession({
      execute,
      getAuthorityKey: () => authorityKey,
      getContext: () => context("confirm"),
      randomToken: () => "confirmation_profile_switch",
      understand: async () => ({ intent: mediaIntent(), transcript: "play breaking bad" })
    });

    await expect(session.process(clip)).resolves.toMatchObject({
      confirmationId: "confirmation_profile_switch",
      outcome: "confirmation-required"
    });
    authorityKey = "profile-b:8:netflix";

    await expect(session.confirm("confirmation_profile_switch")).resolves.toEqual({
      detail: "The TV profile or service access changed. Ask again before starting playback.",
      outcome: "failed"
    });
    expect(execute).not.toHaveBeenCalled();
    await expect(session.confirm("confirmation_profile_switch")).resolves.toMatchObject({
      outcome: "failed"
    });
  });

  it("executes a confirmation when the profile authority revision is unchanged", async () => {
    const execute = vi.fn(async () => ({ detail: "Playing", handled: true }));
    const session = new VoiceCommandSession({
      execute,
      getAuthorityKey: stableAuthority,
      getContext: () => context("confirm"),
      randomToken: () => "confirmation_same_revision",
      understand: async () => ({ intent: mediaIntent(), transcript: "play breaking bad" })
    });

    await session.process(clip);
    await expect(session.confirm("confirmation_same_revision")).resolves.toMatchObject({
      detail: "Playing",
      outcome: "completed"
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("allows a stale confirmation to be cancelled without executing it", async () => {
    let authorityKey = "profile-a:7:netflix";
    const execute = vi.fn(async () => ({ detail: "Playing", handled: true }));
    const session = new VoiceCommandSession({
      execute,
      getAuthorityKey: () => authorityKey,
      getContext: () => context("confirm"),
      randomToken: () => "confirmation_cancel_stale",
      understand: async () => ({ intent: mediaIntent(), transcript: "play breaking bad" })
    });

    await session.process(clip);
    authorityKey = "profile-b:8:netflix";

    expect(session.cancel("confirmation_cancel_stale")).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    await expect(session.confirm("confirmation_cancel_stale")).resolves.toMatchObject({
      outcome: "failed"
    });
  });

  it("fails closed when no confirmation authority source is configured", async () => {
    const execute = vi.fn(async () => ({ detail: "Playing", handled: true }));
    const session = new VoiceCommandSession({
      execute,
      getContext: () => context("confirm"),
      randomToken: () => "confirmation_without_authority",
      understand: async () => ({ intent: mediaIntent(), transcript: "play breaking bad" })
    });

    await expect(session.process(clip)).resolves.toEqual({
      detail: "The TV profile or service access changed. Ask again before starting playback.",
      outcome: "failed",
      transcript: "play breaking bad"
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
