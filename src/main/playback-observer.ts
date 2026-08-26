import type { ServiceDefinition } from "./security/navigation-policy";

const MINIMUM_DURATION_SECONDS = 60;
const MINIMUM_ENGAGEMENT_SECONDS = 5;
const MINIMUM_VISIBLE_VIDEO_AREA = 160 * 90;
const MAX_METADATA_LENGTH = 180;

export interface QualifiedPlaybackSnapshot {
  artworkUrl: string | null;
  currentTime: number;
  duration: number;
  ended: boolean;
  subtitle: string | null;
  title: string;
  url: string;
}

interface RawPlaybackSnapshot {
  artworkUrl?: unknown;
  currentTime?: unknown;
  duration?: unknown;
  ended?: unknown;
  hasError?: unknown;
  playedSeconds?: unknown;
  readyState?: unknown;
  subtitle?: unknown;
  title?: unknown;
  url?: unknown;
  visibleArea?: unknown;
}

function boundedText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length === 0 ? null : normalized.slice(0, MAX_METADATA_LENGTH);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function qualifyPlaybackSnapshot(value: unknown): QualifiedPlaybackSnapshot | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const snapshot = value as RawPlaybackSnapshot;
  if (
    !finiteNumber(snapshot.currentTime) ||
    !finiteNumber(snapshot.duration) ||
    !finiteNumber(snapshot.playedSeconds) ||
    !finiteNumber(snapshot.readyState) ||
    !finiteNumber(snapshot.visibleArea) ||
    typeof snapshot.url !== "string" ||
    snapshot.currentTime < 0 ||
    snapshot.duration < MINIMUM_DURATION_SECONDS ||
    snapshot.playedSeconds < MINIMUM_ENGAGEMENT_SECONDS ||
    snapshot.readyState < 2 ||
    snapshot.visibleArea < MINIMUM_VISIBLE_VIDEO_AREA ||
    snapshot.hasError === true
  ) {
    return null;
  }

  const rawTitle = boundedText(snapshot.title) ?? "";
  let subtitle = boundedText(snapshot.subtitle);
  let title = rawTitle;

  if (subtitle !== null && title === subtitle) {
    subtitle = null;
  } else if (subtitle !== null && title.includes(subtitle)) {
    title = title
      .replace(subtitle, "")
      .replace(/^[\s:·|–—-]+|[\s:·|–—-]+$/g, "")
      .trim();
  }

  const artworkUrl = typeof snapshot.artworkUrl === "string"
    ? snapshot.artworkUrl
    : null;

  return {
    artworkUrl,
    currentTime: Math.min(snapshot.currentTime, snapshot.duration),
    duration: snapshot.duration,
    ended: snapshot.ended === true,
    subtitle,
    title,
    url: snapshot.url
  };
}

export function buildPlaybackSnapshotScript(
  playback: NonNullable<ServiceDefinition["playback"]>
): string {
  const titleSelectors = JSON.stringify(playback.titleSelectors);
  const subtitleSelectors = JSON.stringify(playback.subtitleSelectors);

  return `(() => {
    const visibleVideo = (video) => {
      const style = getComputedStyle(video);
      const rect = video.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      return {
        area: width * height,
        visible: style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.05
      };
    };
    const videos = [...document.querySelectorAll("video")]
      .map((video) => ({ video, ...visibleVideo(video) }))
      .filter(({ video, area, visible }) =>
        visible &&
        area >= ${MINIMUM_VISIBLE_VIDEO_AREA} &&
        Number.isFinite(video.duration) &&
        video.duration >= ${MINIMUM_DURATION_SECONDS} &&
        video.readyState >= 2 &&
        video.error === null
      )
      .sort((left, right) => right.area - left.area);
    const candidate = videos[0];
    if (candidate === undefined) return null;
    const video = candidate.video;

    let playedSeconds = 0;
    try {
      for (let index = 0; index < video.played.length; index += 1) {
        playedSeconds += Math.max(0, video.played.end(index) - video.played.start(index));
      }
    } catch {
      return null;
    }

    const readText = (selectors) => {
      for (const selector of selectors) {
        try {
          const element = document.querySelector(selector);
          const value = element instanceof HTMLMetaElement
            ? element.content
            : element?.textContent;
          if (typeof value === "string" && value.trim().length > 0) {
            return value.replace(/\\s+/g, " ").trim();
          }
        } catch {}
      }
      return "";
    };

    const artworkCandidates = [
      document.querySelector('meta[property="og:image"]')?.getAttribute("content"),
      video.poster
    ];
    const artworkUrl = artworkCandidates.find((candidate) => {
      if (typeof candidate !== "string" || candidate.length === 0) return false;
      try { return new URL(candidate, location.href).protocol === "https:"; } catch { return false; }
    });

    return {
      artworkUrl: artworkUrl ? new URL(artworkUrl, location.href).toString() : null,
      currentTime: video.currentTime,
      duration: video.duration,
      ended: video.ended,
      hasError: video.error !== null,
      playedSeconds,
      readyState: video.readyState,
      subtitle: readText(${subtitleSelectors}),
      title: readText(${titleSelectors}),
      url: location.href,
      visibleArea: candidate.area
    };
  })()`;
}
