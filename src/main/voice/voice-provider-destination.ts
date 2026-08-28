import type { VoiceProviderDestination } from "./voice-intent";

export type VoiceProviderDestinationServiceId = "spotify" | "youtube";

export interface VoiceProviderDestinationRoute {
  destination: VoiceProviderDestination;
  serviceId: VoiceProviderDestinationServiceId;
  url: string;
}

const PROVIDER_DESTINATION_ROUTES: Readonly<
  Record<VoiceProviderDestinationServiceId, Partial<Record<VoiceProviderDestination, string>>>
> = Object.freeze({
  spotify: Object.freeze({
    library: "https://open.spotify.com/collection/playlists"
  }),
  youtube: Object.freeze({
    library: "https://www.youtube.com/feed/you",
    subscriptions: "https://www.youtube.com/feed/subscriptions"
  })
});

export function isVoiceProviderDestinationServiceId(
  value: string
): value is VoiceProviderDestinationServiceId {
  return value === "spotify" || value === "youtube";
}

/** Returns only a compiled-in, provider-qualified route. */
export function voiceProviderDestinationRoute(
  serviceId: string,
  destination: VoiceProviderDestination
): VoiceProviderDestinationRoute | null {
  if (!isVoiceProviderDestinationServiceId(serviceId)) return null;
  const url = PROVIDER_DESTINATION_ROUTES[serviceId][destination];
  return url === undefined ? null : { destination, serviceId, url };
}

function canonicalPathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/**
 * Verifies where the provider actually landed after navigation. Query and
 * fragment state may be provider-owned, but origin and canonical path must
 * still equal the compiled-in destination.
 */
export function voiceProviderDestinationUrlMatches(
  candidate: unknown,
  route: VoiceProviderDestinationRoute
): boolean {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  try {
    const expected = new URL(route.url);
    const actual = new URL(candidate);
    return actual.protocol === "https:" &&
      actual.username === "" &&
      actual.password === "" &&
      actual.origin === expected.origin &&
      canonicalPathname(actual.pathname) === canonicalPathname(expected.pathname);
  } catch {
    return false;
  }
}
