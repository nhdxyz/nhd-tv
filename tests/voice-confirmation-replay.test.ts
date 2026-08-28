import { describe, expect, it } from "vitest";
import { VoiceConfirmationReplayCache } from "../src/main/remote/voice-confirmation-replay";

describe("voice confirmation replay cache", () => {
  it("returns the same in-progress execution to the owning controller", async () => {
    let finish!: (value: string) => void;
    const execution = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const cache = new VoiceConfirmationReplayCache<string>(1_000);

    cache.set("confirmation", "phone-a", execution, 100);
    const replay = cache.get("confirmation", "phone-a", 200);

    expect(replay).toBe(execution);
    finish("playing");
    await expect(replay).resolves.toBe("playing");
  });

  it("never exposes a replay to another controller", () => {
    const cache = new VoiceConfirmationReplayCache<string>(1_000);
    cache.set("confirmation", "phone-a", Promise.resolve("playing"), 100);

    expect(cache.get("confirmation", "phone-b", 200)).toBeNull();
  });

  it("expires terminal results", () => {
    const cache = new VoiceConfirmationReplayCache<string>(1_000);
    cache.set("confirmation", "phone-a", Promise.resolve("playing"), 100);

    expect(cache.get("confirmation", "phone-a", 1_100)).toBeNull();
  });

  it("removes every replay when a controller disconnects", () => {
    const cache = new VoiceConfirmationReplayCache<string>(1_000);
    cache.set("first", "phone-a", Promise.resolve("first"), 100);
    cache.set("second", "phone-a", Promise.resolve("second"), 100);
    cache.set("other", "phone-b", Promise.resolve("other"), 100);

    cache.deleteController("phone-a");
    expect(cache.get("first", "phone-a", 200)).toBeNull();
    expect(cache.get("second", "phone-a", 200)).toBeNull();
    expect(cache.get("other", "phone-b", 200)).not.toBeNull();
  });

  it("rejects a non-positive replay lifetime", () => {
    expect(() => new VoiceConfirmationReplayCache(0)).toThrow(TypeError);
  });
});
