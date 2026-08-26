import { describe, expect, it } from "vitest";
import {
  SystemVolumeController,
  type SystemVolumeBackend
} from "../src/main/system-volume";

class FakeVolumeBackend implements SystemVolumeBackend {
  muted = false;
  volume = 50;

  async getMuted(): Promise<boolean> {
    return this.muted;
  }

  async getVolume(): Promise<number> {
    return this.volume;
  }

  async setMuted(muted: boolean): Promise<void> {
    this.muted = muted;
  }

  async setVolume(volume: number): Promise<void> {
    this.volume = volume;
  }
}

describe("system volume controller", () => {
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

  it("degrades with clear TV-volume guidance", async () => {
    const backend = new FakeVolumeBackend();
    backend.getVolume = async () => { throw new Error("unsupported"); };
    const controller = new SystemVolumeController(backend);

    await expect(controller.apply("volume-up")).resolves.toEqual({
      detail: "System volume is unavailable here — use the TV volume controls",
      handled: false
    });
  });
});
