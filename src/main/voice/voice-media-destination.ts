import type { VoiceServiceId } from "./voice-command-router";
import type { VoiceMediaIntent } from "./voice-intent";

export interface VoiceMediaDestination {
  query: string;
  serviceId: VoiceServiceId;
}

function preferredService(intent: VoiceMediaIntent): VoiceServiceId {
  if (["album", "artist", "playlist", "song"].includes(intent.mediaType)) {
    return "spotify";
  }
  if (intent.mediaType === "channel" || intent.mediaType === "video") {
    return "youtube";
  }
  return intent.providerHint ?? "netflix";
}

export function voiceMediaSearchQuery(intent: VoiceMediaIntent): string {
  if (intent.recency === "latest" && intent.creator !== null) {
    // The provider-owned upload-date filter supplies the recency constraint.
    // Searching only for the creator avoids fan uploads whose title happens to
    // contain both the creator name and the word "latest".
    return intent.creator;
  }
  if (intent.mediaType === "channel") {
    return intent.creator ?? intent.title;
  }
  if (intent.creator !== null && intent.creator !== intent.title) {
    return `${intent.title} ${intent.creator}`;
  }
  return intent.title;
}

export function resolveVoiceMediaDestination(
  intent: VoiceMediaIntent,
  candidateServiceIds: readonly VoiceServiceId[]
): VoiceMediaDestination | null {
  if (candidateServiceIds.length === 0) {
    return null;
  }

  const preferred = preferredService(intent);
  const serviceId = candidateServiceIds.includes(preferred)
    ? preferred
    : candidateServiceIds[0];
  if (serviceId === undefined) {
    return null;
  }
  return { query: voiceMediaSearchQuery(intent), serviceId };
}
