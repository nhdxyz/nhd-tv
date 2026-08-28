const VOICE_CONTROL_ACTIONS = [
  "back",
  "close-app",
  "down",
  "fast-forward",
  "home",
  "left",
  "mute",
  "next-track",
  "pause",
  "play-pause",
  "previous-track",
  "right",
  "resume",
  "rewind",
  "select",
  "stop",
  "unmute",
  "up",
  "volume-down",
  "volume-up"
] as const;

const VOICE_MEDIA_ACTIONS = ["lookup", "open", "play", "search"] as const;
const VOICE_MEDIA_REFERENCES = ["candidate", "current-media", "last-media"] as const;
const VOICE_CURRENT_MEDIA_ACTIONS = [
  "end-time",
  "episode",
  "identity",
  "song",
  "time-remaining"
] as const;
const VOICE_MEDIA_TYPES = [
  "album",
  "artist",
  "channel",
  "episode",
  "movie",
  "playlist",
  "recommendation",
  "show",
  "similar-title",
  "song",
  "title",
  "video"
] as const;
const VOICE_PROVIDER_HINTS = ["disney-plus", "netflix", "spotify", "youtube"] as const;
const VOICE_RECENCY_VALUES = ["latest"] as const;
const VOICE_INTENT_KEYS = [
  "kind",
  "currentMediaAction",
  "controlAction",
  "mediaAction",
  "reference",
  "ordinal",
  "mediaType",
  "title",
  "creator",
  "season",
  "episode",
  "providerHint",
  "recency"
] as const;

export type VoiceControlAction = (typeof VOICE_CONTROL_ACTIONS)[number];
export type VoiceCurrentMediaAction = (typeof VOICE_CURRENT_MEDIA_ACTIONS)[number];
export type VoiceMediaAction = (typeof VOICE_MEDIA_ACTIONS)[number];
export type VoiceMediaReference = (typeof VOICE_MEDIA_REFERENCES)[number];
export type VoiceMediaType = (typeof VOICE_MEDIA_TYPES)[number];
export type VoiceProviderHint = (typeof VOICE_PROVIDER_HINTS)[number];
export type VoiceRecency = (typeof VOICE_RECENCY_VALUES)[number];

export interface VoiceControlIntent {
  action: VoiceControlAction;
  kind: "control";
}

/** A read-only question about media already loaded on the TV. */
export interface VoiceCurrentMediaIntent {
  action: VoiceCurrentMediaAction;
  kind: "current-media";
}

export interface VoiceAppIntent {
  kind: "app";
  title: string;
}

export interface VoiceUnknownIntent {
  kind: "unknown";
}

export interface VoiceMediaIntent {
  action: VoiceMediaAction;
  creator: string | null;
  episode: number | null;
  kind: "media";
  mediaType: VoiceMediaType;
  providerHint: VoiceProviderHint | null;
  recency: VoiceRecency | null;
  season: number | null;
  title: string;
}

/** A follow-up action whose media target must be resolved from shared TV context. */
export interface VoiceMediaReferenceIntent {
  action: VoiceMediaAction;
  kind: "media-reference";
  ordinal: number | null;
  providerHint: VoiceProviderHint | null;
  reference: VoiceMediaReference;
}

export type VoiceIntent =
  | VoiceAppIntent
  | VoiceControlIntent
  | VoiceCurrentMediaIntent
  | VoiceMediaIntent
  | VoiceMediaReferenceIntent
  | VoiceUnknownIntent;

