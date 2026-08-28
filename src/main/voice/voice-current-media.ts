import type { VoiceCurrentMediaIntent } from "./voice-intent";
import { qualifyObservedPlaybackRate } from "../observed-playback-rate";

const AUDIO_TIMING_FRESHNESS_MS = 5_000;
const VIDEO_TIMING_FRESHNESS_MS = 30_000;

export interface VoiceCurrentMediaSnapshot {
  album: string | null;
  artist: string | null;
  backgrounded: boolean;
  durationSeconds: number | null;
  episodeNumber: number | null;
  fullscreen: boolean;
  mediaKind: "audio" | "video";
  observedAt: number;
  playbackRate: number | null;
  playbackState: "ended" | "paused" | "playing" | "unknown";
  positionSeconds: number | null;
  serviceId: string;
  serviceName: string;
  seasonNumber: number | null;
  seriesTitle: string | null;
  subtitle: string | null;
  title: string | null;
}

export interface VoiceCurrentMediaAnswer {
  detail: string;
  handled: boolean;
}

interface AnswerOptions {
  formatTime?: (timestamp: number) => string;
  now?: () => number;
}

function cleanText(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length === 0 ? null : normalized;
}

function serviceSuffix(snapshot: VoiceCurrentMediaSnapshot): string {
  const name = cleanText(snapshot.serviceName);
  return name === null ? "" : ` on ${name}`;
}

function mediaIdentity(snapshot: VoiceCurrentMediaSnapshot): string | null {
  const title = cleanText(snapshot.title);
  if (title === null) return null;
  const suffix = serviceSuffix(snapshot);

  if (snapshot.mediaKind === "audio") {
    const artist = cleanText(snapshot.artist);
    return artist === null
      ? `You're listening to ${title}${suffix}.`
      : `You're listening to ${title} by ${artist}${suffix}.`;
  }

  const subtitle = cleanText(snapshot.subtitle);
  if (snapshot.serviceId === "youtube" && subtitle !== null) {
    return `You're watching ${title} by ${subtitle}${suffix}.`;
  }
  return subtitle === null
    ? `You're watching ${title}${suffix}.`
    : `You're watching ${title} — ${subtitle}${suffix}.`;
}

function wholeObservedSeconds(value: number | null, allowZero: boolean): number | null {
  if (
    value === null ||
    !Number.isFinite(value) ||
    value < 0 ||
    (!allowZero && value === 0)
  ) {
    return null;
  }
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded)) return null;
  return allowZero ? rounded : Math.max(1, rounded);
}

function naturalTimeDetail(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds} ${seconds === 1 ? "second" : "seconds"}`);
  }
  if (parts.length === 1) return parts[0] ?? "0 seconds";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts[0]}, ${parts[1]}, and ${parts[2]}`;
}

function timingFreshnessMs(snapshot: VoiceCurrentMediaSnapshot): number {
  return snapshot.mediaKind === "audio"
    ? AUDIO_TIMING_FRESHNESS_MS
    : VIDEO_TIMING_FRESHNESS_MS;
}

function observationAgeMilliseconds(
  snapshot: VoiceCurrentMediaSnapshot,
  nowMilliseconds: number
): number | null {
  if (
    !Number.isFinite(snapshot.observedAt) ||
    snapshot.observedAt < 0 ||
    !Number.isFinite(nowMilliseconds)
  ) {
    return null;
  }
  const age = nowMilliseconds - snapshot.observedAt;
  return age >= 0 && age <= timingFreshnessMs(snapshot) ? age : null;
}

interface EffectivePosition {
  playingTimingFresh: boolean;
  positionSeconds: number | null;
}

