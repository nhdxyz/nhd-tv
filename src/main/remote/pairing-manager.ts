import {
  createHash,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import {
  REMOTE_ACTIONS,
  type RemoteAction,
  type RemotePointerInput
} from "../contracts";

const PAIRING_TOKEN_BYTES = 32;
const REQUEST_ID_BYTES = 18;
const CONTROLLER_TOKEN_BYTES = 32;

export type PairingDecision =
  | { state: "approved"; token: string }
  | { state: "denied" }
  | { state: "expired" }
  | { state: "pending" }
  | { state: "unknown" };

interface PairingOffer {
  expiresAt: number;
  tokenHash: Buffer;
}

interface PairingRequest {
  controllerToken?: string;
  decision: "approved" | "denied" | "pending";
  expiresAt: number;
  id: string;
}

export interface PairingManagerOptions {
  now?: () => number;
  offerLifetimeMs?: number;
  requestLifetimeMs?: number;
}

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

function tokensMatch(candidate: string, expectedHash: Buffer): boolean {
  const candidateHash = hashToken(candidate);
  return candidateHash.length === expectedHash.length && timingSafeEqual(candidateHash, expectedHash);
}

export function parseRemoteAction(value: unknown): RemoteAction | null {
  return typeof value === "string" && (REMOTE_ACTIONS as readonly string[]).includes(value)
    ? value as RemoteAction
    : null;
}

export function parseRemotePointerInput(value: unknown): RemotePointerInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const allowedKeys = new Set(["phase", "scroll", "x", "y"]);
  if (Object.keys(candidate).some((key) => !allowedKeys.has(key))) {
    return null;
  }

  if (
    (candidate.phase !== "move" && candidate.phase !== "tap") ||
    typeof candidate.x !== "number" ||
    !Number.isFinite(candidate.x) ||
    candidate.x < 0 ||
    candidate.x > 1 ||
    typeof candidate.y !== "number" ||
    !Number.isFinite(candidate.y) ||
    candidate.y < 0 ||
    candidate.y > 1 ||
    typeof candidate.scroll !== "number" ||
    !Number.isFinite(candidate.scroll) ||
    candidate.scroll < -1 ||
    candidate.scroll > 1
  ) {
    return null;
  }

  return {
    phase: candidate.phase,
    scroll: candidate.scroll,
    x: candidate.x,
    y: candidate.y
  };
}

export class PairingManager {
  readonly #now: () => number;
  readonly #offerLifetimeMs: number;
  readonly #requestLifetimeMs: number;
  readonly #controllerTokenHashes = new Map<string, Buffer>();
  #offer: PairingOffer | null = null;
  #request: PairingRequest | null = null;

  constructor(options: PairingManagerOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#offerLifetimeMs = options.offerLifetimeMs ?? 2 * 60_000;
    this.#requestLifetimeMs = options.requestLifetimeMs ?? 60_000;
  }

  get connectedControllers(): number {
    return this.#controllerTokenHashes.size;
  }

  get hasPendingRequest(): boolean {
    return this.#request?.decision === "pending" && this.#request.expiresAt > this.#now();
  }

  beginPairing(): { expiresAt: number; token: string } {
    const token = randomBytes(PAIRING_TOKEN_BYTES).toString("base64url");
    const expiresAt = this.#now() + this.#offerLifetimeMs;

    this.#offer = { expiresAt, tokenHash: hashToken(token) };
    this.#request = null;
    return { expiresAt, token };
  }

  requestPairing(token: unknown): { expiresAt: number; requestId: string } | null {
    const offer = this.#offer;

    if (
      typeof token !== "string" ||
      offer === null ||
      offer.expiresAt <= this.#now() ||
      !tokensMatch(token, offer.tokenHash)
    ) {
      return null;
    }

    const requestId = randomBytes(REQUEST_ID_BYTES).toString("base64url");
    const expiresAt = this.#now() + this.#requestLifetimeMs;

    this.#offer = null;
    this.#request = {
      decision: "pending",
      expiresAt,
      id: requestId
    };
    return { expiresAt, requestId };
  }

  approvePending(): boolean {
    const request = this.#request;

    if (request === null || request.decision !== "pending" || request.expiresAt <= this.#now()) {
      return false;
    }

    const token = randomBytes(CONTROLLER_TOKEN_BYTES).toString("base64url");
    const tokenId = randomBytes(REQUEST_ID_BYTES).toString("base64url");

    request.controllerToken = token;
    request.decision = "approved";
    this.#controllerTokenHashes.set(tokenId, hashToken(token));
    return true;
  }

  denyPending(): boolean {
    const request = this.#request;

    if (request === null || request.decision !== "pending" || request.expiresAt <= this.#now()) {
      return false;
    }

    request.decision = "denied";
    return true;
  }

  pairingDecision(requestId: unknown): PairingDecision {
    const request = this.#request;

    if (typeof requestId !== "string" || request === null || request.id !== requestId) {
      return { state: "unknown" };
    }

    if (request.expiresAt <= this.#now()) {
      this.#request = null;
      return { state: "expired" };
    }

    if (request.decision === "approved" && request.controllerToken !== undefined) {
      const token = request.controllerToken;
      this.#request = null;
      return { state: "approved", token };
    }

    if (request.decision === "denied") {
      return { state: "denied" };
    }

    return { state: "pending" };
  }

  authorize(token: unknown): boolean {
    if (typeof token !== "string") {
      return false;
    }

    for (const expectedHash of this.#controllerTokenHashes.values()) {
      if (tokensMatch(token, expectedHash)) {
        return true;
      }
    }

    return false;
  }

  revoke(token: unknown): boolean {
    if (typeof token !== "string") {
      return false;
    }

    for (const [tokenId, expectedHash] of this.#controllerTokenHashes) {
      if (tokensMatch(token, expectedHash)) {
        this.#controllerTokenHashes.delete(tokenId);
        return true;
      }
    }

    return false;
  }

  revokeAll(): void {
    this.#offer = null;
    this.#request = null;
    this.#controllerTokenHashes.clear();
  }
}
