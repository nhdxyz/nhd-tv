export interface VoiceEpisodeCoordinates {
  episodeNumber: number;
  seasonNumber: number;
}

const EPISODE_PATTERNS = [
  /\bseason\s*0*(\d{1,3})\b.{0,32}?\bepisode\s*0*(\d{1,4})\b/i,
  /\bs\s*0*(\d{1,3})\s*[:.\-]?\s*e\s*0*(\d{1,4})\b/i
] as const;

/** Extracts only explicit, bounded season/episode coordinates from provider text. */
export function parseVoiceEpisodeCoordinates(
  value: string | null | undefined
): VoiceEpisodeCoordinates | null {
  const text = value?.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 240) ?? "";
  if (text.length === 0) return null;
  for (const pattern of EPISODE_PATTERNS) {
    const match = pattern.exec(text);
    if (match === null) continue;
    const seasonNumber = Number(match[1]);
    const episodeNumber = Number(match[2]);
    if (
      Number.isSafeInteger(seasonNumber) &&
      Number.isSafeInteger(episodeNumber) &&
      seasonNumber > 0 &&
      episodeNumber > 0
    ) {
      return { episodeNumber, seasonNumber };
    }
  }
  return null;
}
