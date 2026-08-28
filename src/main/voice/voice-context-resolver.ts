import {
  VoiceContextStore,
  type VoiceContextCandidate,
  type VoiceContextSnapshot,
  type VoiceMediaReference as StoredVoiceMediaReference,
  type VoiceMediaReferenceInput,
  type VoiceMediaTargetInvalidation,
  type VoiceMediaType as StoredVoiceMediaType,
  type VoiceProviderReference
} from "./voice-context-store";
import type {
  VoiceControlIntent,
  VoiceIntent,
  VoiceMediaIntent,
  VoiceMediaReferenceIntent,
  VoiceMediaType,
  VoiceProviderHint,
  VoiceUnknownIntent
} from "./voice-intent";
import { markContextualPlaybackConsent } from "./voice-intent";

const PROVIDER_NAMES: Readonly<Record<VoiceProviderHint, string>> = Object.freeze({
  "disney-plus": "Disney+",
  netflix: "Netflix",
  spotify: "Spotify",
  youtube: "YouTube"
});

const UNKNOWN_INTENT: VoiceUnknownIntent = Object.freeze({ kind: "unknown" });
const CONTEXT_RESOLVED_MEDIA_INTENT = Symbol("context-resolved-media-intent");

export type ResolvedVoiceIntent = Exclude<VoiceIntent, VoiceMediaReferenceIntent>;

export type ResolvedVoiceMediaReferenceIntent =
  | VoiceControlIntent
  | VoiceMediaIntent
  | VoiceUnknownIntent;

export interface VoiceMediaIntentContextAttempt {
  readonly invalidation: VoiceMediaTargetInvalidation | null;
  readonly profileRevision: number;
}

export type VoiceMediaIntentContextSettlement =
  | { outcome: "cancelled" | "failed" }
  | {
    intent: VoiceMediaIntent;
    outcome: "succeeded";
    preserveCandidates?: boolean;
  };

interface ResolvedReferenceSource {
  playbackConsent: boolean;
  media: StoredVoiceMediaReference;
  provider: VoiceProviderReference | null;
}

function contextMediaType(intent: VoiceMediaIntent): StoredVoiceMediaType {
  switch (intent.mediaType) {
    case "album":
    case "episode":
    case "movie":
    case "playlist":
    case "song":
    case "video":
      return intent.mediaType;
    case "artist":
    case "channel":
    case "recommendation":
    case "show":
    case "similar-title":
    case "title":
      return "unknown";
  }
}

function contextReference(intent: VoiceMediaIntent): VoiceMediaReferenceInput | null {
  if (intent.mediaType === "recommendation" || intent.mediaType === "similar-title") {
    return null;
  }
  const audio = intent.mediaType === "album" ||
    intent.mediaType === "artist" ||
    intent.mediaType === "playlist" ||
    intent.mediaType === "song";
  return {
    identity: {
      album: intent.mediaType === "album" ? intent.title : null,
      artist: audio
        ? intent.creator ?? (intent.mediaType === "artist" ? intent.title : null)
        : null,
      creator: audio
        ? null
        : intent.creator ?? (intent.mediaType === "channel" ? intent.title : null),
      episodeNumber: intent.mediaType === "episode" ? intent.episode : null,
      seasonNumber: intent.mediaType === "episode" ? intent.season : null,
      seriesTitle: intent.mediaType === "episode" ? intent.title : null,
      title: intent.title
    },
    mediaType: contextMediaType(intent)
  };
}

function markContextResolvedMediaIntent(intent: VoiceMediaIntent): VoiceMediaIntent {
  Object.defineProperty(intent, CONTEXT_RESOLVED_MEDIA_INTENT, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false
  });
  return intent;
}

function isContextResolvedMediaIntent(intent: VoiceMediaIntent): boolean {
  return (intent as VoiceMediaIntent & { [CONTEXT_RESOLVED_MEDIA_INTENT]?: unknown })[
    CONTEXT_RESOLVED_MEDIA_INTENT
  ] === true;
}

/**
 * Replaces the previous conversational target with one explicit media intent.
 * Only structured identity and an explicitly named provider are retained.
 */
