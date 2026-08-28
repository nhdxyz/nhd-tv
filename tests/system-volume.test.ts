import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SystemVolumeController,
  type SystemVolumeBackend,
  VoiceCaptureMuteGuard
} from "../src/main/system-volume";

class FakeVolumeBackend implements SystemVolumeBackend {
  muted = false;
  readonly muteChanges: boolean[] = [];
  volume = 50;
  readonly volumeChanges: number[] = [];

  async getMuted(): Promise<boolean> {
    return this.muted;
  }

  async getVolume(): Promise<number> {
    return this.volume;
  }

  async setMuted(muted: boolean): Promise<void> {
    this.muteChanges.push(muted);
    this.muted = muted;
  }

  async setVolume(volume: number): Promise<void> {
    this.volumeChanges.push(volume);
    this.volume = volume;
  }
}

describe("system volume controller", () => {
  afterEach(() => vi.useRealTimers());

  it("handles volume before acquiring a provider operation token", () => {
    const source = readFileSync(
      new URL("../src/main/index.ts", import.meta.url),
      "utf8"
    );
    const handlerStart = source.indexOf("async function handleRemoteAction(");
    const handlerEnd = source.indexOf("function remoteVoiceStatus()", handlerStart);
    const handler = source.slice(handlerStart, handlerEnd);
    const volumeBranch = handler.indexOf(
      "if (isMediaAction(action) && isSystemVolumeAction(action))"
    );
    const operationAcquisition = handler.indexOf("serviceHost.beginOperation()");

    expect(handlerStart).toBeGreaterThan(-1);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    expect(volumeBranch).toBeGreaterThan(-1);
    expect(operationAcquisition).toBeGreaterThan(volumeBranch);
  });

  it("wires accepted phone activity through the ephemeral capture mute guard", () => {
    const source = readFileSync(
      new URL("../src/main/index.ts", import.meta.url),
      "utf8"
    );

    expect(source).toContain("new VoiceCaptureMuteGuard(");
    expect(source).toContain("DEFAULT_VOICE_ACTIVITY_LEASE_MS");
    expect(source).toContain("voiceCaptureMuteGuard.begin(captureKey)");
    expect(source).toContain("voiceCaptureMuteGuard.end(captureKey)");
    expect(source).toContain("onVoiceActivity: handlePhoneVoiceActivity");
    expect(source).toContain("voiceCaptureMuteGuard.clear()");
  });

  it("changes system volume in bounded five-percent steps and unmutes", async () => {
    const backend = new FakeVolumeBackend();
    backend.muted = true;
    const controller = new SystemVolumeController(backend);

    await expect(controller.apply("volume-up")).resolves.toEqual({
      detail: "System volume 55%",
      handled: true
    });
    expect(backend).toMatchObject({ muted: false, volume: 55 });

    backend.volume = 2;
    await controller.apply("volume-down");
    expect(backend.volume).toBe(0);

    backend.volume = 99;
    await controller.apply("volume-up");
    expect(backend.volume).toBe(100);
  });

  it("sets an exact bounded system volume and unmutes", async () => {
    const backend = new FakeVolumeBackend();
    backend.muted = true;
    const controller = new SystemVolumeController(backend);

    await expect(controller.setVolume(20)).resolves.toEqual({
      detail: "System volume 20%",
      handled: true
    });
    expect(backend).toMatchObject({ muted: false, volume: 20 });
    await controller.setVolume(0);
    await controller.setVolume(100);
    expect(backend.volumeChanges).toEqual([20, 0, 100]);
  });

  it.each([-1, 101, 20.5, Number.NaN])(
    "rejects an invalid exact system volume without touching the backend: %s",
    async (volumePercent) => {
      const backend = new FakeVolumeBackend();
      const controller = new SystemVolumeController(backend);

      await expect(controller.setVolume(volumePercent)).resolves.toEqual({
        detail: "System volume must be a whole percent from 0% to 100%",
        handled: false
      });
      expect(backend).toMatchObject({ muted: false, volume: 50 });
      expect(backend.volumeChanges).toEqual([]);
    }
  );

  it("toggles mute without reading provider media elements", async () => {
    const backend = new FakeVolumeBackend();
    const controller = new SystemVolumeController(backend);

    await expect(controller.apply("mute")).resolves.toEqual({
      detail: "System audio muted",
      handled: true
    });
    await expect(controller.apply("mute")).resolves.toEqual({
      detail: "System audio unmuted",
      handled: true
    });
  });

  it("sets voice mute state idempotently while keeping remote mute as a toggle", async () => {
    const backend = new FakeVolumeBackend();
    const controller = new SystemVolumeController(backend);

    await expect(controller.setMuted(true)).resolves.toEqual({
      detail: "System audio muted",
      handled: true
    });
    await controller.setMuted(true);
    expect(backend.muted).toBe(true);
    await expect(controller.getMuted()).resolves.toBe(true);

    await expect(controller.setMuted(false)).resolves.toEqual({
      detail: "System audio unmuted",
      handled: true
    });
    await controller.setMuted(false);
    expect(backend.muted).toBe(false);

    await controller.apply("mute");
    expect(backend.muted).toBe(true);
  });

  it("degrades with clear TV-volume guidance", async () => {
    const backend = new FakeVolumeBackend();
    backend.getVolume = async () => { throw new Error("unsupported"); };
    const controller = new SystemVolumeController(backend);

    await expect(controller.apply("volume-up")).resolves.toEqual({
      detail: "System volume is unavailable here — use the TV volume controls",
      handled: false
    });
    backend.getMuted = async () => { throw new Error("unsupported"); };
    backend.setMuted = async () => { throw new Error("unsupported"); };
    await expect(controller.getMuted()).resolves.toBeNull();
    await expect(controller.setMuted(true)).resolves.toMatchObject({ handled: false });
    backend.setVolume = async () => { throw new Error("unsupported"); };
    await expect(controller.setVolume(20)).resolves.toMatchObject({ handled: false });
  });

  it("mutes only for the active voice capture and restores audible playback", async () => {
    const backend = new FakeVolumeBackend();
    const guard = new VoiceCaptureMuteGuard(new SystemVolumeController(backend));

    await guard.begin("phone-a:voice-command-a-1234");
    expect(backend.muted).toBe(true);
    expect(backend.muteChanges).toEqual([true]);

    await guard.end("phone-a:voice-command-a-1234");
    expect(backend.muted).toBe(false);
    expect(backend.muteChanges).toEqual([true, false]);
  });

  it("never unmutes audio that was muted before voice capture", async () => {
    const backend = new FakeVolumeBackend();
    backend.muted = true;
    const guard = new VoiceCaptureMuteGuard(new SystemVolumeController(backend));

    await guard.begin("phone-a:voice-command-a-1234");
    await guard.end("phone-a:voice-command-a-1234");

    expect(backend.muted).toBe(true);
    expect(backend.muteChanges).not.toContain(false);
  });

  it("ignores stale releases and transfers an uninterrupted mute to a newer lease", async () => {
    const backend = new FakeVolumeBackend();
    const guard = new VoiceCaptureMuteGuard(new SystemVolumeController(backend));

    await guard.begin("phone-a:voice-command-a-1234");
    await guard.begin("phone-b:voice-command-b-5678");
    await guard.end("phone-a:voice-command-a-1234");
    expect(backend.muted).toBe(true);
    expect(backend.muteChanges).toEqual([true]);

    await guard.end("phone-b:voice-command-b-5678");
    expect(backend.muted).toBe(false);
    expect(backend.muteChanges).toEqual([true, false]);
  });

  it("restores audio when an abandoned listening lease times out", async () => {
    vi.useFakeTimers();
    const backend = new FakeVolumeBackend();
    const guard = new VoiceCaptureMuteGuard(new SystemVolumeController(backend), 500);

    await guard.begin("phone-a:voice-command-a-1234");
    expect(backend.muted).toBe(true);
    await vi.advanceTimersByTimeAsync(501);

    expect(backend.muted).toBe(false);
    expect(backend.muteChanges).toEqual([true, false]);
  });

  it("does not mute after a release overtakes the initial mute-state read", async () => {
    let resolveMuted!: (muted: boolean) => void;
    const muted = new Promise<boolean>((resolve) => {
      resolveMuted = resolve;
    });
    const controller = {
      getMuted: () => muted,
      setMuted: vi.fn(async () => ({ detail: "changed", handled: true }))
    };
    const guard = new VoiceCaptureMuteGuard(controller);

    const beginning = guard.begin("phone-a:voice-command-a-1234");
    const ending = guard.end("phone-a:voice-command-a-1234");
    resolveMuted(false);
    await Promise.all([beginning, ending]);

    expect(controller.setMuted).not.toHaveBeenCalled();
  });
});
