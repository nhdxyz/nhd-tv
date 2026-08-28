export const MIN_OBSERVED_PLAYBACK_RATE = 0.25;
export const MAX_OBSERVED_PLAYBACK_RATE = 4;

/** Accepts only a conservative, finite HTML-media playback-rate observation. */
export function qualifyObservedPlaybackRate(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_OBSERVED_PLAYBACK_RATE &&
    value <= MAX_OBSERVED_PLAYBACK_RATE
    ? value
    : null;
}
