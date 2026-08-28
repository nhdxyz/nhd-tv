export interface VoiceAuthoritySuspensionToken {
  readonly generation: number;
}

/**
 * A process-local gate for TV-owned authority changes. Only the latest opaque
 * suspension token may reopen voice registration, so stale cleanup cannot
 * accidentally release a newer boundary.
 */
export class VoiceAuthorityGate {
  #active: VoiceAuthoritySuspensionToken | null = null;
  #generation = 0;

  get suspended(): boolean {
    return this.#active !== null;
  }

  suspend(): VoiceAuthoritySuspensionToken {
    const token = Object.freeze({ generation: ++this.#generation });
    this.#active = token;
    return token;
  }

  resume(token: VoiceAuthoritySuspensionToken): boolean {
    if (this.#active !== token) return false;
    this.#active = null;
    return true;
  }

  reset(): void {
    this.#active = null;
  }
}
