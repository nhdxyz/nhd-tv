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
  "set-volume",
  "stop",
  "unmute",
  "up",
  "volume-down",
  "volume-up"
] as const;

const VOICE_CONFIRMATION_ACTIONS = ["cancel", "confirm"] as const;
const VOICE_MEDIA_ACTIONS = ["lookup", "open", "play", "search"] as const;
const VOICE_MEDIA_REFERENCES = ["candidate", "current-media", "last-media"] as const;
const VOICE_SEMANTIC_CONTROL_ACTIONS = [
  "captions-off",
  "captions-on",
  "fullscreen-enter",
  "fullscreen-exit",
  "next",
  "previous",
  "restart",
  "repeat-all",
  "repeat-off",
  "repeat-one",
  "seek-absolute",
  "seek-relative",
  "set-playback-rate",
  "shuffle-off",
  "shuffle-on",
  "skip-ad",
  "skip-intro",
  "skip-recap"
] as const;
export const VOICE_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5] as const;
const VOICE_CURRENT_MEDIA_ACTIONS = [
  "duration",
  "end-time",
  "episode",
  "identity",
  "position",
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
const VOICE_PROVIDER_DESTINATIONS = ["library", "subscriptions"] as const;
const VOICE_RECENCY_VALUES = ["latest"] as const;
const VOICE_INTENT_KEYS = [
  "kind",
  "confirmationAction",
  "currentMediaAction",
  "controlAction",
  "semanticControlAction",
  "offsetSeconds",
  "positionSeconds",
  "playbackRate",
  "volumePercent",
  "mediaAction",
  "reference",
  "ordinal",
  "mediaType",
  "title",
  "creator",
  "season",
  "episode",
  "providerHint",
  "providerDestination",
  "recency"
] as const;

export type VoiceControlAction = (typeof VOICE_CONTROL_ACTIONS)[number];
export type VoiceConfirmationAction = (typeof VOICE_CONFIRMATION_ACTIONS)[number];
export type VoiceCurrentMediaAction = (typeof VOICE_CURRENT_MEDIA_ACTIONS)[number];
export type VoiceMediaAction = (typeof VOICE_MEDIA_ACTIONS)[number];
export type VoiceMediaReference = (typeof VOICE_MEDIA_REFERENCES)[number];
export type VoiceMediaType = (typeof VOICE_MEDIA_TYPES)[number];
export type VoicePlaybackRate = (typeof VOICE_PLAYBACK_RATES)[number];
export type VoiceProviderHint = (typeof VOICE_PROVIDER_HINTS)[number];
export type VoiceProviderDestination = (typeof VOICE_PROVIDER_DESTINATIONS)[number];
export type VoiceRecency = (typeof VOICE_RECENCY_VALUES)[number];
export type VoiceSemanticControlAction = (typeof VOICE_SEMANTIC_CONTROL_ACTIONS)[number];

export type VoiceControlIntent =
  | {
    action: Exclude<VoiceControlAction, "set-volume">;
    kind: "control";
  }
  | {
    action: "set-volume";
    kind: "control";
    volumePercent: number;
  };

/** A bare spoken decision for an already-pending confirmation question. */
export interface VoiceConfirmationIntent {
  action: VoiceConfirmationAction;
  kind: "confirmation";
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

const CONTEXTUAL_PLAYBACK_CONSENT = Symbol("contextual-playback-consent");

/** Marks an in-memory provider/media choice as explicit playback consent. */
export function markContextualPlaybackConsent(
  intent: VoiceMediaIntent
): VoiceMediaIntent {
  Object.defineProperty(intent, CONTEXTUAL_PLAYBACK_CONSENT, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false
  });
  return intent;
}

export function hasContextualPlaybackConsent(intent: VoiceMediaIntent): boolean {
  return (intent as VoiceMediaIntent & { [CONTEXTUAL_PLAYBACK_CONSENT]?: unknown })[
    CONTEXTUAL_PLAYBACK_CONSENT
  ] === true;
}

/** A follow-up action whose media target must be resolved from shared TV context. */
export interface VoiceMediaReferenceIntent {
  action: VoiceMediaAction;
  kind: "media-reference";
  ordinal: number | null;
  providerHint: VoiceProviderHint | null;
  reference: VoiceMediaReference;
}

/** A fixed, non-search provider page selected without model-supplied navigation data. */
export interface VoiceProviderDestinationIntent {
  destination: VoiceProviderDestination;
  kind: "provider-destination";
  providerHint: VoiceProviderHint | null;
}

/** A provider-aware playback operation with explicit, bounded parameters. */
export type VoiceSemanticControlIntent =
  | {
    action: "set-playback-rate";
    kind: "semantic-control";
    offsetSeconds: null;
    playbackRate: VoicePlaybackRate;
    positionSeconds: null;
  }
  | {
    action: "seek-relative";
    kind: "semantic-control";
    offsetSeconds: number;
    playbackRate: null;
    positionSeconds: null;
  }
  | {
    action: "seek-absolute";
    kind: "semantic-control";
    offsetSeconds: null;
    playbackRate: null;
    positionSeconds: number;
  }
  | {
    action: Exclude<
      VoiceSemanticControlAction,
      "seek-absolute" | "seek-relative" | "set-playback-rate"
    >;
    kind: "semantic-control";
    offsetSeconds: null;
    playbackRate: null;
    positionSeconds: null;
  };

export type VoiceIntent =
  | VoiceAppIntent
  | VoiceConfirmationIntent
  | VoiceControlIntent
  | VoiceCurrentMediaIntent
  | VoiceMediaIntent
  | VoiceMediaReferenceIntent
  | VoiceProviderDestinationIntent
  | VoiceSemanticControlIntent
  | VoiceUnknownIntent;

export const VOICE_INTENT_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    kind: {
      enum: [
        "app",
        "confirmation",
        "control",
        "current-media",
        "media",
        "media-reference",
        "provider-destination",
        "semantic-control",
        "unknown"
      ],
      type: "string"
    },
    confirmationAction: {
      anyOf: [
        { enum: VOICE_CONFIRMATION_ACTIONS, type: "string" },
        { type: "null" }
      ]
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
    semanticControlAction: {
      anyOf: [
        { enum: VOICE_SEMANTIC_CONTROL_ACTIONS, type: "string" },
        { type: "null" }
      ]
    },
    offsetSeconds: {
      anyOf: [{ maximum: 3_600, minimum: -3_600, type: "integer" }, { type: "null" }]
    },
    positionSeconds: {
      anyOf: [{ maximum: 86_400, minimum: 0, type: "integer" }, { type: "null" }]
    },
    playbackRate: {
      anyOf: [{ enum: VOICE_PLAYBACK_RATES, type: "number" }, { type: "null" }]
    },
    volumePercent: {
      anyOf: [{ maximum: 100, minimum: 0, type: "integer" }, { type: "null" }]
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
    providerDestination: {
      anyOf: [
        { enum: VOICE_PROVIDER_DESTINATIONS, type: "string" },
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

function boundedIntegerRange(value: unknown, minimum: number, maximum: number): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new TypeError("The voice intent contains an invalid number.");
  }
  return value as number;
}

function optionalPlaybackRate(value: unknown): VoicePlaybackRate | null {
  if (value === null) return null;
  if (VOICE_PLAYBACK_RATES.some((rate) => rate === value)) {
    return value as VoicePlaybackRate;
  }
  throw new TypeError("The voice intent contains an unsupported playback rate.");
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
      "confirmationAction",
      "currentMediaAction",
      "controlAction",
      "semanticControlAction",
      "offsetSeconds",
      "positionSeconds",
      "playbackRate",
      "volumePercent",
      "mediaAction",
      "reference",
      "ordinal",
      "mediaType",
      "creator",
      "season",
      "episode",
      "providerHint",
      "providerDestination",
      "recency"
    ])) {
      throw new TypeError("The voice app intent is inconsistent.");
    }
    return { kind: "app", title: boundedText(value.title, 160, false) };
  }

  if (value.kind === "confirmation") {
    if (
      !isOneOf(value.confirmationAction, VOICE_CONFIRMATION_ACTIONS) ||
      !allNull(value, VOICE_INTENT_KEYS.filter((key) =>
        key !== "kind" && key !== "confirmationAction"
      ))
    ) {
      throw new TypeError("The voice confirmation intent is inconsistent.");
    }
    return { action: value.confirmationAction, kind: "confirmation" };
  }

  if (value.kind === "control") {
    if (
      !isOneOf(value.controlAction, VOICE_CONTROL_ACTIONS) ||
      !allNull(value, [
        "confirmationAction",
        "currentMediaAction",
        "semanticControlAction",
        "offsetSeconds",
        "positionSeconds",
        "playbackRate",
        "mediaAction",
        "reference",
        "ordinal",
        "mediaType",
        "title",
        "creator",
        "season",
        "episode",
        "providerHint",
        "providerDestination",
        "recency"
      ])
    ) {
      throw new TypeError("The voice control intent is inconsistent.");
    }
    const volumePercent = boundedIntegerRange(value.volumePercent, 0, 100);
    if (value.controlAction === "set-volume") {
      if (volumePercent === null) {
        throw new TypeError("Absolute volume controls require a volume percent.");
      }
      return {
        action: "set-volume",
        kind: "control",
        volumePercent
      };
    }
    if (volumePercent !== null) {
      throw new TypeError("Only absolute volume controls may contain a volume percent.");
    }
    return { action: value.controlAction, kind: "control" };
  }

  if (value.kind === "current-media") {
    if (
      !isOneOf(value.currentMediaAction, VOICE_CURRENT_MEDIA_ACTIONS) ||
      !allNull(value, [
        "confirmationAction",
        "controlAction",
        "semanticControlAction",
        "offsetSeconds",
        "positionSeconds",
        "playbackRate",
        "volumePercent",
        "mediaAction",
        "reference",
        "ordinal",
        "mediaType",
        "title",
        "creator",
        "season",
        "episode",
        "providerHint",
        "providerDestination",
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
      "confirmationAction",
      "currentMediaAction",
      "controlAction",
      "semanticControlAction",
      "offsetSeconds",
      "positionSeconds",
      "playbackRate",
      "volumePercent",
      "mediaType",
      "title",
      "creator",
      "season",
      "episode",
      "providerDestination",
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

  if (value.kind === "provider-destination") {
    if (!allNull(value, VOICE_INTENT_KEYS.filter((key) =>
      key !== "kind" && key !== "providerHint" && key !== "providerDestination"
    ))) {
      throw new TypeError("The provider-destination voice intent is inconsistent.");
    }
    const destination = optionalOneOf(
      value.providerDestination,
      VOICE_PROVIDER_DESTINATIONS
    );
    const providerHint = optionalOneOf(value.providerHint, VOICE_PROVIDER_HINTS);
    if (destination === null) {
      throw new TypeError("The provider-destination voice intent is incomplete.");
    }
    return {
      destination,
      kind: "provider-destination",
      providerHint
    };
  }

  if (value.kind === "semantic-control") {
    if (!allNull(value, [
      "confirmationAction",
      "currentMediaAction",
      "controlAction",
      "volumePercent",
      "mediaAction",
      "reference",
      "ordinal",
      "mediaType",
      "title",
      "creator",
      "season",
      "episode",
      "providerHint",
      "providerDestination",
      "recency"
    ])) {
      throw new TypeError("The semantic-control voice intent is inconsistent.");
    }

    if (!isOneOf(value.semanticControlAction, VOICE_SEMANTIC_CONTROL_ACTIONS)) {
      throw new TypeError("The semantic-control voice intent is incomplete.");
    }
    const offsetSeconds = boundedIntegerRange(value.offsetSeconds, -3_600, 3_600);
    const positionSeconds = boundedIntegerRange(value.positionSeconds, 0, 86_400);
    const playbackRate = optionalPlaybackRate(value.playbackRate);
    if (value.semanticControlAction === "seek-relative") {
      if (
        offsetSeconds === null ||
        offsetSeconds === 0 ||
        positionSeconds !== null ||
        playbackRate !== null
      ) {
        throw new TypeError("Relative seeks require only a nonzero offset.");
      }
      return {
        action: "seek-relative",
        kind: "semantic-control",
        offsetSeconds,
        playbackRate: null,
        positionSeconds: null
      };
    } else if (value.semanticControlAction === "seek-absolute") {
      if (positionSeconds === null || offsetSeconds !== null || playbackRate !== null) {
        throw new TypeError("Absolute seeks require only a playback position.");
      }
      return {
        action: "seek-absolute",
        kind: "semantic-control",
        offsetSeconds: null,
        playbackRate: null,
        positionSeconds
      };
    } else if (value.semanticControlAction === "set-playback-rate") {
      if (playbackRate === null || offsetSeconds !== null || positionSeconds !== null) {
        throw new TypeError("Playback-rate controls require only an allowlisted rate.");
      }
      return {
        action: "set-playback-rate",
        kind: "semantic-control",
        offsetSeconds: null,
        playbackRate,
        positionSeconds: null
      };
    } else if (offsetSeconds !== null || positionSeconds !== null || playbackRate !== null) {
      throw new TypeError("Simple semantic controls cannot contain seek parameters.");
    }
    return {
      action: value.semanticControlAction,
      kind: "semantic-control",
      offsetSeconds: null,
      playbackRate: null,
      positionSeconds: null
    };
  }

  if (
    value.kind !== "media" ||
    value.confirmationAction !== null ||
    value.currentMediaAction !== null ||
    value.controlAction !== null ||
    value.semanticControlAction !== null ||
    value.offsetSeconds !== null ||
    value.positionSeconds !== null ||
    value.playbackRate !== null ||
    value.volumePercent !== null ||
    value.reference !== null ||
    value.ordinal !== null ||
    value.providerDestination !== null
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