export function recordVoiceMediaIntentContext(
  store: VoiceContextStore,
  intent: VoiceMediaIntent,
  options: { preserveCandidates?: boolean } = {}
): boolean {
  const revisions = store.revisions();
  if (!store.clearMediaReference(revisions, options.preserveCandidates === true)) return false;
  const reference = contextReference(intent);
  if (reference === null || !store.recordMediaTarget(reference, revisions)) return false;
  if (intent.providerHint === null) return true;
  return store.recordProvider({
    id: intent.providerHint,
    name: PROVIDER_NAMES[intent.providerHint]
  }, revisions);
}

/**
 * Starts the context transaction for a media command that is about to run.
 * Only a new explicit target invalidates an older, different target. Resolved
 * follow-ups intentionally keep their source reference so a failed retry can
 * be spoken again.
 */
export function beginVoiceMediaIntentContext(
  store: VoiceContextStore,
  intent: VoiceMediaIntent
): VoiceMediaIntentContextAttempt {
  const reference = contextReference(intent);
  const revisions = store.revisions();
  return {
    invalidation: reference === null || isContextResolvedMediaIntent(intent)
      ? null
      : store.invalidateDifferentMediaTarget(reference, revisions),
    profileRevision: revisions.profileRevision
  };
}

/**
 * Completes a media context transaction. Cancellation restores the previous
 * target, ordinary failure leaves a different old target invalidated, and a
 * verified success commits the new target.
 */
export function settleVoiceMediaIntentContext(
  store: VoiceContextStore,
  attempt: VoiceMediaIntentContextAttempt,
  settlement: VoiceMediaIntentContextSettlement
): boolean {
  if (store.revisions().profileRevision !== attempt.profileRevision) return false;
  if (
    attempt.invalidation !== null &&
    !store.settleMediaTargetInvalidation(
      attempt.invalidation,
      settlement.outcome === "cancelled" ? "restore-previous" : "retain-invalidation"
    )
  ) {
    return false;
  }
  if (settlement.outcome !== "succeeded") return true;
  return recordVoiceMediaIntentContext(store, settlement.intent, {
    preserveCandidates: settlement.preserveCandidates === true
  });
}

function providerHint(reference: VoiceProviderReference | null): VoiceProviderHint | null {
  if (reference === null) return null;
  return Object.hasOwn(PROVIDER_NAMES, reference.id)
    ? reference.id as VoiceProviderHint
    : null;
}

function referenceSource(
  intent: VoiceMediaReferenceIntent,
  snapshot: VoiceContextSnapshot
): ResolvedReferenceSource | null {
  if (intent.reference === "last-media") {
    const media = snapshot.conversation.lastMediaTarget;
    return media === null
      ? null
      : {
        media,
        playbackConsent: false,
        provider: snapshot.conversation.lastProvider
      };
  }

  if (intent.reference === "current-media") {
    const media = snapshot.liveMedia;
    return media === null
      ? null
      : { media, playbackConsent: false, provider: media.service };
  }

  if (intent.ordinal === null) return null;
  const candidateSet = snapshot.conversation.candidates;
  const clarification = snapshot.conversation.pendingClarification;
  if (
    candidateSet === null ||
    clarification === null ||
    clarification.candidateSetRevision !== candidateSet.revision
  ) {
    return null;
  }
  const candidate: VoiceContextCandidate | undefined =
    candidateSet.candidates[intent.ordinal - 1];
  return candidate === undefined
    ? null
    : { media: candidate, playbackConsent: true, provider: candidate.provider };
}

