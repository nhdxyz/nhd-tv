interface VoiceConfirmationReplayEntry<T> {
  controllerId: string;
  expiresAt: number;
  value: Promise<T>;
}

/**
 * Keeps a short-lived, controller-bound promise for confirmation retries.
 * Replaying an in-progress promise prevents an ambiguous network retry from
 * executing the same provider action twice.
 */
export class VoiceConfirmationReplayCache<T> {
  readonly #entries = new Map<string, VoiceConfirmationReplayEntry<T>>();
  readonly #ttlMs: number;

  constructor(ttlMs: number) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new TypeError("A positive confirmation replay TTL is required");
    }
    this.#ttlMs = ttlMs;
  }

  clear(): void {
    this.#entries.clear();
  }

  delete(confirmationId: string): void {
    this.#entries.delete(confirmationId);
  }

  deleteController(controllerId: string): void {
    for (const [confirmationId, entry] of this.#entries) {
      if (entry.controllerId === controllerId) {
        this.#entries.delete(confirmationId);
      }
    }
  }

  get(
    confirmationId: string,
    controllerId: string,
    now = Date.now()
  ): Promise<T> | null {
    this.#removeExpired(now);
    const entry = this.#entries.get(confirmationId);
    return entry?.controllerId === controllerId ? entry.value : null;
  }

  set(
    confirmationId: string,
    controllerId: string,
    value: Promise<T>,
    now = Date.now()
  ): Promise<T> {
    this.#removeExpired(now);
    this.#entries.set(confirmationId, {
      controllerId,
      expiresAt: now + this.#ttlMs,
      value
    });
    return value;
  }

  #removeExpired(now: number): void {
    for (const [confirmationId, entry] of this.#entries) {
      if (entry.expiresAt <= now) this.#entries.delete(confirmationId);
    }
  }
}
