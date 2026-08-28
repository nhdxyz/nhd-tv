import { randomBytes } from "node:crypto";
import type { VoicePresentationChoice } from "../contracts";
import type { VoiceAudioClip } from "./openai-voice-client";
import {
  planVoiceCommand,
  type VoiceCommandContext,
  type VoiceCommandPlan
} from "./voice-command-router";
import type { VoiceIntent, VoiceMediaIntent } from "./voice-intent";

const CONFIRMATION_TTL_MS = 30_000;
const MAX_PENDING_CONFIRMATIONS = 4;

export interface VoiceCommandExecutionResult {
  choices?: readonly VoicePresentationChoice[];
  detail: string;
  handled: boolean;
}

export interface VoiceCommandSessionResult {
  choices?: readonly VoicePresentationChoice[];
  confirmationId?: string;
  detail: string;
  outcome: "completed" | "confirmation-required" | "failed";
  transcript?: string;
}

export type VoiceConfirmationAuthorityKey = string | number;

export interface VoiceCommandSessionOptions {
  execute: (plan: VoiceCommandPlan, signal?: AbortSignal) =>
    VoiceCommandExecutionResult |
    Promise<VoiceCommandExecutionResult>;
  /**
   * Returns a stable key for the active profile and its current service
   * authority. A confirmation is valid only while this key remains unchanged.
   * Returning null (or omitting the callback) disables confirmations safely.
   */
  getAuthorityKey?: () =>
    VoiceConfirmationAuthorityKey |
    null |
    Promise<VoiceConfirmationAuthorityKey | null>;
  getContext: () => VoiceCommandContext | Promise<VoiceCommandContext>;
  now?: () => number;
  onTranscript?: (transcript: string) => void;
  randomToken?: () => string;
  understand: (
    clip: VoiceAudioClip,
    signal?: AbortSignal,
    onTranscript?: (transcript: string) => void
  ) =>
    { intent: VoiceIntent; transcript: string } |
    Promise<{ intent: VoiceIntent; transcript: string }>;
}

interface PendingConfirmation {
  authorityKey: VoiceConfirmationAuthorityKey;
  expiresAt: number;
  intent: VoiceMediaIntent;
}

function normalizedConfirmationId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value)
    ? value
    : null;
}

function mediaDescription(intent: VoiceMediaIntent): string {
  if (intent.mediaType === "episode") {
    return `${intent.title}, season ${intent.season}, episode ${intent.episode}`;
  }
  if (intent.recency === "latest" && intent.creator !== null) {
    return `${intent.creator}'s latest video`;
  }
  if (intent.creator !== null && intent.creator !== intent.title) {
    return `${intent.title} by ${intent.creator}`;
  }
  return intent.title;
}

export function voiceConfirmationDetail(intent: VoiceMediaIntent): string {
  return `Play ${mediaDescription(intent)}?`;
}

export class VoiceCommandSession {
  readonly #execute: VoiceCommandSessionOptions["execute"];
  readonly #getAuthorityKey: VoiceCommandSessionOptions["getAuthorityKey"];
  readonly #getContext: VoiceCommandSessionOptions["getContext"];
  readonly #now: () => number;
  readonly #onTranscript: NonNullable<VoiceCommandSessionOptions["onTranscript"]>;
  readonly #pending = new Map<string, PendingConfirmation>();
  readonly #randomToken: () => string;
  readonly #understand: VoiceCommandSessionOptions["understand"];

  constructor(options: VoiceCommandSessionOptions) {
    this.#execute = options.execute;
    this.#getAuthorityKey = options.getAuthorityKey;
    this.#getContext = options.getContext;
    this.#now = options.now ?? Date.now;
    this.#onTranscript = options.onTranscript ?? (() => undefined);
    this.#randomToken = options.randomToken ?? (() => randomBytes(24).toString("base64url"));
    this.#understand = options.understand;
  }

