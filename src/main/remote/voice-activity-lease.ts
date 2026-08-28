export type VoiceActivityPhase = "cancelled" | "reserved" | "listening" | "understanding";

export interface VoiceActivityEvent {
  commandId: string;
  phase: VoiceActivityPhase;
}

export type VoiceActivityDecision = "accepted" | "busy" | "ignored";

interface ActiveVoiceLease {
  commandId: string;
  controllerId: string;
  expiresAt: number;
  locked: boolean;
  phase: Exclude<VoiceActivityPhase, "cancelled">;
}

export interface VoiceActivityLeaseOptions {
  leaseMs?: number;
  maximumTombstones?: number;
  now?: () => number;
  reservationMs?: number;
  tombstoneMs?: number;
}

const PHASE_RANK: Record<VoiceActivityPhase, number> = {
  reserved: 0,
  listening: 1,
  understanding: 2,
  cancelled: 3
};

export const DEFAULT_VOICE_ACTIVITY_LEASE_MS = 25_000;
export const DEFAULT_VOICE_ACTIVITY_RESERVATION_MS = 5_000;
export const VOICE_COMMAND_ID_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;

function commandKey(controllerId: string, commandId: string): string {
  return `${controllerId}:${commandId}`;
}

/**
 * Correlates the ephemeral activity requests for one push-to-talk gesture.
 * Nothing is persisted; tombstones only prevent late network events from
 * reviving or hiding a newer gesture.
 */
export class VoiceActivityLease {
  readonly #leaseMs: number;
  readonly #maximumTombstones: number;
  readonly #now: () => number;
  readonly #reservationMs: number;
  readonly #tombstoneMs: number;
  readonly #tombstones = new Map<string, number>();
  #active: ActiveVoiceLease | null = null;

  constructor(options: VoiceActivityLeaseOptions = {}) {
    this.#leaseMs = options.leaseMs ?? DEFAULT_VOICE_ACTIVITY_LEASE_MS;
    this.#maximumTombstones = options.maximumTombstones ?? 64;
    this.#now = options.now ?? Date.now;
    this.#reservationMs = options.reservationMs ?? DEFAULT_VOICE_ACTIVITY_RESERVATION_MS;
    this.#tombstoneMs = options.tombstoneMs ?? 120_000;
  }

  get busy(): boolean {
    this.#cleanup();
    return this.#active !== null;
  }

  acceptActivity(controllerId: string, event: VoiceActivityEvent): VoiceActivityDecision {
    this.#cleanup();
    const key = commandKey(controllerId, event.commandId);
    if (this.#tombstones.has(key)) return "ignored";

    const active = this.#active;
    if (active !== null) {
      if (active.controllerId !== controllerId || active.commandId !== event.commandId) {
        this.#remember(key);
        return "busy";
      }
      if (active.locked || PHASE_RANK[event.phase] <= PHASE_RANK[active.phase]) {
        return "ignored";
      }
      if (active.phase === "reserved" && event.phase !== "listening" && event.phase !== "cancelled") {
        return "ignored";
      }
      if (event.phase === "cancelled") {
        this.#remember(key);
        this.#active = null;
        return "accepted";
      }
      active.phase = event.phase;
      active.expiresAt = this.#expiresAtFor(event.phase);
      return "accepted";
    }

    if (event.phase !== "reserved") {
      this.#remember(key);
      return "ignored";
    }
    this.#active = {
      commandId: event.commandId,
      controllerId,
      expiresAt: this.#expiresAtFor(event.phase),
      locked: false,
      phase: event.phase
    };
    return "accepted";
  }

  beginUpload(controllerId: string, commandId: string): boolean {
    this.#cleanup();
    const key = commandKey(controllerId, commandId);
    if (this.#tombstones.has(key)) return false;

    const active = this.#active;
    if (active === null) return false;
    if (
      active.controllerId !== controllerId ||
      active.commandId !== commandId ||
      active.locked ||
      active.phase === "reserved"
    ) {
      if (active.controllerId !== controllerId || active.commandId !== commandId) {
        this.#remember(key);
      }
      return false;
    }
    active.expiresAt = this.#now() + this.#leaseMs;
    active.locked = true;
    active.phase = "understanding";
    return true;
  }

  /**
   * Claims a cancellation that arrived before the upload registered its
   * server-side operation. Only the exact owner and command may release an
   * unlocked, unexpired capture lease.
   */
  cancelPendingUpload(controllerId: string, commandId: string): boolean {
    this.#cleanup();
    const active = this.#active;
    if (
      active === null ||
      active.locked ||
      active.controllerId !== controllerId ||
      active.commandId !== commandId
    ) {
      return false;
    }
    this.#remember(commandKey(controllerId, commandId));
    this.#active = null;
    return true;
  }

  /**
   * Reacquires a completed command for a server-authenticated follow-up such
   * as a playback confirmation. Callers must validate the original controller
   * and command binding before using this method.
   */
  beginBoundOperation(controllerId: string, commandId: string): boolean {
    this.#cleanup();
    if (this.#active !== null) return false;

    const key = commandKey(controllerId, commandId);
    this.#tombstones.delete(key);
    this.#active = {
      commandId,
      controllerId,
      expiresAt: this.#now() + this.#leaseMs,
      locked: true,
      phase: "understanding"
    };
    return true;
  }

  finishUpload(controllerId: string, commandId: string): void {
    this.#cleanup();
    const active = this.#active;
    if (active?.controllerId !== controllerId || active.commandId !== commandId) return;
    this.#remember(commandKey(controllerId, commandId));
    this.#active = null;
  }

  releaseController(controllerId: string): boolean {
    return this.releaseControllerCommand(controllerId) !== null;
  }

  releaseControllerCommand(controllerId: string): string | null {
    this.#cleanup();
    const active = this.#active;
    if (active?.controllerId !== controllerId || active.locked) return null;
    this.#remember(commandKey(controllerId, active.commandId));
    this.#active = null;
    return active.commandId;
  }

  reset(): void {
    this.#active = null;
    this.#tombstones.clear();
  }

  #cleanup(): void {
    const now = this.#now();
    if (
      this.#active !== null &&
      !this.#active.locked &&
      this.#active.expiresAt <= now
    ) {
      this.#remember(commandKey(this.#active.controllerId, this.#active.commandId));
      this.#active = null;
    }
    for (const [key, expiresAt] of this.#tombstones) {
      if (expiresAt <= now) this.#tombstones.delete(key);
    }
  }

  #remember(key: string): void {
    this.#tombstones.delete(key);
    this.#tombstones.set(key, this.#now() + this.#tombstoneMs);
    while (this.#tombstones.size > this.#maximumTombstones) {
      const oldest = this.#tombstones.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#tombstones.delete(oldest);
    }
  }

  #expiresAtFor(phase: Exclude<VoiceActivityPhase, "cancelled">): number {
    return this.#now() + (phase === "reserved" ? this.#reservationMs : this.#leaseMs);
  }
}
