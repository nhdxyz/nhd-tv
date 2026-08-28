import type { ServiceDefinition } from "./security/navigation-policy";
import { qualifyObservedPlaybackRate } from "./observed-playback-rate";

const MINIMUM_DURATION_SECONDS = 60;
const MINIMUM_ENGAGEMENT_SECONDS = 5;
const MINIMUM_VISIBLE_VIDEO_AREA = 160 * 90;
const MAX_METADATA_LENGTH = 180;
const PLAYBACK_ACTIVATION_KEY = "__nhdTvPlaybackActivationV1";
const PLAYBACK_ACTIVATION_MAX_AGE_MS = 10 * 60 * 1_000;

export interface QualifiedPlaybackSnapshot {
  artworkUrl: string | null;
  currentTime: number;
  duration: number;
  ended: boolean;
  subtitle: string | null;
  title: string;
  url: string;
}

export type LivePlaybackState = "ended" | "paused" | "playing" | "unknown";

/**
 * A URL-free view of the largest visible video. Unlike QualifiedPlaybackSnapshot,
 * this intentionally does not enforce Continue Watching's duration or engagement
 * thresholds so voice queries can describe new, short, and live media.
 */
export interface LivePlaybackSnapshot {
  currentTime: number | null;
  duration: number | null;
  playbackRate: number | null;
  playbackState: LivePlaybackState;
  subtitle: string | null;
  title: string | null;
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

interface RawLivePlaybackSnapshot {
  currentTime?: unknown;
  duration?: unknown;
  ended?: unknown;
  hasError?: unknown;
  paused?: unknown;
  playbackRate?: unknown;
  readyState?: unknown;
  subtitle?: unknown;
  title?: unknown;
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

function playbackMetadata(
  rawTitle: unknown,
  rawSubtitle: unknown
): { subtitle: string | null; title: string | null } {
  const boundedTitle = boundedText(rawTitle);
  let subtitle = boundedText(rawSubtitle);
  let title = boundedTitle;

  if (subtitle !== null && title === subtitle) {
    subtitle = null;
  } else if (subtitle !== null && title?.includes(subtitle)) {
    title = title
      .replace(subtitle, "")
      .replace(/^[\s:·|–—-]+|[\s:·|–—-]+$/g, "")
      .trim() || null;
  }

  return { subtitle, title };
}

export function qualifyLivePlaybackSnapshot(value: unknown): LivePlaybackSnapshot | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const snapshot = value as RawLivePlaybackSnapshot;
  if (
    !finiteNumber(snapshot.visibleArea) ||
    snapshot.visibleArea < MINIMUM_VISIBLE_VIDEO_AREA ||
    snapshot.hasError === true
  ) {
    return null;
  }

  const currentTime = finiteNumber(snapshot.currentTime) && snapshot.currentTime >= 0
    ? snapshot.currentTime
    : null;
  const duration = finiteNumber(snapshot.duration) && snapshot.duration > 0
    ? snapshot.duration
    : null;
  const { subtitle, title } = playbackMetadata(snapshot.title, snapshot.subtitle);
  const readyState = finiteNumber(snapshot.readyState) ? snapshot.readyState : 0;
  const playbackState: LivePlaybackState = snapshot.ended === true
    ? "ended"
    : snapshot.paused === true
      ? "paused"
      : snapshot.paused === false && readyState >= 2
        ? "playing"
        : "unknown";

  return {
    currentTime: currentTime === null || duration === null
      ? currentTime
      : Math.min(currentTime, duration),
    duration,
    playbackRate: qualifyObservedPlaybackRate(snapshot.playbackRate),
    playbackState,
    subtitle,
    title
  };
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

  const metadata = playbackMetadata(snapshot.title, snapshot.subtitle);

  const artworkUrl = typeof snapshot.artworkUrl === "string"
    ? snapshot.artworkUrl
    : null;