function intentMediaType(
  media: StoredVoiceMediaReference
): Pick<VoiceMediaIntent, "creator" | "episode" | "mediaType" | "season" | "title"> | null {
  const { identity } = media;
  switch (media.mediaType) {
    case "episode":
      if (identity.seasonNumber === null || identity.episodeNumber === null) return null;
      return {
        creator: null,
        episode: identity.episodeNumber,
        mediaType: "episode",
        season: identity.seasonNumber,
        title: identity.seriesTitle ?? identity.title
      };
    case "movie":
      return {
        creator: null,
        episode: null,
        mediaType: "movie",
        season: null,
        title: identity.title
      };
    case "video":
    case "short":
    case "live-video":
      return {
        creator: identity.creator,
        episode: null,
        mediaType: "video",
        season: null,
        title: identity.title
      };
    case "song":
      return {
        creator: identity.artist,
        episode: null,
        mediaType: "song",
        season: null,
        title: identity.title
      };
    case "album":
      return {
        creator: identity.artist,
        episode: null,
        mediaType: "album",
        season: null,
        title: identity.album ?? identity.title
      };
    case "playlist":
      return {
        creator: identity.creator ?? identity.artist,
        episode: null,
        mediaType: "playlist",
        season: null,
        title: identity.title
      };
    case "unknown": {
      const normalizedTitle = identity.title.toLocaleLowerCase();
      if (identity.artist?.toLocaleLowerCase() === normalizedTitle) {
        return {
          creator: identity.artist,
          episode: null,
          mediaType: "artist",
          season: null,
          title: identity.title
        };
      }
      if (identity.creator?.toLocaleLowerCase() === normalizedTitle) {
        return {
          creator: identity.creator,
          episode: null,
          mediaType: "channel",
          season: null,
          title: identity.title
        };
      }
      return {
        creator: null,
        episode: null,
        mediaType: "title",
        season: null,
        title: identity.title
      };
    }
    case "podcast-episode":
      return null;
  }
}

function compatibleProvider(
  action: VoiceMediaReferenceIntent["action"],
  mediaType: VoiceMediaType,
  provider: VoiceProviderHint | null
): boolean {
  if (provider === null || action === "search") return true;
  const audio = mediaType === "album" ||
    mediaType === "artist" ||
    mediaType === "playlist" ||
    mediaType === "song";
  if (audio) return provider === "spotify";
  if (mediaType === "video" || mediaType === "channel") return provider === "youtube";
  return provider !== "spotify";
}

function isCompatibleCurrentMediaPlay(
  intent: VoiceMediaReferenceIntent,
  snapshot: VoiceContextSnapshot,
  sourceProvider: VoiceProviderReference | null
): boolean {
  if (
    intent.reference !== "current-media" ||
    intent.action !== "play" ||
    (snapshot.liveMedia?.playbackStatus !== "paused" &&
      snapshot.liveMedia?.playbackStatus !== "playing")
  ) {
    return false;
  }
  return intent.providerHint === null || intent.providerHint === providerHint(sourceProvider);
}

/**
 * Resolves one contextual reference against a fresh VoiceContextStore snapshot.
 * Candidate ordinals are one-based and never re-ranked or inferred.
 */
export function resolveVoiceMediaReferenceIntent(
  intent: VoiceMediaReferenceIntent,
  snapshot: VoiceContextSnapshot
): ResolvedVoiceMediaReferenceIntent {
  const source = referenceSource(intent, snapshot);
  if (source === null) return UNKNOWN_INTENT;

  const inheritedProvider = providerHint(source.provider);
  if (
    intent.providerHint === null &&
    source.provider !== null &&
    inheritedProvider === null
  ) {
    return UNKNOWN_INTENT;
  }
  const provider = intent.providerHint ?? inheritedProvider;
  const target = intentMediaType(source.media);
  if (target === null || !compatibleProvider(intent.action, target.mediaType, provider)) {
    return UNKNOWN_INTENT;
  }
  if (isCompatibleCurrentMediaPlay(intent, snapshot, source.provider)) {
    return { action: "resume", kind: "control" };
  }

  const resolved = markContextResolvedMediaIntent({
    action: intent.action,
    ...target,
    kind: "media",
    providerHint: provider,
    recency: null
  });
  return source.playbackConsent && intent.action === "play"
    ? markContextualPlaybackConsent(resolved)
    : resolved;
}

/** Leaves explicit titles and all other non-reference intents completely untouched. */
export function resolveVoiceContextIntent(
  intent: VoiceIntent,
  snapshot: VoiceContextSnapshot
): ResolvedVoiceIntent {
  return intent.kind === "media-reference"
    ? resolveVoiceMediaReferenceIntent(intent, snapshot)
    : intent;
}