  async process(
    clip: VoiceAudioClip,
    signal?: AbortSignal,
    pendingConfirmationId?: unknown
  ): Promise<VoiceCommandSessionResult> {
    this.#removeExpired();
    let transcriptReported = false;
    const reportTranscript = (transcript: string) => {
      if (transcriptReported) return;
      transcriptReported = true;
      this.#onTranscript(transcript);
    };
    const { intent, transcript } = await this.#understand(clip, signal, reportTranscript);
    signal?.throwIfAborted();
    reportTranscript(transcript);
    const boundConfirmationId = normalizedConfirmationId(pendingConfirmationId);
    if (intent.kind === "confirmation" && boundConfirmationId !== null) {
      if (intent.action === "cancel") {
        const cancelled = this.cancel(boundConfirmationId);
        return {
          detail: cancelled
            ? "Cancelled that playback request."
            : "That voice confirmation expired. Hold the microphone and try again.",
          outcome: cancelled ? "completed" : "failed",
          transcript
        };
      }
      const confirmed = await this.confirm(boundConfirmationId, signal);
      return { ...confirmed, transcript };
    }
    if (boundConfirmationId !== null) {
      this.cancel(boundConfirmationId);
    }
    const plan = planVoiceCommand(intent, await this.#getContext());
    signal?.throwIfAborted();

    if (plan.kind === "resolve-media" && plan.confirmationRequired) {
      const authorityKey = await this.#readAuthorityKey(signal);
      if (authorityKey === null) {
        return this.#authorityChangedResult(transcript);
      }
      const confirmationId = this.#randomToken();
      if (normalizedConfirmationId(confirmationId) === null) {
        throw new Error("The voice confirmation token generator failed.");
      }
      while (this.#pending.size >= MAX_PENDING_CONFIRMATIONS) {
        const oldest = this.#pending.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        this.#pending.delete(oldest);
      }
      this.#pending.set(confirmationId, {
        authorityKey,
        expiresAt: this.#now() + CONFIRMATION_TTL_MS,
        intent: plan.intent
      });
      return {
        confirmationId,
        detail: voiceConfirmationDetail(plan.intent),
        outcome: "confirmation-required",
        transcript
      };
    }

    return this.#executePlan(plan, transcript, signal);
  }

  async confirm(
    value: unknown,
    signal?: AbortSignal
  ): Promise<VoiceCommandSessionResult> {
    this.#removeExpired();
    const confirmationId = normalizedConfirmationId(value);
    const pending = confirmationId === null ? undefined : this.#pending.get(confirmationId);
    if (confirmationId === null || pending === undefined) {
      return {
        detail: "That voice confirmation expired. Hold the microphone and try again.",
        outcome: "failed"
      };
    }

    this.#pending.delete(confirmationId);
    const authorityBeforeContext = await this.#readAuthorityKey(signal);
    if (
      authorityBeforeContext === null ||
      !Object.is(pending.authorityKey, authorityBeforeContext)
    ) {
      return this.#authorityChangedResult();
    }
    const freshPlan = planVoiceCommand(pending.intent, await this.#getContext());
    signal?.throwIfAborted();
    const authorityAfterContext = await this.#readAuthorityKey(signal);
    if (
      authorityAfterContext === null ||
      !Object.is(pending.authorityKey, authorityAfterContext)
    ) {
      return this.#authorityChangedResult();
    }
    return this.#executePlan(
      freshPlan.kind === "resolve-media"
        ? { ...freshPlan, confirmationRequired: false }
        : freshPlan,
      undefined,
      signal
    );
  }

  cancel(value: unknown): boolean {
    this.#removeExpired();
    const confirmationId = normalizedConfirmationId(value);
    return confirmationId !== null && this.#pending.delete(confirmationId);
  }

  #authorityChangedResult(transcript?: string): VoiceCommandSessionResult {
    return {
      detail: "The TV profile or service access changed. Ask again before starting playback.",
      outcome: "failed",
      ...(transcript === undefined ? {} : { transcript })
    };
  }

  async #executePlan(
    plan: VoiceCommandPlan,
    transcript?: string,
    signal?: AbortSignal
  ): Promise<VoiceCommandSessionResult> {
    signal?.throwIfAborted();
    const result = signal === undefined
      ? await this.#execute(plan)
      : await this.#execute(plan, signal);
    signal?.throwIfAborted();
    return {
      ...(result.choices === undefined ? {} : { choices: result.choices }),
      detail: result.detail,
      outcome: result.handled ? "completed" : "failed",
      ...(transcript === undefined ? {} : { transcript })
    };
  }

  #removeExpired(): void {
    const now = this.#now();
    for (const [confirmationId, pending] of this.#pending) {
      if (pending.expiresAt <= now) {
        this.#pending.delete(confirmationId);
      }
    }
  }

  async #readAuthorityKey(
    signal?: AbortSignal
  ): Promise<VoiceConfirmationAuthorityKey | null> {
    signal?.throwIfAborted();
    if (this.#getAuthorityKey === undefined) return null;
    const value = await this.#getAuthorityKey();
    signal?.throwIfAborted();
    if (typeof value === "string") return value;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
}
