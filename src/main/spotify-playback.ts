import type { MediaAction } from "./contracts";
import { isAllowedArtworkUrl } from "./security/navigation-policy";

const MAX_METADATA_LENGTH = 180;
const MAX_TRACK_DURATION_SECONDS = 24 * 60 * 60;

interface RawSpotifyPlaybackSnapshot {
  album?: unknown;
  artist?: unknown;
  artworkUrl?: unknown;
  durationSeconds?: unknown;
  playing?: unknown;
  positionSeconds?: unknown;
  signedIn?: unknown;
  title?: unknown;
}

export interface SpotifyPlaybackSnapshot {
  album: string | null;
  artist: string | null;
  artworkUrl: string | null;
  durationSeconds: number | null;
  playing: boolean;
  positionSeconds: number | null;
  signedIn: boolean;
  title: string | null;
}

function boundedText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length === 0 ? null : normalized.slice(0, MAX_METADATA_LENGTH);
}

function playbackSeconds(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_TRACK_DURATION_SECONDS
    ? value
    : null;
}

export function qualifySpotifyPlaybackSnapshot(
  value: unknown,
  artworkHosts: readonly string[]
): SpotifyPlaybackSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const snapshot = value as RawSpotifyPlaybackSnapshot;
  const durationSeconds = playbackSeconds(snapshot.durationSeconds);
  const rawPosition = playbackSeconds(snapshot.positionSeconds);
  const artworkUrl = typeof snapshot.artworkUrl === "string" &&
    isAllowedArtworkUrl(snapshot.artworkUrl, artworkHosts)
    ? snapshot.artworkUrl
    : null;

  return {
    album: boundedText(snapshot.album),
    artist: boundedText(snapshot.artist),
    artworkUrl,
    durationSeconds,
    playing: snapshot.playing === true,
    positionSeconds: rawPosition === null || durationSeconds === null
      ? rawPosition
      : Math.min(rawPosition, durationSeconds),
    signedIn: snapshot.signedIn === true,
    title: boundedText(snapshot.title)
  };
}

export function buildSpotifyPlaybackSnapshotScript(
  artworkHosts: readonly string[]
): string {
  return `(() => {
    const text = (selector) => {
      const value = document.querySelector(selector)?.textContent;
      return typeof value === "string" ? value.replace(/\\s+/g, " ").trim() : "";
    };
    const clockSeconds = (value) => {
      if (typeof value !== "string" || !/^\\d+(?::\\d{1,2}){1,2}$/.test(value.trim())) return null;
      const parts = value.trim().split(":").map(Number);
      if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
      return parts.reduce((seconds, part) => seconds * 60 + part, 0);
    };
    const mediaMetadata = navigator.mediaSession?.metadata ?? null;
    const artworkCandidates = [
      ...(Array.isArray(mediaMetadata?.artwork) ? [...mediaMetadata.artwork].reverse().map((item) => item?.src) : []),
      document.querySelector('[data-testid="now-playing-bar"] [data-testid="cover-art-image"]')?.getAttribute("src")
    ];
    const artworkUrl = artworkCandidates.find((candidate) => {
      if (typeof candidate !== "string" || candidate.length === 0) return false;
      try {
        const url = new URL(candidate, location.href);
        return url.protocol === "https:" && ${JSON.stringify(artworkHosts)}.some(
          (host) => url.hostname === host || url.hostname.endsWith("." + host)
        );
      } catch { return false; }
    }) ?? null;
    const playPause = document.querySelector('[data-testid="control-button-playpause"]');
    const playPauseLabel = playPause?.getAttribute("aria-label") ?? "";
    const title = mediaMetadata?.title || text('[data-testid="now-playing-widget"] [data-testid="context-item-info-title"]');
    const artist = mediaMetadata?.artist || text('[data-testid="now-playing-widget"] [data-testid="context-item-info-subtitles"]');
    return {
      album: mediaMetadata?.album || null,
      artist: artist || null,
      artworkUrl: artworkUrl === null ? null : new URL(artworkUrl, location.href).toString(),
      durationSeconds: clockSeconds(text('[data-testid="playback-duration"]')),
      playing: /^pause\\b/i.test(playPauseLabel) || navigator.mediaSession?.playbackState === "playing",
      positionSeconds: clockSeconds(text('[data-testid="playback-position"]')),
      signedIn: !(document.querySelector('[data-testid="login-button"]') instanceof HTMLElement),
      title: title || null
    };
  })()`;
}

export function buildSpotifyMediaActionScript(action: MediaAction): string | null {
  const selector = action === "play-pause"
    ? '[data-testid="control-button-playpause"]'
    : action === "rewind"
      ? '[data-testid="control-button-skip-back"]'
      : action === "fast-forward"
        ? '[data-testid="control-button-skip-forward"]'
        : null;
  if (selector === null) return null;

  return `(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!(control instanceof HTMLButtonElement) || control.disabled || control.getAttribute("aria-disabled") === "true") {
      return false;
    }
    control.click();
    return true;
  })()`;
}
