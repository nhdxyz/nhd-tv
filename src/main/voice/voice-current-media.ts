import type { VoiceCurrentMediaIntent } from "./voice-intent";

export interface VoiceCurrentMediaSnapshot {
  album: string | null;
  artist: string | null;
  backgrounded: boolean;
  durationSeconds: number | null;
  fullscreen: boolean;
  mediaKind: "audio" | "video";
  observedAt: number;
  playbackState: "ended" | "paused" | "playing" | "unknown";
  positionSeconds: number | null;
  serviceId: string;
  serviceName: string;
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

function remainingSeconds(snapshot: VoiceCurrentMediaSnapshot): number | null {
  const duration = snapshot.durationSeconds;
  const position = snapshot.positionSeconds;
  if (
    duration === null ||
    position === null ||
    !Number.isFinite(duration) ||
    !Number.isFinite(position) ||
    duration <= 0 ||
    position < 0
  ) {
    return null;
  }
  return Math.max(0, Math.round(duration - Math.min(position, duration)));
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
    return {
      detail: subtitle === null
        ? `You're watching ${title}${serviceSuffix(snapshot)}, but the episode is not available.`
        : `You're watching ${title} — ${subtitle}${serviceSuffix(snapshot)}.`,
      handled: true
    };
  }

  const remaining = remainingSeconds(snapshot);
  if (remaining === null) {
    return {
      detail: "The current media does not report a fixed ending time.",
      handled: true
    };
  }
  if (action === "time-remaining") {
    return {
      detail: remaining === 0
        ? "This is at the end."
        : `There ${durationIsSingular(remaining) ? "is" : "are"} about ${durationDetail(remaining)} left.`,
      handled: true
    };
  }

  const now = options.now ?? Date.now;
  const formatTime = options.formatTime ?? defaultFormatTime;
  return {
    detail: remaining === 0
      ? "This is at the end."
      : `It should finish around ${formatTime(now() + remaining * 1_000)}.`,
    handled: true
  };
}