function effectivePosition(
  snapshot: VoiceCurrentMediaSnapshot,
  nowMilliseconds: number
): EffectivePosition {
  const rawPosition = snapshot.positionSeconds;
  if (rawPosition === null || !Number.isFinite(rawPosition) || rawPosition < 0) {
    return { playingTimingFresh: false, positionSeconds: null };
  }

  let positionSeconds = rawPosition;
  let playingTimingFresh = false;
  if (snapshot.playbackState === "playing") {
    const rate = qualifyObservedPlaybackRate(snapshot.playbackRate);
    const ageMilliseconds = observationAgeMilliseconds(snapshot, nowMilliseconds);
    if (rate !== null && ageMilliseconds !== null) {
      positionSeconds += ageMilliseconds / 1_000 * rate;
      playingTimingFresh = true;
    }
  }

  const duration = snapshot.durationSeconds;
  if (duration !== null && Number.isFinite(duration) && duration > 0) {
    positionSeconds = Math.min(positionSeconds, duration);
  }
  return { playingTimingFresh, positionSeconds };
}

function observedPositionSeconds(
  snapshot: VoiceCurrentMediaSnapshot,
  nowMilliseconds: number
): number | null {
  const position = wholeObservedSeconds(
    effectivePosition(snapshot, nowMilliseconds).positionSeconds,
    true
  );
  if (position === null) return null;
  const duration = wholeObservedSeconds(snapshot.durationSeconds, false);
  return duration === null ? position : Math.min(position, duration);
}

function observedDurationSeconds(snapshot: VoiceCurrentMediaSnapshot): number | null {
  return wholeObservedSeconds(snapshot.durationSeconds, false);
}

function remainingContentSeconds(
  snapshot: VoiceCurrentMediaSnapshot,
  positionSeconds: number | null
): number | null {
  const duration = snapshot.durationSeconds;
  if (
    duration === null ||
    positionSeconds === null ||
    !Number.isFinite(duration) ||
    !Number.isFinite(positionSeconds) ||
    duration <= 0 ||
    positionSeconds < 0
  ) {
    return null;
  }
  return Math.max(0, duration - Math.min(positionSeconds, duration));
}

function durationDetail(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${Math.max(1, totalSeconds)} ${totalSeconds === 1 ? "second" : "seconds"}`;
  }
  const totalMinutes = Math.ceil(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} ${totalMinutes === 1 ? "minute" : "minutes"}`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0
    ? `${hours} ${hours === 1 ? "hour" : "hours"}`
    : `${hours} ${hours === 1 ? "hour" : "hours"} and ${minutes} minutes`;
}

function durationIsSingular(totalSeconds: number): boolean {
  if (totalSeconds < 60) return totalSeconds === 1;
  const totalMinutes = Math.ceil(totalSeconds / 60);
  if (totalMinutes < 60) return totalMinutes === 1;
  return totalMinutes === 60;
}

function defaultFormatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

