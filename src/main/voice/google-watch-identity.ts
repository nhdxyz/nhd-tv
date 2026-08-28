import type { GoogleWatchResult } from "./google-watch-cache";
import { parseVoiceEpisodeCoordinates } from "./voice-episode-metadata";

export interface GoogleWatchIdentityExpectation {
  episodeNumber: number | null;
  mediaType: string;
  requestedTitle: string;
  seasonNumber: number | null;
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

/** Rejects a Google panel unless it independently identifies the requested media. */
export function googleWatchResultMatchesIdentity(
  result: Pick<GoogleWatchResult, "resolvedSubtitle" | "resolvedTitle">,
  expected: GoogleWatchIdentityExpectation
): boolean {
  const requestedTitle = comparableTitle(expected.requestedTitle);
  const resolvedTitle = comparableTitle(result.resolvedTitle ?? "");
  if (
    requestedTitle.length === 0 ||
    resolvedTitle.length === 0 ||
    resolvedTitle !== requestedTitle
  ) {
    return false;
  }
  if (expected.mediaType !== "episode") return true;
  const coordinates = parseVoiceEpisodeCoordinates(result.resolvedSubtitle);
  return coordinates !== null &&
    expected.seasonNumber === coordinates.seasonNumber &&
    expected.episodeNumber === coordinates.episodeNumber;
}
