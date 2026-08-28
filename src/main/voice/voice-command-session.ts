import { randomBytes } from "node:crypto";
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
  detail: string;
  handled: boolean;
}

export interface VoiceCommandSessionResult {
  confirmationId?: string;
  detail: string;
  outcome: "completed" | "confirmation-required" | "failed";
  transcript?: string;
}

export interface VoiceCommandSessionOptions {
  execute: (plan: VoiceCommandPlan, signal?: AbortSignal) =>
    VoiceCommandExecutionResult |
    Promise<VoiceCommandExecutionResult>;
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
  readonly #getContext: VoiceCommandSessionOptions["getContext"];
  readonly #now: () => number;
  readonly #onTranscript: NonNullable<VoiceCommandSessionOptions["onTranscript"]>;
  readonly #pending = new Map<string, PendingConfirmation>();
  readonly #randomToken: () => string;
  readonly #understand: VoiceCommandSessionOptions["understand"];

  constructor(options: VoiceCommandSessionOptions) {
    this.#execute = options.execute;
    this.#getContext = options.getContext;
    this.#now = options.now ?? Date.now;
    this.#onTranscript = options.onTranscript ?? (() => undefined);
    this.#randomToken = options.randomToken ?? (() => randomBytes(24).toString("base64url"));
    this.#understand = options.understand;
  }

  async process(
    clip: VoiceAudioClip,
    signal?: AbortSignal
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
    const plan = planVoiceCommand(intent, await this.#getContext());
    signal?.throwIfAborted();

    if (plan.kind === "resolve-media" && plan.confirmationRequired) {
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
    const freshPlan = planVoiceCommand(pending.intent, await this.#getContext());
    signal?.throwIfAborted();
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
}