export function answerCurrentMediaQuestion(
  action: VoiceCurrentMediaIntent["action"],
  snapshot: VoiceCurrentMediaSnapshot | null,
  options: AnswerOptions = {}
): VoiceCurrentMediaAnswer {
  if (snapshot === null) {
    return {
      detail: "Nothing is playing right now.",
      handled: true
    };
  }

  if (action === "identity") {
    return {
      detail: mediaIdentity(snapshot) ?? `Something is open on ${snapshot.serviceName}, but its title is not available.`,
      handled: true
    };
  }

  if (action === "song") {
    if (snapshot.mediaKind !== "audio" || cleanText(snapshot.title) === null) {
      return {
        detail: "The current app is not reporting a song title.",
        handled: true
      };
    }
    return {
      detail: mediaIdentity(snapshot) ?? "The current app is not reporting a song title.",
      handled: true
    };
  }

  if (action === "episode") {
    const title = cleanText(snapshot.title);
    const subtitle = cleanText(snapshot.subtitle);
    if (snapshot.mediaKind !== "video" || title === null) {
      return {
        detail: "The current app is not reporting an episode.",
        handled: true
      };
    }
    const coordinates = snapshot.seasonNumber === null || snapshot.episodeNumber === null
      ? null
      : `season ${snapshot.seasonNumber}, episode ${snapshot.episodeNumber}`;
    const episodeDetail = subtitle ?? coordinates;
    return {
      detail: episodeDetail === null
        ? `You're watching ${title}${serviceSuffix(snapshot)}, but the episode is not available.`
        : subtitle === null
          ? `You're watching ${title}, ${episodeDetail}${serviceSuffix(snapshot)}.`
          : `You're watching ${title} — ${subtitle}${serviceSuffix(snapshot)}.`,
      handled: true
    };
  }

  if (action === "position") {
    const now = options.now ?? Date.now;
    const position = observedPositionSeconds(snapshot, now());
    if (position === null) {
      return {
        detail: "The current media is not reporting its playback position.",
        handled: true
      };
    }
    return {
      detail: position === 0
        ? "Playback is at the beginning."
        : `You're ${naturalTimeDetail(position)} into this.`,
      handled: true
    };
  }

  if (action === "duration") {
    const duration = observedDurationSeconds(snapshot);
    return duration === null
      ? {
        detail: "The current media does not report a total runtime.",
        handled: true
      }
      : {
        detail: `The total runtime is ${naturalTimeDetail(duration)}.`,
        handled: true
      };
  }

  if (snapshot.playbackState === "ended") {
    return { detail: "This is at the end.", handled: true };
  }

  const now = options.now ?? Date.now;
  const nowMilliseconds = now();
  const position = effectivePosition(snapshot, nowMilliseconds);
  const contentRemaining = remainingContentSeconds(snapshot, position.positionSeconds);
  if (action === "end-time" && snapshot.playbackState === "paused") {
    return {
      detail: "Playback is paused, so there isn't an end time yet.",
      handled: true
    };
  }
  if (action === "end-time" && snapshot.playbackState === "unknown") {
    return {
      detail: "I can't estimate an end time because the current playback state is unavailable.",
      handled: true
    };
  }
  if (contentRemaining === null) {
    return {
      detail: "The current media does not report a fixed ending time.",
      handled: true
    };
  }
  if (action === "time-remaining") {
    const contentSeconds = Math.max(0, Math.round(contentRemaining));
    if (contentSeconds === 0) {
      return { detail: "This is at the end.", handled: true };
    }
    if (snapshot.playbackState === "paused") {
      return {
        detail: `Playback is paused with about ${durationDetail(contentSeconds)} of content remaining.`,
        handled: true
      };
    }
    if (snapshot.playbackState === "unknown") {
      return {
        detail: `The app last reported about ${durationDetail(contentSeconds)} remaining, but its playback state is unavailable.`,
        handled: true
      };
    }
    const rate = qualifyObservedPlaybackRate(snapshot.playbackRate);
    if (rate === null) {
      return {
        detail: `About ${durationDetail(contentSeconds)} of content remains, but the current playback speed is unavailable.`,
        handled: true
      };
    }
    if (!position.playingTimingFresh) {
      return {
        detail: `The app last reported about ${durationDetail(contentSeconds)} of content remaining, but that timing is too old to estimate current playback time.`,
        handled: true
      };
    }
    const remaining = Math.max(0, Math.round(contentRemaining / rate));
    return {
      detail: remaining === 0
        ? "This is at the end."
        : `There ${durationIsSingular(remaining) ? "is" : "are"} about ${durationDetail(remaining)} left.`,
      handled: true
    };
  }

  const rate = qualifyObservedPlaybackRate(snapshot.playbackRate);
  if (rate === null) {
    return {
      detail: "I can't estimate an end time because the current playback speed is unavailable.",
      handled: true
    };
  }
  if (!position.playingTimingFresh) {
    return {
      detail: "I can't estimate an end time because the latest playback timing is too old.",
      handled: true
    };
  }
  const remaining = Math.max(0, Math.round(contentRemaining / rate));
  const formatTime = options.formatTime ?? defaultFormatTime;
  return {
    detail: remaining === 0
      ? "This is at the end."
      : `It should finish around ${formatTime(nowMilliseconds + remaining * 1_000)}.`,
    handled: true
  };
}