export const VOICE_INTENT_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    kind: {
      enum: ["app", "control", "current-media", "media", "media-reference", "unknown"],
      type: "string"
    },
    currentMediaAction: {
      anyOf: [
        { enum: VOICE_CURRENT_MEDIA_ACTIONS, type: "string" },
        { type: "null" }
      ]
    },
    controlAction: {
      anyOf: [
        { enum: VOICE_CONTROL_ACTIONS, type: "string" },
        { type: "null" }
      ]
    },
    mediaAction: {
      anyOf: [
        { enum: VOICE_MEDIA_ACTIONS, type: "string" },
        { type: "null" }
      ]
    },
    reference: {
      anyOf: [
        { enum: VOICE_MEDIA_REFERENCES, type: "string" },
        { type: "null" }
      ]
    },
    ordinal: { anyOf: [{ maximum: 10, minimum: 1, type: "integer" }, { type: "null" }] },
    mediaType: {
      anyOf: [
        { enum: VOICE_MEDIA_TYPES, type: "string" },
        { type: "null" }
      ]
    },
    title: { anyOf: [{ maxLength: 160, minLength: 1, type: "string" }, { type: "null" }] },
    creator: { anyOf: [{ maxLength: 120, minLength: 1, type: "string" }, { type: "null" }] },
    season: { anyOf: [{ maximum: 100, minimum: 1, type: "integer" }, { type: "null" }] },
    episode: { anyOf: [{ maximum: 1_000, minimum: 1, type: "integer" }, { type: "null" }] },
    providerHint: {
      anyOf: [
        { enum: VOICE_PROVIDER_HINTS, type: "string" },
        { type: "null" }
      ]
    },
    recency: {
      anyOf: [
        { enum: VOICE_RECENCY_VALUES, type: "string" },
        { type: "null" }
      ]
    }
  },
  required: VOICE_INTENT_KEYS,
  type: "object"
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return keys.length === VOICE_INTENT_KEYS.length &&
    VOICE_INTENT_KEYS.every((key) => Object.hasOwn(value, key));
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.some((candidate) => candidate === value);
}

function optionalOneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (value === null) {
    return null;
  }
  if (isOneOf(value, allowed)) {
    return value;
  }
  throw new TypeError("The voice intent contains an unsupported enum value.");
}

function boundedInteger(value: unknown, maximum: number): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    throw new TypeError("The voice intent contains an invalid number.");
  }
  return value as number;
}

function boundedText(value: unknown, maximum: number, nullable: false): string;
function boundedText(value: unknown, maximum: number, nullable: true): string | null;
function boundedText(value: unknown, maximum: number, nullable: boolean): string | null {
  if (value === null && nullable) {
    return null;
  }
  if (typeof value !== "string") {
    throw new TypeError("The voice intent contains invalid text.");
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (
    normalized.length === 0 ||
    normalized.length > maximum ||
    normalized.includes("://")
  ) {
    throw new TypeError("The voice intent contains invalid text.");
  }
  return normalized;
}

function allNull(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => value[key] === null);
}

