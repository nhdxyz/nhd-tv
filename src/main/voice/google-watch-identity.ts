import type { GoogleWatchResult } from "./google-watch-cache";

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

function episodeCoordinatesMatch(
  subtitle: string,
  season: number,
  episode: number
): boolean {
  const normalized = subtitle.toLocaleLowerCase("en-US");
  const verbose = new RegExp(
    `season\\s*0*${season}\\D{0,24}episode\\s*0*${episode}(?:\\D|$)`,
    "i"
  );
  const compact = new RegExp(`s\\s*0*${season}\\s*e\\s*0*${episode}(?:\\D|$)`, "i");
  return verbose.test(normalized) || compact.test(normalized);
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
  return expected.seasonNumber !== null &&
    expected.episodeNumber !== null &&
    result.resolvedSubtitle !== null &&
    episodeCoordinatesMatch(
      result.resolvedSubtitle,
      expected.seasonNumber,
      expected.episodeNumber
    );
}
