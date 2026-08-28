export type VoiceActivityPhase = "cancelled" | "listening" | "understanding";

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
  tombstoneMs?: number;
}

const PHASE_RANK: Record<VoiceActivityPhase, number> = {
  listening: 0,
  understanding: 1,
  cancelled: 2
};

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
  readonly #tombstoneMs: number;
  readonly #tombstones = new Map<string, number>();
  #active: ActiveVoiceLease | null = null;

  constructor(options: VoiceActivityLeaseOptions = {}) {
    this.#leaseMs = options.leaseMs ?? 120_000;
    this.#maximumTombstones = options.maximumTombstones ?? 64;
    this.#now = options.now ?? Date.now;
    this.#tombstoneMs = options.tombstoneMs ?? 120_000;
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
      if (event.phase === "cancelled") {
        this.#remember(key);
        this.#active = null;
        return "accepted";
      }
      active.phase = event.phase;
      active.expiresAt = this.#now() + this.#leaseMs;
      return "accepted";
    }

    if (event.phase === "cancelled") {
      this.#remember(key);
      return "accepted";
    }
    this.#active = {
      commandId: event.commandId,
      controllerId,
      expiresAt: this.#now() + this.#leaseMs,
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
    if (active === null) {
      this.#active = {
        commandId,
        controllerId,
        expiresAt: this.#now() + this.#leaseMs,
        locked: true,
        phase: "understanding"
      };
      return true;
    }
    if (
      active.controllerId !== controllerId ||
      active.commandId !== commandId ||
      active.locked
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

  finishUpload(controllerId: string, commandId: string): void {
    this.#cleanup();
    const active = this.#active;
    if (active?.controllerId !== controllerId || active.commandId !== commandId) return;
    this.#remember(commandKey(controllerId, commandId));
    this.#active = null;
  }

  releaseController(controllerId: string): boolean {
    this.#cleanup();
    const active = this.#active;
    if (active?.controllerId !== controllerId) return false;
    this.#remember(commandKey(controllerId, active.commandId));
    this.#active = null;
    return true;
  }

  reset(): void {
    this.#active = null;
    this.#tombstones.clear();
  }

  #cleanup(): void {
    const now = this.#now();
    if (this.#active !== null && this.#active.expiresAt <= now) {
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
}
