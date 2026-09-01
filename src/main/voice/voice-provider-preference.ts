export interface VoiceProviderPreference {
  detail: string;
  serviceId: string;
}

/**
 * Uses only user-owned or live-TV signals. The model never decides provider
 * priority and an un-favorited background app never outranks a favorite.
 */
export function chooseVoiceProviderPreference(
  offeredServiceIds: readonly string[],
  favoriteServiceIds: readonly string[],
  serviceOrder: readonly string[],
  activeServiceId: string | null
): VoiceProviderPreference | null {
  const offered = new Set(offeredServiceIds);
  const favorites = new Set(favoriteServiceIds);
  const orderedFavorites = [...serviceOrder, ...favoriteServiceIds]
    .filter((serviceId, index, values) =>
      values.indexOf(serviceId) === index && offered.has(serviceId) && favorites.has(serviceId)
    );
  const favorite = orderedFavorites[0];
  if (favorite !== undefined) {
    return {
      detail: "I used your highest-ranked favorite app.",
      serviceId: favorite
    };
  }
  if (activeServiceId !== null && offered.has(activeServiceId)) {
    return {
      detail: "I used the app that was already open.",
      serviceId: activeServiceId
    };
  }
  return null;
}

export function prioritizeVoiceProvider<T extends string>(
  serviceIds: readonly T[],
  preferredServiceId: string | null
): T[] {
  const preferred = preferredServiceId === null
    ? undefined
    : serviceIds.find((serviceId) => serviceId === preferredServiceId);
  if (preferred === undefined) {
    return [...serviceIds];
  }
  return [preferred, ...serviceIds.filter((serviceId) => serviceId !== preferred)];
}
