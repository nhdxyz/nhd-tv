import loudness from "loudness";
import type { MediaAction } from "./contracts";

export type SystemVolumeAction = Extract<
  MediaAction,
  "mute" | "volume-down" | "volume-up"
>;

export interface SystemVolumeBackend {
  getMuted(): Promise<boolean>;
  getVolume(): Promise<number>;
  setMuted(muted: boolean): Promise<void>;
  setVolume(volume: number): Promise<void>;
}

export interface SystemVolumeResult {
  detail: string;
  handled: boolean;
}

const VOLUME_STEP = 5;

function boundedVolume(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export class SystemVolumeController {
  readonly #backend: SystemVolumeBackend;

  constructor(backend: SystemVolumeBackend = loudness) {
    this.#backend = backend;
  }

  async getMuted(): Promise<boolean | null> {
    try {
      return await this.#backend.getMuted();
    } catch {
      return null;
    }
  }

  async setMuted(muted: boolean): Promise<SystemVolumeResult> {
    try {
      await this.#backend.setMuted(muted);
      return {
        detail: muted ? "System audio muted" : "System audio unmuted",
        handled: true
      };
    } catch {
      return {
        detail: "System volume is unavailable here — use the TV volume controls",
        handled: false
      };
    }
  }

  async apply(action: SystemVolumeAction): Promise<SystemVolumeResult> {
    try {
      if (action === "mute") {
        const muted = !await this.#backend.getMuted();
        await this.#backend.setMuted(muted);
        return { detail: muted ? "System audio muted" : "System audio unmuted", handled: true };
      }

      const direction = action === "volume-up" ? 1 : -1;
      const volume = boundedVolume(await this.#backend.getVolume() + direction * VOLUME_STEP);
      await this.#backend.setVolume(volume);
      if (await this.#backend.getMuted()) {
        await this.#backend.setMuted(false);
      }
      return { detail: `System volume ${volume}%`, handled: true };
    } catch {
      return {
        detail: "System volume is unavailable here — use the TV volume controls",
        handled: false
      };
    }
  }
}

export function isSystemVolumeAction(action: MediaAction): action is SystemVolumeAction {
  return action === "mute" || action === "volume-down" || action === "volume-up";
}
