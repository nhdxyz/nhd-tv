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

export interface VoiceCaptureMuteController {
  getMuted(): Promise<boolean | null>;
  setMuted(muted: boolean): Promise<SystemVolumeResult>;
}

interface VoiceCaptureMuteSession {
  key: string;
  mutedByGuard: boolean;
  restoreMuted: boolean;
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

/**
 * Temporarily mutes system audio for one accepted push-to-talk lease. The
 * desired lease identity changes synchronously while volume reads and writes
 * are serialized, preventing a late release from one phone from unmuting a
 * newer recording. The original mute state only lives in memory.
 */
export class VoiceCaptureMuteGuard {
  readonly #controller: VoiceCaptureMuteController;
  readonly #timeoutMs: number;
  #active: VoiceCaptureMuteSession | null = null;
  #desiredKey: string | null = null;
  #operation = Promise.resolve();
  #timeout: NodeJS.Timeout | null = null;

  constructor(controller: VoiceCaptureMuteController, timeoutMs = 25_000) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError("A positive voice capture mute timeout is required");
    }
    this.#controller = controller;
    this.#timeoutMs = timeoutMs;
  }

  begin(key: string): Promise<void> {
    if (key.length === 0) return this.#operation;
    if (this.#desiredKey === key) return this.#operation;

    this.#desiredKey = key;
    this.#scheduleTimeout(key);
    return this.#enqueueReconcile();
  }

  end(key: string): Promise<void> {
    // Only the current desired lease can release the guard. This makes stale
    // cancel, disconnect, upload, and timeout events harmless.
    if (this.#desiredKey !== key) return this.#operation;

    this.#desiredKey = null;
    this.#clearTimeout();
    return this.#enqueueReconcile();
  }

  clear(): Promise<void> {
    this.#desiredKey = null;
    this.#clearTimeout();
    return this.#enqueueReconcile();
  }

  #enqueueReconcile(): Promise<void> {
    this.#operation = this.#operation
      .catch(() => undefined)
      .then(() => this.#reconcile());
    return this.#operation;
  }

  async #reconcile(): Promise<void> {
    if (this.#active !== null) {
      if (this.#desiredKey === this.#active.key) return;
      if (this.#desiredKey !== null) {
        // Transfer an uninterrupted mute to the newer accepted lease while
        // preserving the state sampled before the first recording.
        this.#active.key = this.#desiredKey;
        return;
      }

      const completed = this.#active;
      this.#active = null;
      if (completed.mutedByGuard || completed.restoreMuted) {
        await this.#controller.setMuted(completed.restoreMuted);
      }
      return;
    }

    if (this.#desiredKey === null) return;
    const muted = await this.#controller.getMuted();
    if (this.#desiredKey === null || muted === null) return;

    const session: VoiceCaptureMuteSession = {
      key: this.#desiredKey,
      mutedByGuard: false,
      restoreMuted: muted
    };
    this.#active = session;
    if (!muted) {
      const result = await this.#controller.setMuted(true);
      session.mutedByGuard = result.handled;
    }

    if (this.#desiredKey !== session.key) {
      await this.#reconcile();
    }
  }

  #scheduleTimeout(key: string): void {
    this.#clearTimeout();
    this.#timeout = setTimeout(() => {
      this.#timeout = null;
      if (this.#desiredKey !== key) return;
      this.#desiredKey = null;
      void this.#enqueueReconcile();
    }, this.#timeoutMs);
    this.#timeout.unref?.();
  }

  #clearTimeout(): void {
    if (this.#timeout === null) return;
    clearTimeout(this.#timeout);
    this.#timeout = null;
  }
}

export function isSystemVolumeAction(action: MediaAction): action is SystemVolumeAction {
  return action === "mute" || action === "volume-down" || action === "volume-up";
}
