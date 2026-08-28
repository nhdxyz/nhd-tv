import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runVoiceStageWithDeadline,
  VoiceStageTimeoutError
} from "../src/main/voice/voice-stage-deadline";

describe("voice stage deadline", () => {
  afterEach(() => vi.useRealTimers());

  it("rejects on time even when the underlying operation ignores cancellation", async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const operation = vi.fn((_signal: AbortSignal) => new Promise<string>(() => undefined));
    const pending = runVoiceStageWithDeadline(operation, {
      onTimeout,
      timeoutMessage: "Discovery took too long.",
      timeoutMs: 10_000
    });
    const rejection = expect(pending).rejects.toMatchObject({
      message: "Discovery took too long.",
      name: "VoiceStageTimeoutError"
    });

    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    expect(operation).toHaveBeenCalledOnce();
    expect(operation.mock.calls[0]?.[0].aborted).toBe(true);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it("forwards parent cancellation without reporting a stage timeout", async () => {
    const parent = new AbortController();
    const onTimeout = vi.fn();
    const pending = runVoiceStageWithDeadline(
      (signal) => new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
      { onTimeout, signal: parent.signal, timeoutMs: 10_000 }
    );
    const reason = new Error("remote disconnected");
    parent.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("cleans up its deadline after a successful operation", async () => {
    vi.useFakeTimers();
    await expect(runVoiceStageWithDeadline(
      async () => "ready",
      { timeoutMs: 1_000 }
    )).resolves.toBe("ready");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects invalid deadlines before invoking the operation", async () => {
    const operation = vi.fn(async () => "unused");
    await expect(runVoiceStageWithDeadline(operation, { timeoutMs: 0 }))
      .rejects.toThrow(TypeError);
    expect(operation).not.toHaveBeenCalled();
    expect(new VoiceStageTimeoutError()).toBeInstanceOf(Error);
  });
});
