export type VoiceOperationKind = "command" | "confirmation";

export class VoiceOperationCancelledError extends Error {
  constructor() {
    super("Voice operation cancelled");
    this.name = "VoiceOperationCancelledError";
  }
}

export interface VoiceOperationHandle {
  readonly controller: AbortController;
  readonly controllerId: string;
  readonly commandId: string;
  readonly confirmationId: string | null;
  readonly finished: Promise<void>;
  readonly kind: VoiceOperationKind;
  readonly operationId: string;
}

export type VoiceOperationCancellationDecision =
  | { operation: VoiceOperationHandle; state: "accepted" }
  | { operation: null; state: "already-cancelled" | "not-active" | "not-owner" };

interface InternalVoiceOperation extends VoiceOperationHandle {
  finish: () => void;
}

interface VoiceOperationInput {
  controllerId: string;
  commandId: string;
  confirmationId: string | null;
  kind: VoiceOperationKind;
  operationId: string;
}

interface VoiceOperationRegistryOptions {
  cancellationTombstoneMs?: number;
  maximumCancellationTombstones?: number;
  now?: () => number;
}

function operationKey(controllerId: string, operationId: string): string {
  return `${controllerId}\u0000${operationId}`;
}

/**
 * Owns the one server-side voice operation that may mutate the shared TV.
 * Cancellation is bound to both the paired controller and an opaque execution
 * id, so a delayed request can never cancel a later operation.
 */
export class VoiceOperationRegistry {
  readonly #cancellationTombstoneMs: number;
  readonly #maximumCancellationTombstones: number;
  readonly #now: () => number;
  readonly #cancelled = new Map<string, number>();
  #active: InternalVoiceOperation | null = null;

  constructor(options: VoiceOperationRegistryOptions = {}) {
    this.#cancellationTombstoneMs = options.cancellationTombstoneMs ?? 120_000;
    this.#maximumCancellationTombstones = options.maximumCancellationTombstones ?? 64;
    this.#now = options.now ?? Date.now;
  }

  get active(): VoiceOperationHandle | null {
    return this.#active;
  }

  get busy(): boolean {
    return this.#active !== null;
  }

  begin(input: VoiceOperationInput): VoiceOperationHandle | null {
    this.#cleanup();
    if (this.#active !== null) return null;

    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const operation: InternalVoiceOperation = {
      controller: new AbortController(),
      controllerId: input.controllerId,
      commandId: input.commandId,
      confirmationId: input.confirmationId,
      finish,
      finished,
      kind: input.kind,
      operationId: input.operationId
    };
    this.#active = operation;
    return operation;
  }

  cancel(controllerId: string, operationId: string): VoiceOperationCancellationDecision {
    this.#cleanup();
    const active = this.#active;
    const key = operationKey(controllerId, operationId);
    if (active === null) {
      return this.#cancelled.has(key)
        ? { operation: null, state: "already-cancelled" }
        : { operation: null, state: "not-active" };
    }
    if (active.operationId !== operationId) {
      return { operation: null, state: "not-active" };
    }
    if (active.controllerId !== controllerId) {
      return { operation: null, state: "not-owner" };
    }

    this.#rememberCancellation(key);
    if (!active.controller.signal.aborted) {
      active.controller.abort(new VoiceOperationCancelledError());
    }
    return { operation: active, state: "accepted" };
  }

  finish(operation: VoiceOperationHandle): boolean {
    if (this.#active !== operation) return false;
    const active = this.#active;
    this.#active = null;
    active.finish();
    return true;
  }

  reset(): void {
    const active = this.#active;
    this.#active = null;
    this.#cancelled.clear();
    if (active === null) return;
    if (!active.controller.signal.aborted) {
      active.controller.abort(new VoiceOperationCancelledError());
    }
    active.finish();
  }

  #cleanup(): void {
    const now = this.#now();
    for (const [key, expiresAt] of this.#cancelled) {
      if (expiresAt <= now) this.#cancelled.delete(key);
    }
  }

  #rememberCancellation(key: string): void {
    this.#cancelled.delete(key);
    this.#cancelled.set(key, this.#now() + this.#cancellationTombstoneMs);
    while (this.#cancelled.size > this.#maximumCancellationTombstones) {
      const oldest = this.#cancelled.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#cancelled.delete(oldest);
    }
  }
}
