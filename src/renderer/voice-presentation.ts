import type { VoicePresentationState } from "../main/contracts";

export interface VoicePresentationCopy {
  copy: string;
  detail: string | null;
  label: string;
}

function clarificationInstruction(choiceCount: number): string {
  if (choiceCount <= 1) {
    return "Choose with the remote, or hold the mic again and say “the first one.”";
  }
  if (choiceCount === 2) {
    return "Choose with the remote, or say “the first one” or “the second one.”";
  }
  return "Choose with the remote, or say “the first one,” “the second one,” or “the third one.”";
}

export function voicePresentationCopy(
  presentation: VoicePresentationState
): VoicePresentationCopy {
  if (presentation.phase === "hidden") return { copy: "", detail: null, label: "Voice" };
  if (presentation.phase === "listening") {
    return {
      copy: presentation.detail ?? "Listening…",
      detail: "TV audio is muted until you release.",
      label: "Voice"
    };
  }
  if (presentation.phase === "understanding") {
    if (presentation.transcript !== null) {
      return {
        copy: `“${presentation.transcript}”`,
        detail: presentation.detail ?? "Understanding your request…",
        label: "Voice"
      };
    }
    return {
      copy: presentation.detail ?? "Understanding your request…",
      detail: null,
      label: "Voice"
    };
  }
  if (presentation.phase === "clarification") {
    return {
      copy: presentation.detail ?? "Which one did you mean?",
      detail: clarificationInstruction(presentation.choices?.length ?? 0),
      label: "Choose one"
    };
  }
  if (presentation.phase === "confirmation") {
    return {
      copy: presentation.detail ?? "Confirm on your phone.",
      detail: "Use the phone remote to continue or cancel.",
      label: "Confirm on phone"
    };
  }
  if (presentation.phase === "transcript") {
    return {
      copy: presentation.transcript === null ? "I couldn't hear that." : `“${presentation.transcript}”`,
      detail: null,
      label: presentation.detail ?? "You said"
    };
  }
  if (presentation.phase === "error") {
    return {
      copy: presentation.detail ?? "That didn't work. Try again.",
      detail: null,
      label: "Couldn’t complete"
    };
  }
  return { copy: presentation.detail ?? "Command complete.", detail: null, label: "Done" };
}
