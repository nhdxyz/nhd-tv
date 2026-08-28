import type { VoiceServiceId } from "./voice-command-router";
import type { VoiceMediaIntent } from "./voice-intent";
import type { GoogleWatchOffer, GoogleWatchResult } from "./google-watch-cache";

export interface SelectedWatchOffer {
  offer: GoogleWatchOffer;
  serviceId: VoiceServiceId;
}

const WATCH_SERVICE_HOSTS: Readonly<Record<string, string>> = {
  "amazon.com": "prime-video",
  "app.plex.tv": "plex",
  "disneyplus.com": "disney-plus",
  "hulu.com": "hulu",
  "max.com": "hbo-max",
  "netflix.com": "netflix",
  "paramountplus.com": "paramount-plus",
  "peacocktv.com": "peacock",
  "play.max.com": "hbo-max",
  "primevideo.com": "prime-video",
  "tv.apple.com": "apple-tv",
  "www.disneyplus.com": "disney-plus",
  "www.amazon.com": "prime-video",
  "www.hulu.com": "hulu",
  "www.max.com": "hbo-max",
  "www.netflix.com": "netflix",
  "www.paramountplus.com": "paramount-plus",
  "www.peacocktv.com": "peacock",
  "www.primevideo.com": "prime-video",
  "www.youtube.com": "youtube",
  "youtube.com": "youtube"
};

const LAUNCHABLE_WATCH_SERVICES = new Set<VoiceServiceId>([
  "disney-plus",
  "netflix",
  "youtube"
]);

export function isLaunchableWatchOffer(offer: GoogleWatchOffer): boolean {
  if (offer.monetizationType === "subscription" || offer.monetizationType === "free") {
    return true;
  }
  // Netflix and Disney+ expose subscription-only playback destinations. Their
  // Google labels sometimes omit the word "subscription", so a price-free,
  // unclassified offer is still safe when that service is enabled. YouTube is
  // intentionally excluded because an unlabeled movie can still be rent/buy.
  return offer.monetizationType === null &&
    offer.priceText === null &&
    (watchOfferServiceId(offer) === "netflix" || watchOfferServiceId(offer) === "disney-plus");
}

function comparableTitle(value: string): string {
  const words = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .match(/[a-z0-9]+/g) ?? [];
  while (
    words.length > 1 &&
    /^(?:film|movie|series|show|tv)$/.test(words.at(-1) ?? "")
  ) {
    words.pop();
  }
  return words.join("").slice(0, 240);
}

function episodeCoordinatesMatch(
  subtitle: string,
  season: number,
  episode: number
): boolean {
  const normalized = subtitle.toLocaleLowerCase("en-US");
  const verbose = new RegExp(`season\\s*0*${season}\\D{0,24}episode\\s*0*${episode}(?:\\D|$)`, "i");
  const compact = new RegExp(`s\\s*0*${season}\\s*e\\s*0*${episode}(?:\\D|$)`, "i");
  return verbose.test(normalized) || compact.test(normalized);
}

export function googleWatchResultMatchesIntent(
  result: GoogleWatchResult,
  intent: VoiceMediaIntent
): boolean {
  const requestedTitle = comparableTitle(intent.title);
  const resolvedTitle = comparableTitle(result.resolvedTitle ?? "");
  if (
    requestedTitle.length === 0 ||
    resolvedTitle.length === 0 ||
    resolvedTitle !== requestedTitle
  ) {
    return false;
  }
  if (intent.mediaType !== "episode") return true;
  return intent.season !== null &&
    intent.episode !== null &&
    result.resolvedSubtitle !== null &&
    episodeCoordinatesMatch(result.resolvedSubtitle, intent.season, intent.episode);
}

export function watchOfferServiceId(offer: GoogleWatchOffer): string | null {
  return WATCH_SERVICE_HOSTS[offer.providerHost.toLocaleLowerCase("en-US")] ?? null;
}

export function watchOffersShouldBeComplete(
  intent: VoiceMediaIntent,
  _enabledServiceIds: readonly VoiceServiceId[]
): boolean {
  return intent.action === "lookup";
}

export function selectEnabledWatchOffer(
  result: GoogleWatchResult,
  enabledServiceIds: readonly VoiceServiceId[]
): SelectedWatchOffer | null {
  for (const serviceId of enabledServiceIds) {
    const offer = result.offers.find((candidate) =>
      LAUNCHABLE_WATCH_SERVICES.has(serviceId) &&
      watchOfferServiceId(candidate) === serviceId &&
      isLaunchableWatchOffer(candidate)
    );
    if (offer !== undefined) return { offer, serviceId };
  }
  return null;
}

export function watchOfferNavigationUrl(
  selected: SelectedWatchOffer,
  intent: VoiceMediaIntent,
  providerSearchUrl: string | null
): string {
  // A generic Netflix-series offer often points at one arbitrary episode.
  // Use Google to select Netflix, then let Netflix's own title page choose the
  // viewer's Resume/Continue target (or the first episode for a new viewer).
  return selected.serviceId === "netflix" &&
    intent.mediaType === "show" &&
    providerSearchUrl !== null
    ? providerSearchUrl
    : selected.offer.watchUrl;
}

export function watchOffersShouldExpand(
  result: Pick<GoogleWatchResult, "offersComplete">,
  selected: SelectedWatchOffer | null,
  enabledServiceIds: readonly VoiceServiceId[]
): boolean {
  if (result.offersComplete) return false;
  if (selected === null) return true;

  const preferredLaunchableService = enabledServiceIds.find((serviceId) =>
    LAUNCHABLE_WATCH_SERVICES.has(serviceId)
  );
  return preferredLaunchableService !== undefined &&
    preferredLaunchableService !== selected.serviceId;
}

function offerDescription(
  offer: GoogleWatchOffer,
  enabledServiceIds: readonly string[]
): string {
  const serviceId = watchOfferServiceId(offer);
  const subscribed = serviceId !== null &&
    enabledServiceIds.includes(serviceId) &&
    isLaunchableWatchOffer(offer);
  const cost = offer.priceText === null ? "" : ` ${offer.priceText}`;
  return `${offer.providerName}${cost}${subscribed ? " (subscribed)" : ""}`;
}

export function watchAvailabilityDetail(
  result: GoogleWatchResult,
  enabledServiceIds: readonly string[]
): string {
  const title = result.resolvedTitle ?? result.queryText;
  const providers = result.offers
    .slice(0, 8)
    .map((offer) => offerDescription(offer, enabledServiceIds));
  if (providers.length === 0) return `No watch providers were found for ${title}.`;
  const hasEnabled = result.offers.some((offer) => {
    const serviceId = watchOfferServiceId(offer);
    return serviceId !== null &&
      enabledServiceIds.includes(serviceId) &&
      isLaunchableWatchOffer(offer);
  });
  return hasEnabled
    ? `${title} is available on ${providers.join(", ")}.`
    : `${title} is available on ${providers.join(", ")}, but none are enabled in this profile.`;
}
