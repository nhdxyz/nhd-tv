import type {
  VoicePresentationPhase,
  VoicePresentationState
} from "../contracts";

export const MAX_VOICE_PRESENTATION_DETAIL_LENGTH = 280;
export const MAX_VOICE_PRESENTATION_TRANSCRIPT_LENGTH = 320;

const UNSAFE_DISPLAY_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/gu;

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

export function createVoicePresentationState(
  phase: VoicePresentationPhase,
  values: { detail?: unknown; transcript?: unknown } = {}
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

  return { detail, phase, transcript };
}
