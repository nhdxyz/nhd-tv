import type { VoiceServiceId } from "./voice-command-router";
import type { VoiceMediaIntent } from "./voice-intent";

export interface VoiceMediaDestination {
  query: string;
  serviceId: VoiceServiceId;
}

export function isVoiceDiscoveryIntent(intent: VoiceMediaIntent): boolean {
  return intent.mediaType === "recommendation" || intent.mediaType === "similar-title";
}

export function voiceDiscoveryOpenedDetail(
  intent: VoiceMediaIntent,
  serviceName: string
): string | null {
  if (intent.mediaType === "recommendation") {
    return `Searched ${serviceName} for ${intent.title}.`;
  }
  if (intent.mediaType === "similar-title") {
    return `Searched ${serviceName} for titles related to ${intent.title}.`;
  }
  return null;
}

function preferredService(intent: VoiceMediaIntent): VoiceServiceId {
  if (isVoiceDiscoveryIntent(intent)) {
    return "netflix";
  }
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
    : intent.action === "search"
      ? candidateServiceIds[0]
      : undefined;
  if (serviceId === undefined) {
    return null;
  }
  return { query: voiceMediaSearchQuery(intent), serviceId };
}