  return {
    artworkUrl,
    currentTime: Math.min(snapshot.currentTime, snapshot.duration),
    duration: snapshot.duration,
    ended: snapshot.ended === true,
    subtitle: metadata.subtitle,
    title: metadata.title ?? "",
    url: snapshot.url
  };
}

export function buildLivePlaybackSnapshotScript(
  playback: NonNullable<ServiceDefinition["playback"]>,
  serviceName = ""
): string {
  const titleSelectors = JSON.stringify(playback.titleSelectors);
  const subtitleSelectors = JSON.stringify(playback.subtitleSelectors);
  const normalizedServiceName = JSON.stringify(serviceName.trim().toLocaleLowerCase());

  return `(() => {
    const visibleArea = (video) => {
      const style = getComputedStyle(video);
      const rect = video.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      return style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0.05
        ? 0
        : width * height;
    };
    const candidate = [...document.querySelectorAll("video")]
      .map((video) => ({ area: visibleArea(video), video }))
      .filter(({ area, video }) => area >= ${MINIMUM_VISIBLE_VIDEO_AREA} && video.error === null)
      .sort((left, right) => right.area - left.area)[0];
    if (candidate === undefined) return null;
    const video = candidate.video;
    const readText = (selectors) => {
      for (const selector of selectors) {
        try {
          const element = document.querySelector(selector);
          const value = element instanceof HTMLMetaElement ? element.content : element?.textContent;
          if (typeof value === "string" && value.trim().length > 0) {
            return value.replace(/\\s+/g, " ").trim();
          }
        } catch {}
      }
      return "";
    };
    const activation = globalThis[${JSON.stringify(PLAYBACK_ACTIVATION_KEY)}];
    const recentActivation = activation &&
      typeof activation === "object" &&
      Number.isFinite(activation.updatedAt) &&
      Date.now() - activation.updatedAt <= ${PLAYBACK_ACTIVATION_MAX_AGE_MS}
      ? activation
      : null;
    const selectorTitle = readText(${titleSelectors});
    const activationTitle = typeof recentActivation?.title === "string" ? recentActivation.title : "";
    const title = selectorTitle.trim().toLocaleLowerCase() === ${normalizedServiceName} && activationTitle
      ? activationTitle
      : selectorTitle || activationTitle;
    return {
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : null,
      duration: Number.isFinite(video.duration) ? video.duration : null,
      ended: video.ended,
      hasError: video.error !== null,
      paused: video.paused,
      playbackRate: Number.isFinite(video.playbackRate) ? video.playbackRate : null,
      readyState: video.readyState,
      subtitle: readText(${subtitleSelectors}),
      title,
      visibleArea: candidate.area
    };
  })()`;
}

export function buildPlaybackSnapshotScript(
  playback: NonNullable<ServiceDefinition["playback"]>,
  serviceName = "",
  artworkHosts: readonly string[] = []
): string {
  const titleSelectors = JSON.stringify(playback.titleSelectors);
  const subtitleSelectors = JSON.stringify(playback.subtitleSelectors);
  const normalizedServiceName = JSON.stringify(serviceName.trim().toLocaleLowerCase());
  const allowedArtworkHosts = JSON.stringify(artworkHosts);

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

    const activation = globalThis[${JSON.stringify(PLAYBACK_ACTIVATION_KEY)}];
    const recentActivation = activation &&
      typeof activation === "object" &&
      Number.isFinite(activation.updatedAt) &&
      Date.now() - activation.updatedAt <= ${PLAYBACK_ACTIVATION_MAX_AGE_MS}
      ? activation
      : null;
    const artworkCandidates = [
      recentActivation?.artworkUrl,
      document.querySelector('meta[property="og:image"]')?.getAttribute("content"),
      video.poster
    ];
    const artworkUrl = artworkCandidates.find((candidate) => {
      if (typeof candidate !== "string" || candidate.length === 0) return false;
      try {
        const url = new URL(candidate, location.href);
        return url.protocol === "https:" && ${allowedArtworkHosts}.some(
          (host) => url.hostname === host || url.hostname.endsWith("." + host)
        );
      } catch { return false; }
    });
    const selectorTitle = readText(${titleSelectors});
    const activationTitle = typeof recentActivation?.title === "string"
      ? recentActivation.title
      : "";
    const title = selectorTitle.trim().toLocaleLowerCase() === ${normalizedServiceName} && activationTitle
      ? activationTitle
      : selectorTitle || activationTitle;

    return {
      artworkUrl: artworkUrl ? new URL(artworkUrl, location.href).toString() : null,
      currentTime: video.currentTime,
      duration: video.duration,
      ended: video.ended,
      hasError: video.error !== null,
      playedSeconds,
      readyState: video.readyState,
      subtitle: readText(${subtitleSelectors}),
      title,
      url: location.href,
      visibleArea: candidate.area
    };
  })()`;
}

export function buildPlaybackActivationTrackerScript(
  playbackPathPrefixes: readonly string[] = []
): string {
  const pathPrefixes = JSON.stringify(playbackPathPrefixes);

  return `(() => {
    const key = ${JSON.stringify(PLAYBACK_ACTIVATION_KEY)};
    const storageKey = key + ":session";
    const current = globalThis[key];
    if (current && typeof current === "object" && current.installed === true) return true;

    const restored = (() => {
      try {
        const parsed = JSON.parse(sessionStorage.getItem(storageKey) || "null");
        return parsed &&
          typeof parsed === "object" &&
          Number.isFinite(parsed.updatedAt) &&
          Date.now() - parsed.updatedAt <= ${PLAYBACK_ACTIVATION_MAX_AGE_MS}
          ? parsed
          : null;
      } catch {
        return null;
      }
    })();
    const state = {
      artworkUrl: typeof restored?.artworkUrl === "string" ? restored.artworkUrl : null,
      artworkPixelArea: Number.isFinite(restored?.artworkPixelArea)
        ? restored.artworkPixelArea
        : 0,
      installed: true,
      title: typeof restored?.title === "string" ? restored.title : null,
      updatedAt: Number.isFinite(restored?.updatedAt) ? restored.updatedAt : 0
    };
    globalThis[key] = state;

    const httpsUrl = (value) => {
      if (typeof value !== "string" || value.trim().length === 0) return null;
      const first = value.split(",").at(-1)?.trim().split(/\\s+/)[0] ?? "";
      try {
        const url = new URL(first, location.href);
        return url.protocol === "https:" ? url.toString() : null;
      } catch {
        return null;
      }
    };

    const backgroundUrls = (element) => {
      try {
        const value = getComputedStyle(element).backgroundImage;
        return [...value.matchAll(/url\\(["']?(.+?)["']?\\)/g)]
          .map((match) => httpsUrl(match[1]))
          .filter((url) => url !== null);
      } catch {
        return [];
      }
    };

    const visibleArea = (element) => {
      const rect = element.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      return width * height;
    };

    const imageUrl = (image) => httpsUrl(
      image.getAttribute("srcset") ||
      image.currentSrc ||
      image.getAttribute("src") ||
      image.getAttribute("data-src") ||
      image.getAttribute("srcset")
    );

    const imageCandidates = (element) => {
      const results = [];
      const images = element instanceof HTMLImageElement
        ? [element]
        : [...element.querySelectorAll("img")];
      for (const image of images) {
        results.push({
          area: visibleArea(image),
          pixelArea: Math.max(0, image.naturalWidth * image.naturalHeight),
          title: image.alt || null,
          url: imageUrl(image)
        });
      }
      for (const source of element.querySelectorAll("picture source")) {
        const picture = source.closest("picture");
        results.push({
          area: picture === null ? 0 : visibleArea(picture),
          pixelArea: 0,
          title: null,
          url: httpsUrl(source.getAttribute("srcset"))
        });
      }
      return results;
    };

    const candidateFrom = (start) => {
      let element = start;
      for (let depth = 0; element instanceof Element && depth < 10; depth += 1) {
        const candidates = imageCandidates(element);
        for (const url of backgroundUrls(element)) {
          candidates.push({ area: visibleArea(element), pixelArea: 0, title: null, url });
        }
        for (const child of element.querySelectorAll('[style*="background"], [class*="image"], [class*="artwork"], [class*="boxart"], [class*="tracked-card"], [class*="standard-card"], [class*="continue-watching-card"], [data-uia*="card"]')) {
          candidates.push(...imageCandidates(child));
          for (const url of backgroundUrls(child)) {
            candidates.push({ area: visibleArea(child), pixelArea: 0, title: null, url });
          }
        }

        const best = candidates
          .filter((candidate) => candidate.url !== null && candidate.area >= 80 * 45)
          .sort((left, right) =>
            Math.max(right.area, right.pixelArea) - Math.max(left.area, left.pixelArea)
          )[0];
        if (best !== undefined) {
          const labelled = element.closest('[aria-label], [title]');
          const title = labelled?.getAttribute("aria-label") ||
            labelled?.getAttribute("title") ||
            best.title ||
            null;
          return { artworkPixelArea: best.pixelArea, artworkUrl: best.url, title };
        }
        element = element.parentElement;
      }
      return null;
    };

    const remember = (target) => {
      if (${pathPrefixes}.some((prefix) => location.pathname.startsWith(prefix))) return;
      const candidate = target instanceof Element ? candidateFrom(target) : null;
      if (candidate === null) return;
      if (state.artworkUrl === null || candidate.artworkPixelArea >= state.artworkPixelArea) {
        state.artworkUrl = candidate.artworkUrl;
        state.artworkPixelArea = candidate.artworkPixelArea;
      }
      const title = typeof candidate.title === "string"
        ? candidate.title.replace(/\\s+/g, " ").trim().slice(0, ${MAX_METADATA_LENGTH})
        : "";
      if (title) state.title = title;
      state.updatedAt = Date.now();
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({
          artworkUrl: state.artworkUrl,
          artworkPixelArea: state.artworkPixelArea,
          title: state.title,
          updatedAt: state.updatedAt
        }));
      } catch {}
    };

    const rememberVisibleDetail = () => {
      const roots = [...document.querySelectorAll(
        '[role="dialog"], [data-uia*="modal"], [class*="previewModal"], [class*="detail-modal"]'
      )].filter((element) => visibleArea(element) >= 240 * 135);
      const best = roots
        .map((element) => ({ area: visibleArea(element), element }))
        .sort((left, right) => right.area - left.area)[0];
      if (best !== undefined) remember(best.element);
    };

    const rememberWithDetail = (target) => {
      remember(target);
      setTimeout(rememberVisibleDetail, 180);
      setTimeout(rememberVisibleDetail, 600);
    };

    document.addEventListener("focusin", (event) => remember(event.target), true);
    document.addEventListener("pointerdown", (event) => rememberWithDetail(event.target), true);
    document.addEventListener("click", (event) => rememberWithDetail(event.target), true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") rememberWithDetail(document.activeElement);
    }, true);
    return true;
  })()`;
}
