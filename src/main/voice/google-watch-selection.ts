import type { VoiceServiceId } from "./voice-command-router";
import type { GoogleWatchOffer, GoogleWatchResult } from "./google-watch-cache";

export interface SelectedWatchOffer {
  offer: GoogleWatchOffer;
  serviceId: VoiceServiceId;
}

export function watchOfferServiceId(offer: GoogleWatchOffer): VoiceServiceId | null {
  if (offer.providerHost === "netflix.com" || offer.providerHost === "www.netflix.com") {
    return "netflix";
  }
  if (offer.providerHost === "youtube.com" || offer.providerHost === "www.youtube.com") {
    return "youtube";
  }
  return null;
}

export function selectEnabledWatchOffer(
  result: GoogleWatchResult,
  enabledServiceIds: readonly VoiceServiceId[]
): SelectedWatchOffer | null {
  for (const serviceId of enabledServiceIds) {
    const offer = result.offers.find((candidate) => watchOfferServiceId(candidate) === serviceId);
    if (offer !== undefined) return { offer, serviceId };
  }
  return null;
}

function offerDescription(
  offer: GoogleWatchOffer,
  enabledServiceIds: readonly VoiceServiceId[]
): string {
  const serviceId = watchOfferServiceId(offer);
  const enabled = serviceId !== null && enabledServiceIds.includes(serviceId);
  const cost = offer.priceText === null ? "" : ` ${offer.priceText}`;
  return `${offer.providerName}${cost}${enabled ? " (enabled)" : ""}`;
}

export function watchAvailabilityDetail(
  result: GoogleWatchResult,
  enabledServiceIds: readonly VoiceServiceId[]
): string {
  const title = result.resolvedTitle ?? result.queryText;
  const providers = result.offers
    .slice(0, 8)
    .map((offer) => offerDescription(offer, enabledServiceIds));
  if (providers.length === 0) return `No watch providers were found for ${title}.`;
  const hasEnabled = result.offers.some((offer) => {
    const serviceId = watchOfferServiceId(offer);
    return serviceId !== null && enabledServiceIds.includes(serviceId);
  });
  return hasEnabled
    ? `${title} is available on ${providers.join(", ")}.`
    : `${title} is available on ${providers.join(", ")}, but none are enabled in this profile.`;
}
