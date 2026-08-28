import type { VoicePresentationState } from "../main/contracts";

export interface VoicePresentationCopy {
  copy: string;
  label: string;
}

export function voicePresentationCopy(
  presentation: VoicePresentationState
): VoicePresentationCopy {
  if (presentation.phase === "hidden") return { copy: "", label: "AI Voice" };
  if (presentation.phase === "listening") {
    return { copy: presentation.detail ?? "Listening…", label: "AI Voice" };
  }
  if (presentation.phase === "understanding") {
    return { copy: presentation.detail ?? "Understanding…", label: "AI Voice" };
  }
  if (presentation.phase === "transcript") {
    return {
      copy: presentation.transcript === null ? "I couldn't hear that." : `“${presentation.transcript}”`,
      label: presentation.detail ?? "You said"
    };
  }
  if (presentation.phase === "error") {
    return { copy: presentation.detail ?? "That didn't work. Try again.", label: "Try again" };
  }
  return { copy: presentation.detail ?? "Command complete.", label: "Done" };
}
