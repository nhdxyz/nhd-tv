import type { VoicePresentationChoice } from "../contracts";
import type { GoogleWatchResult } from "./google-watch-cache";
import { selectEnabledWatchOffer } from "./google-watch-selection";
import type { VoiceServiceId } from "./voice-command-router";
import type { VoiceCandidateInput, VoiceMediaType } from "./voice-context-store";
import type { VoiceMediaIntent } from "./voice-intent";

const MAX_CHOICES = 3;

export interface VoiceWatchClarification {
  candidates: readonly VoiceCandidateInput[];
  choices: readonly VoicePresentationChoice[];
}

function storedMediaType(intent: VoiceMediaIntent): VoiceMediaType {
  if (intent.mediaType === "episode" || intent.mediaType === "movie") {
    return intent.mediaType;
  }
  return "unknown";
}

/**
 * Builds numbered choices only for subscription/free providers that are both
 * enabled and launchable. Rental and purchase offers remain in the spoken
 * availability detail, but can never become a one-word playback choice.
 */
export function buildVoiceWatchClarification(
  result: GoogleWatchResult,
  intent: VoiceMediaIntent,
  enabledServiceIds: readonly VoiceServiceId[]
): VoiceWatchClarification | null {
  const seen = new Set<VoiceServiceId>();
  const available = enabledServiceIds.flatMap((serviceId) => {
    if (seen.has(serviceId)) return [];
    seen.add(serviceId);
    const selected = selectEnabledWatchOffer(result, [serviceId]);
    return selected === null ? [] : [selected];
  }).slice(0, MAX_CHOICES);
  if (available.length < 2) return null;

  const title = result.resolvedTitle ?? intent.title;
  const candidates: VoiceCandidateInput[] = [];
  const choices: VoicePresentationChoice[] = [];
  for (const [index, selected] of available.entries()) {
    const ordinal = (index + 1) as VoicePresentationChoice["ordinal"];
    const id = `watch-provider-${selected.serviceId}`;
    const provider = {
      id: selected.serviceId,
      name: selected.offer.providerName
    };
    candidates.push({
      id,
      identity: {
        episodeNumber: intent.mediaType === "episode" ? intent.episode : null,
        seasonNumber: intent.mediaType === "episode" ? intent.season : null,
        seriesTitle: intent.mediaType === "episode" ? title : null,
        subtitle: result.resolvedSubtitle,
        title
      },
      mediaType: storedMediaType(intent),
      provider
    });
    choices.push({
      id,
      ordinal,
      primaryLabel: selected.offer.providerName,
      secondaryLabel: "Enabled subscription"
    });
  }
  return { candidates, choices };
}