export function parseVoiceIntent(value: unknown): VoiceIntent {
  if (!isObject(value) || !hasExactKeys(value)) {
    throw new TypeError("The voice intent must contain exactly the allowlisted fields.");
  }

  if (value.kind === "app") {
    if (!allNull(value, [
      "currentMediaAction",
      "controlAction",
      "mediaAction",
      "reference",
      "ordinal",
      "mediaType",
      "creator",
      "season",
      "episode",
      "providerHint",
      "recency"
    ])) {
      throw new TypeError("The voice app intent is inconsistent.");
    }
    return { kind: "app", title: boundedText(value.title, 160, false) };
  }

  if (value.kind === "control") {
    if (
      !isOneOf(value.controlAction, VOICE_CONTROL_ACTIONS) ||
      !allNull(value, [
        "currentMediaAction",
        "mediaAction",
        "reference",
        "ordinal",
        "mediaType",
        "title",
        "creator",
        "season",
        "episode",
        "providerHint",
        "recency"
      ])
    ) {
      throw new TypeError("The voice control intent is inconsistent.");
    }
    return { action: value.controlAction, kind: "control" };
  }

  if (value.kind === "current-media") {
    if (
      !isOneOf(value.currentMediaAction, VOICE_CURRENT_MEDIA_ACTIONS) ||
      !allNull(value, [
        "controlAction",
        "mediaAction",
        "reference",
        "ordinal",
        "mediaType",
        "title",
        "creator",
        "season",
        "episode",
        "providerHint",
        "recency"
      ])
    ) {
      throw new TypeError("The current-media voice intent is inconsistent.");
    }
    return { action: value.currentMediaAction, kind: "current-media" };
  }

  if (value.kind === "unknown") {
    if (!allNull(value, VOICE_INTENT_KEYS.filter((key) => key !== "kind"))) {
      throw new TypeError("The unknown voice intent is inconsistent.");
    }
    return { kind: "unknown" };
  }

  if (value.kind === "media-reference") {
    if (!allNull(value, [
      "currentMediaAction",
      "controlAction",
      "mediaType",
      "title",
      "creator",
      "season",
      "episode",
      "recency"
    ])) {
      throw new TypeError("The media-reference voice intent is inconsistent.");
    }

    const action = optionalOneOf(value.mediaAction, VOICE_MEDIA_ACTIONS);
    const reference = optionalOneOf(value.reference, VOICE_MEDIA_REFERENCES);
    const ordinal = boundedInteger(value.ordinal, 10);
    const providerHint = optionalOneOf(value.providerHint, VOICE_PROVIDER_HINTS);
    if (action === null || reference === null) {
      throw new TypeError("The media-reference voice intent is incomplete.");
    }
    if (ordinal !== null && reference !== "candidate") {
      throw new TypeError("Only candidate references may contain an ordinal.");
    }
    return {
      action,
      kind: "media-reference",
      ordinal,
      providerHint,
      reference
    };
  }

  if (
    value.kind !== "media" ||
    value.currentMediaAction !== null ||
    value.controlAction !== null ||
    value.reference !== null ||
    value.ordinal !== null
  ) {
    throw new TypeError("The voice intent kind is invalid.");
  }

  const action = optionalOneOf(value.mediaAction, VOICE_MEDIA_ACTIONS);
  const mediaType = optionalOneOf(value.mediaType, VOICE_MEDIA_TYPES);
  if (action === null || mediaType === null) {
    throw new TypeError("The voice media intent is incomplete.");
  }

  const title = boundedText(value.title, 160, false);
  const creator = boundedText(value.creator, 120, true);
  const season = boundedInteger(value.season, 100);
  const episode = boundedInteger(value.episode, 1_000);
  const providerHint = optionalOneOf(value.providerHint, VOICE_PROVIDER_HINTS);
  const recency = optionalOneOf(value.recency, VOICE_RECENCY_VALUES);

  if (mediaType === "episode") {
    if (season === null || episode === null) {
      throw new TypeError("Episode intents require a season and episode number.");
    }
  } else if (season !== null || episode !== null) {
    throw new TypeError("Only episode intents may contain season or episode numbers.");
  }

  if (
    action !== "search" &&
    (["album", "artist", "playlist", "song"] as const).includes(
      mediaType as "album" | "artist" | "playlist" | "song"
    ) &&
    providerHint !== null &&
    providerHint !== "spotify"
  ) {
    throw new TypeError("Audio intents may only target Spotify.");
  }
  if (
    action !== "search" &&
    (mediaType === "channel" || mediaType === "video") &&
    providerHint !== null &&
    providerHint !== "youtube"
  ) {
    throw new TypeError("Video intents may only target YouTube.");
  }
  if (
    action !== "search" &&
    providerHint === "spotify" &&
    !(["album", "artist", "playlist", "song"] as const).includes(
      mediaType as "album" | "artist" | "playlist" | "song"
    )
  ) {
    throw new TypeError("Spotify may only receive audio intents.");
  }
  if (
    (mediaType === "recommendation" || mediaType === "similar-title") &&
    (action !== "open" ||
      creator !== null ||
      season !== null ||
      episode !== null ||
      recency !== null ||
      (providerHint !== null && providerHint !== "netflix"))
  ) {
    throw new TypeError("Recommendation intents may only open Netflix discovery results.");
  }
  if (recency !== null && (mediaType !== "video" || creator === null)) {
    throw new TypeError("Latest-media intents require a video creator or channel.");
  }

  return {
    action,
    creator,
    episode,
    kind: "media",
    mediaType,
    providerHint,
    recency,
    season,
    title
  };
}
