import type {
  VoicePresentationChoice,
  VoicePresentationPhase,
  VoicePresentationState
} from "../contracts";

export const MAX_VOICE_PRESENTATION_CHOICES = 3;
export const MAX_VOICE_PRESENTATION_CHOICE_ID_LENGTH = 96;
export const MAX_VOICE_PRESENTATION_CHOICE_PRIMARY_LENGTH = 120;
export const MAX_VOICE_PRESENTATION_CHOICE_SECONDARY_LENGTH = 160;
export const MAX_VOICE_PRESENTATION_DETAIL_LENGTH = 280;
export const MAX_VOICE_PRESENTATION_TRANSCRIPT_LENGTH = 320;

const UNSAFE_DISPLAY_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/gu;
const SAFE_OPAQUE_CHOICE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const CHOICE_KEYS = new Set(["id", "ordinal", "primaryLabel", "secondaryLabel"]);

export function sanitizeVoicePresentationText(
  value: unknown,
  maximumLength: number
): string | null {
  if (typeof value !== "string") return null;

  const normalized = value
    .normalize("NFC")
    .replace(UNSAFE_DISPLAY_CHARACTERS, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (normalized.length === 0) return null;

  const characters = Array.from(normalized);
  if (characters.length <= maximumLength) return normalized;
  return `${characters.slice(0, Math.max(0, maximumLength - 1)).join("")}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeOpaqueChoiceId(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_VOICE_PRESENTATION_CHOICE_ID_LENGTH ||
    !SAFE_OPAQUE_CHOICE_ID.test(value)
  ) {
    return null;
  }
  return value;
}

/**
 * Converts untrusted candidate-shaped values into a small display-only schema.
 * URLs, HTML payloads, and arbitrary candidate metadata cannot cross this boundary.
 */
export function sanitizeVoicePresentationChoices(
  value: unknown
): readonly VoicePresentationChoice[] {
  if (!Array.isArray(value)) return [];

  const choices: VoicePresentationChoice[] = [];
  const ids = new Set<string>();
  const ordinals = new Set<number>();
  for (const candidate of value.slice(0, MAX_VOICE_PRESENTATION_CHOICES)) {
    if (
      !isRecord(candidate) ||
      Object.keys(candidate).some((key) => !CHOICE_KEYS.has(key))
    ) {
      continue;
    }

    const id = sanitizeOpaqueChoiceId(candidate.id);
    const ordinal = candidate.ordinal;
    const primaryLabel = sanitizeVoicePresentationText(
      candidate.primaryLabel,
      MAX_VOICE_PRESENTATION_CHOICE_PRIMARY_LENGTH
    );
    if (
      id === null ||
      ids.has(id) ||
      (ordinal !== 1 && ordinal !== 2 && ordinal !== 3) ||
      ordinals.has(ordinal) ||
      primaryLabel === null
    ) {
      continue;
    }

    const secondaryLabel = sanitizeVoicePresentationText(
      candidate.secondaryLabel,
      MAX_VOICE_PRESENTATION_CHOICE_SECONDARY_LENGTH
    );
    const choice: VoicePresentationChoice = {
      id,
      ordinal,
      primaryLabel
    };
    if (secondaryLabel !== null) choice.secondaryLabel = secondaryLabel;
    choices.push(choice);
    ids.add(id);
    ordinals.add(ordinal);
  }
  return choices;
}

export function createVoicePresentationState(
  phase: VoicePresentationPhase,
  values: { choices?: unknown; detail?: unknown; transcript?: unknown } = {}
): VoicePresentationState {
  if (phase === "hidden") {
    return { detail: null, phase, transcript: null };
  }

  const detail = sanitizeVoicePresentationText(
    values.detail,
    MAX_VOICE_PRESENTATION_DETAIL_LENGTH
  );
  const transcript = phase === "transcript"
    ? sanitizeVoicePresentationText(
      values.transcript,
      MAX_VOICE_PRESENTATION_TRANSCRIPT_LENGTH
    )
    : null;

  const presentation: VoicePresentationState = { detail, phase, transcript };
  if (phase === "clarification") {
    const choices = sanitizeVoicePresentationChoices(values.choices);
    if (choices.length > 0) presentation.choices = choices;
  }
  return presentation;
}

export function remainingVoiceTranscriptDisplayMilliseconds(
  phase: VoicePresentationPhase,
  presentedAt: number,
  now: number,
  minimumMilliseconds: number
): number {
  if (
    phase !== "transcript" ||
    !Number.isFinite(presentedAt) ||
    !Number.isFinite(now) ||
    !Number.isFinite(minimumMilliseconds) ||
    minimumMilliseconds <= 0
  ) {
    return 0;
  }
  const elapsed = Math.max(0, now - presentedAt);
  return Math.max(0, minimumMilliseconds - elapsed);
}
