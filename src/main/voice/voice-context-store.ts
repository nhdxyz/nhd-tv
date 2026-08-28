import { qualifyObservedPlaybackRate } from "../observed-playback-rate";

const MAX_DISPLAY_TEXT_LENGTH = 180;
const MAX_IDENTIFIER_LENGTH = 200;
const MAX_CANDIDATES = 10;

export const DEFAULT_VOICE_CONTEXT_TTL_MS = Object.freeze({
  candidates: 2 * 60_000,
  clarification: 30_000,
  conversation: 5 * 60_000,
  liveMedia: 30 * 60_000
});

export type VoiceMediaType =
  | "movie"
  | "episode"
  | "video"
  | "short"
  | "live-video"
  | "song"
  | "album"
  | "playlist"
  | "podcast-episode"
  | "unknown";

export type VoicePlaybackStatus =
  | "loading"
  | "buffering"
  | "playing"
  | "paused"
  | "ended"
  | "blocked"
  | "error"
  | "unknown";

export type VoiceMediaCapability =
  | "play"
  | "pause"
  | "seek"
  | "restart"
  | "next"
  | "previous"
  | "skip-intro"
  | "skip-recap"
  | "skip-ad"
  | "captions"
  | "audio-language"
  | "fullscreen"
  | "playback-rate"
  | "shuffle"
  | "repeat"
  | "queue";

export type VoiceVerifiedActionKind =
  | "play"
  | "pause"
  | "resume"
  | "stop"
  | "seek"
  | "restart"
  | "next"
  | "previous"
  | "skip-intro"
  | "skip-recap"
  | "skip-ad"
  | "captions-on"
  | "captions-off"
  | "audio-language"
  | "fullscreen-enter"
  | "fullscreen-exit"
  | "playback-rate"
  | "repeat"
  | "shuffle"
  | "launch-service"
  | "select-provider"
  | "select-media"
  | "volume"
  | "mute"
  | "unmute";

export interface VoiceContextRevisions {
  mediaRevision: number;
  profileRevision: number;
  serviceRevision: number;
}

export interface VoiceMediaIdentityInput {
  album?: string | null;
  artist?: string | null;
  contentId?: string | null;
  creator?: string | null;
  episodeNumber?: number | null;
  seasonNumber?: number | null;
  seriesTitle?: string | null;
  subtitle?: string | null;
  title: string;
  year?: number | null;
}

export interface VoiceMediaIdentity {
  album: string | null;
  artist: string | null;
  contentId: string | null;
  creator: string | null;
  episodeNumber: number | null;
  seasonNumber: number | null;
  seriesTitle: string | null;
  subtitle: string | null;
  title: string;
  year: number | null;
}

export interface VoiceMediaReferenceInput {
  identity: VoiceMediaIdentityInput;
  mediaType: VoiceMediaType;
}

export interface VoiceMediaReference {
  identity: VoiceMediaIdentity;
  mediaType: VoiceMediaType;
}

export interface VoiceProviderInput {
  id: string;
  name?: string | null;
}

export interface VoiceProviderReference {
  id: string;
  name: string;
}

export interface VoiceLiveMediaInput extends VoiceMediaReferenceInput {
  audioLanguage?: string | null;
  capabilities?: readonly VoiceMediaCapability[];
  captionLanguage?: string | null;
  captionsEnabled?: boolean | null;
  durationSeconds?: number | null;
  fullscreen?: boolean | null;
  observedAt?: number;
  playbackRate?: number | null;
  playbackStatus: VoicePlaybackStatus;
  positionSeconds?: number | null;
}

export interface VoicePlaybackUpdate {
  audioLanguage?: string | null;
  capabilities?: readonly VoiceMediaCapability[];
  captionLanguage?: string | null;
  captionsEnabled?: boolean | null;
  durationSeconds?: number | null;
  fullscreen?: boolean | null;
  observedAt?: number;
  playbackRate?: number | null;
  playbackStatus?: VoicePlaybackStatus;
  positionSeconds?: number | null;
}

export interface VoiceLiveMediaSnapshot extends VoiceMediaReference {
  audioLanguage: string | null;
  capabilities: readonly VoiceMediaCapability[];
  captionLanguage: string | null;
  captionsEnabled: boolean | null;
  durationSeconds: number | null;
  fullscreen: boolean | null;
  observedAt: number;
  playbackRate: number | null;
  playbackStatus: VoicePlaybackStatus;
  positionSeconds: number | null;
  revisions: VoiceContextRevisions;
  service: VoiceProviderReference;
  startedAt: number;
  updatedAt: number;
}

export interface VoiceLastMediaTarget extends VoiceMediaReference {
  expiresAt: number;
  recordedAt: number;
}

export interface VoiceLastProvider extends VoiceProviderReference {
  expiresAt: number;
  recordedAt: number;
}

export interface VoiceCandidateInput extends VoiceMediaReferenceInput {
  id?: string;
  provider?: VoiceProviderInput | null;
}

export interface VoiceContextCandidate extends VoiceMediaReference {
  id: string;
  provider: VoiceProviderReference | null;
}

export interface VoiceCandidateSet {
  candidates: readonly VoiceContextCandidate[];
  createdAt: number;
  expiresAt: number;
  revision: number;
}

export type VoiceClarificationKind =
  | "candidate-selection"
  | "provider-selection"
  | "media-disambiguation"
  | "confirmation";

export interface VoicePendingClarificationInput {
  candidateSetRevision?: number | null;
  kind: VoiceClarificationKind;
}

export interface VoicePendingClarification {
  candidateSetRevision: number | null;
  createdAt: number;
  expiresAt: number;
  kind: VoiceClarificationKind;
}

export interface VoiceVerifiedActionInput {
  kind: VoiceVerifiedActionKind;
  positionSeconds?: number | null;
}

export interface VoiceLastVerifiedAction {
  expiresAt: number;
  kind: VoiceVerifiedActionKind;
  mediaRevision: number;
  positionSeconds: number | null;
  recordedAt: number;
  serviceId: string | null;
}

export interface VoiceConversationContext {
  candidates: VoiceCandidateSet | null;
  lastMediaTarget: VoiceLastMediaTarget | null;
  lastProvider: VoiceLastProvider | null;
  lastVerifiedAction: VoiceLastVerifiedAction | null;
  pendingClarification: VoicePendingClarification | null;
}

export interface VoiceContextSnapshot {
  activeProfileId: string | null;
  activeService: VoiceProviderReference | null;
  conversation: VoiceConversationContext;
  liveMedia: VoiceLiveMediaSnapshot | null;
  revisions: VoiceContextRevisions;
}

export interface VoiceContextStoreOptions {
  now?: () => number;
  ttlMs?: Partial<{
    candidates: number;
    clarification: number;
    conversation: number;
    liveMedia: number;
  }>;
}

const MEDIA_TYPES = new Set<VoiceMediaType>([
  "movie",
  "episode",
  "video",
  "short",
  "live-video",
  "song",
  "album",
  "playlist",
  "podcast-episode",
  "unknown"
]);

const PLAYBACK_STATUSES = new Set<VoicePlaybackStatus>([
  "loading",
  "buffering",
  "playing",
  "paused",
  "ended",
  "blocked",
  "error",
  "unknown"
]);

const MEDIA_CAPABILITIES = new Set<VoiceMediaCapability>([
  "play",
  "pause",
  "seek",
  "restart",
  "next",
  "previous",
  "skip-intro",
  "skip-recap",
  "skip-ad",
  "captions",
  "audio-language",
  "fullscreen",
  "playback-rate",
  "shuffle",
  "repeat",
  "queue"
]);

const VERIFIED_ACTION_KINDS = new Set<VoiceVerifiedActionKind>([
  "play",
  "pause",
  "resume",
  "stop",
  "seek",
  "restart",
  "next",
  "previous",
  "skip-intro",
  "skip-recap",
  "skip-ad",
  "captions-on",
  "captions-off",
  "audio-language",
  "fullscreen-enter",
  "fullscreen-exit",
  "playback-rate",
  "repeat",
  "shuffle",
  "launch-service",
  "select-provider",
  "select-media",
  "volume",
  "mute",
  "unmute"
]);

function urlLike(value: string): boolean {
  return /(?:https?:\/\/|www\.)/iu.test(value);
}

function displayText(value: unknown, maxLength = MAX_DISPLAY_TEXT_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/gu, " ").trim().slice(0, maxLength);
  return normalized.length > 0 && !urlLike(normalized) ? normalized : null;
}

function opaqueId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, MAX_IDENTIFIER_LENGTH);
  return normalized.length > 0 && !urlLike(normalized) ? normalized : null;
}

function requiredId(value: unknown, label: string): string {
  const normalized = opaqueId(value);
  if (normalized === null) {
    throw new TypeError(`${label} must be a non-empty, non-URL identifier.`);
  }
  return normalized;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function normalizedYear(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1800 && value <= 3000
    ? value
    : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function mediaType(value: unknown): VoiceMediaType {
  return typeof value === "string" && MEDIA_TYPES.has(value as VoiceMediaType)
    ? value as VoiceMediaType
    : "unknown";
}

function playbackStatus(value: unknown): VoicePlaybackStatus {
  return typeof value === "string" && PLAYBACK_STATUSES.has(value as VoicePlaybackStatus)
    ? value as VoicePlaybackStatus
    : "unknown";
}

function capabilities(value: unknown): readonly VoiceMediaCapability[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(
    (candidate): candidate is VoiceMediaCapability =>
      typeof candidate === "string" && MEDIA_CAPABILITIES.has(candidate as VoiceMediaCapability)
  ))];
}

function normalizeIdentity(input: VoiceMediaIdentityInput): VoiceMediaIdentity | null {
  const title = displayText(input.title);
  if (title === null) return null;
  return {
    album: displayText(input.album),
    artist: displayText(input.artist),
    contentId: opaqueId(input.contentId),
    creator: displayText(input.creator),
    episodeNumber: positiveInteger(input.episodeNumber),
    seasonNumber: positiveInteger(input.seasonNumber),
    seriesTitle: displayText(input.seriesTitle),
    subtitle: displayText(input.subtitle),
    title,
    year: normalizedYear(input.year)
  };
}

function normalizeReference(input: VoiceMediaReferenceInput): VoiceMediaReference | null {
  const identity = normalizeIdentity(input.identity);
  return identity === null ? null : { identity, mediaType: mediaType(input.mediaType) };
}

function normalizeProvider(input: VoiceProviderInput): VoiceProviderReference {
  const id = requiredId(input.id, "Provider id");
  return { id, name: displayText(input.name) ?? id };
}

function revisionCopy(revisions: VoiceContextRevisions): VoiceContextRevisions {
  return { ...revisions };
}

function identityCopy(identity: VoiceMediaIdentity): VoiceMediaIdentity {
  return { ...identity };
}

function referenceCopy<T extends VoiceMediaReference>(reference: T): T {
  return { ...reference, identity: identityCopy(reference.identity) };
}

function mediaIdentityKey(reference: VoiceMediaReference): string {
  const { identity } = reference;
  if (identity.contentId !== null) {
    return `${reference.mediaType}:id:${identity.contentId}`;
  }
  return JSON.stringify([
    reference.mediaType,
    identity.title.toLocaleLowerCase(),
    identity.seriesTitle?.toLocaleLowerCase() ?? null,
    identity.seasonNumber,
    identity.episodeNumber,
    identity.artist?.toLocaleLowerCase() ?? null,
    identity.creator?.toLocaleLowerCase() ?? null
  ]);
}

function validTtl(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} TTL must be a positive finite number.`);
  }
  return value;
}

function hasOwn(value: object, property: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, property);
}

export class VoiceContextStore {
  readonly #now: () => number;
  readonly #ttlMs: {
    candidates: number;
    clarification: number;
    conversation: number;
    liveMedia: number;
  };
  #activeProfileId: string | null = null;
  #activeService: VoiceProviderReference | null = null;
  #candidateRevision = 0;
  #candidates: VoiceCandidateSet | null = null;
  #lastMediaTarget: VoiceLastMediaTarget | null = null;
  #lastProvider: VoiceLastProvider | null = null;
  #lastVerifiedAction: VoiceLastVerifiedAction | null = null;
  #liveMedia: VoiceLiveMediaSnapshot | null = null;
  #liveMediaKey: string | null = null;
  #pendingClarification: VoicePendingClarification | null = null;
  #revisions: VoiceContextRevisions = {
    mediaRevision: 0,
    profileRevision: 0,
    serviceRevision: 0
  };

  constructor(options: VoiceContextStoreOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#ttlMs = {
      candidates: validTtl(
        options.ttlMs?.candidates,
        DEFAULT_VOICE_CONTEXT_TTL_MS.candidates,
        "Candidate"
      ),
      clarification: validTtl(
        options.ttlMs?.clarification,
        DEFAULT_VOICE_CONTEXT_TTL_MS.clarification,
        "Clarification"
      ),
      conversation: validTtl(
        options.ttlMs?.conversation,
        DEFAULT_VOICE_CONTEXT_TTL_MS.conversation,
        "Conversation"
      ),
      liveMedia: validTtl(
        options.ttlMs?.liveMedia,
        DEFAULT_VOICE_CONTEXT_TTL_MS.liveMedia,
        "Live media"
      )
    };
    this.#time();
  }

  revisions(): VoiceContextRevisions {
    this.#pruneExpired();
    return revisionCopy(this.#revisions);
  }

  snapshot(): VoiceContextSnapshot {
    this.#pruneExpired();
    return {
      activeProfileId: this.#activeProfileId,
      activeService: this.#activeService === null ? null : { ...this.#activeService },
      conversation: {
        candidates: this.#copyCandidates(),
        lastMediaTarget: this.#lastMediaTarget === null
          ? null
          : referenceCopy(this.#lastMediaTarget),
        lastProvider: this.#lastProvider === null ? null : { ...this.#lastProvider },
        lastVerifiedAction: this.#lastVerifiedAction === null
          ? null
          : { ...this.#lastVerifiedAction },
        pendingClarification: this.#pendingClarification === null
          ? null
          : { ...this.#pendingClarification }
      },
      liveMedia: this.#copyLiveMedia(),
      revisions: revisionCopy(this.#revisions)
    };
  }

  setActiveProfile(profileId: string | null): VoiceContextRevisions {
    this.#pruneExpired();
    const normalized = profileId === null ? null : requiredId(profileId, "Profile id");
    if (normalized === this.#activeProfileId) return revisionCopy(this.#revisions);

    this.#activeProfileId = normalized;
    this.#activeService = null;
    this.#liveMedia = null;
    this.#liveMediaKey = null;
    this.#clearConversation();
    this.#revisions.profileRevision += 1;
    this.#revisions.serviceRevision += 1;
    this.#revisions.mediaRevision += 1;
    return revisionCopy(this.#revisions);
  }

  setActiveService(service: VoiceProviderInput | null): VoiceContextRevisions {
    this.#pruneExpired();
    const normalized = service === null ? null : normalizeProvider(service);
    if (normalized?.id === this.#activeService?.id) {
      this.#activeService = normalized;
      return revisionCopy(this.#revisions);
    }

    this.#activeService = normalized;
    this.#liveMedia = null;
    this.#liveMediaKey = null;
    this.#clearTransientConversation();
    this.#revisions.serviceRevision += 1;
    this.#revisions.mediaRevision += 1;
    return revisionCopy(this.#revisions);
  }

  observeMedia(
    input: VoiceLiveMediaInput,
    expected: VoiceContextRevisions
  ): VoiceContextRevisions | null {
    this.#pruneExpired();
    if (!this.#matches(expected) || this.#activeService === null) return null;

    const reference = normalizeReference(input);
    if (reference === null) return null;
    const now = this.#time();
    const observedAt = nonNegativeNumber(input.observedAt) ?? now;
    if (this.#liveMedia !== null && observedAt < this.#liveMedia.observedAt) return null;

    let durationSeconds = nonNegativeNumber(input.durationSeconds);
    let positionSeconds = nonNegativeNumber(input.positionSeconds);
    if (durationSeconds !== null && positionSeconds !== null) {
      positionSeconds = Math.min(positionSeconds, durationSeconds);
    }

    const key = mediaIdentityKey(reference);
    const sameMedia = key === this.#liveMediaKey && this.#liveMedia !== null;
    if (!sameMedia) {
      this.#clearTransientConversation();
      this.#revisions.mediaRevision += 1;
    }

    this.#liveMediaKey = key;
    this.#liveMedia = {
      ...reference,
      audioLanguage: displayText(input.audioLanguage, 80),
      capabilities: capabilities(input.capabilities),
      captionLanguage: displayText(input.captionLanguage, 80),
      captionsEnabled: nullableBoolean(input.captionsEnabled),
      durationSeconds,
      fullscreen: nullableBoolean(input.fullscreen),
      observedAt,
      playbackRate: qualifyObservedPlaybackRate(input.playbackRate),
      playbackStatus: playbackStatus(input.playbackStatus),
      positionSeconds,
      revisions: revisionCopy(this.#revisions),
      service: { ...this.#activeService },
      startedAt: sameMedia ? this.#liveMedia?.startedAt ?? now : now,
      updatedAt: now
    };
    return revisionCopy(this.#revisions);
  }

  updatePlayback(update: VoicePlaybackUpdate, expected: VoiceContextRevisions): boolean {
    this.#pruneExpired();
    if (!this.#matches(expected) || this.#liveMedia === null) return false;

    const now = this.#time();
    const observedAt = nonNegativeNumber(update.observedAt) ?? now;
    if (observedAt < this.#liveMedia.observedAt) return false;

    let durationSeconds = hasOwn(update, "durationSeconds")
      ? nonNegativeNumber(update.durationSeconds)
      : this.#liveMedia.durationSeconds;
    let positionSeconds = hasOwn(update, "positionSeconds")
      ? nonNegativeNumber(update.positionSeconds)
      : this.#liveMedia.positionSeconds;
    if (durationSeconds !== null && positionSeconds !== null) {
      positionSeconds = Math.min(positionSeconds, durationSeconds);
    }

    this.#liveMedia = {
      ...this.#liveMedia,
      audioLanguage: hasOwn(update, "audioLanguage")
        ? displayText(update.audioLanguage, 80)
        : this.#liveMedia.audioLanguage,
      capabilities: hasOwn(update, "capabilities")
        ? capabilities(update.capabilities)
        : this.#liveMedia.capabilities,
      captionLanguage: hasOwn(update, "captionLanguage")
        ? displayText(update.captionLanguage, 80)
        : this.#liveMedia.captionLanguage,
      captionsEnabled: hasOwn(update, "captionsEnabled")
        ? nullableBoolean(update.captionsEnabled)
        : this.#liveMedia.captionsEnabled,
      durationSeconds,
      fullscreen: hasOwn(update, "fullscreen")
        ? nullableBoolean(update.fullscreen)
        : this.#liveMedia.fullscreen,
      observedAt,
      playbackRate: hasOwn(update, "playbackRate")
        ? qualifyObservedPlaybackRate(update.playbackRate)
        : this.#liveMedia.playbackRate,
      playbackStatus: hasOwn(update, "playbackStatus")
        ? playbackStatus(update.playbackStatus)
        : this.#liveMedia.playbackStatus,
      positionSeconds,
      revisions: revisionCopy(this.#revisions),
      updatedAt: now
    };
    return true;
  }

  clearMedia(expected: VoiceContextRevisions): boolean {
    this.#pruneExpired();
    if (!this.#matches(expected) || this.#liveMedia === null) return false;
    this.#liveMedia = null;
    this.#liveMediaKey = null;
    this.#clearTransientConversation();
    this.#revisions.mediaRevision += 1;
    return true;
  }

  recordMediaTarget(input: VoiceMediaReferenceInput, expected: VoiceContextRevisions): boolean {
    this.#pruneExpired();
    if (!this.#matches(expected)) return false;
    const reference = normalizeReference(input);
    if (reference === null) return false;
    const now = this.#time();
    this.#lastMediaTarget = {
      ...reference,
      expiresAt: now + this.#ttlMs.conversation,
      recordedAt: now
    };
    return true;
  }

  recordProvider(input: VoiceProviderInput, expected: VoiceContextRevisions): boolean {
    this.#pruneExpired();
    if (!this.#matches(expected)) return false;
    const provider = normalizeProvider(input);
    const now = this.#time();
    this.#lastProvider = {
      ...provider,
      expiresAt: now + this.#ttlMs.conversation,
      recordedAt: now
    };
    return true;
  }

  setCandidates(
    inputs: readonly VoiceCandidateInput[],
    expected: VoiceContextRevisions
  ): VoiceCandidateSet | null {
    this.#pruneExpired();
    if (!this.#matches(expected)) return null;

    const revision = ++this.#candidateRevision;
    const usedIds = new Set<string>();
    const normalized: VoiceContextCandidate[] = [];
    for (const [index, input] of inputs.slice(0, MAX_CANDIDATES).entries()) {
      const reference = normalizeReference(input);
      if (reference === null) continue;
      let id = opaqueId(input.id) ?? `choice-${revision}-${index + 1}`;
      if (usedIds.has(id)) id = `choice-${revision}-${index + 1}`;
      while (usedIds.has(id)) id = `${id}-next`;
      usedIds.add(id);
      normalized.push({
        ...reference,
        id,
        provider: input.provider === null || input.provider === undefined
          ? null
          : normalizeProvider(input.provider)
      });
    }

    if (normalized.length === 0) {
      this.#candidates = null;
      this.#pendingClarification = null;
      return null;
    }

    const now = this.#time();
    this.#candidates = {
      candidates: normalized,
      createdAt: now,
      expiresAt: now + this.#ttlMs.candidates,
      revision
    };
    if (
      this.#pendingClarification?.candidateSetRevision !== null &&
      this.#pendingClarification?.candidateSetRevision !== revision
    ) {
      this.#pendingClarification = null;
    }
    return this.#copyCandidates();
  }

  setPendingClarification(
    input: VoicePendingClarificationInput,
    expected: VoiceContextRevisions
  ): boolean {
    this.#pruneExpired();
    if (!this.#matches(expected)) return false;

    const candidateSetRevision = input.candidateSetRevision ?? (
      input.kind === "candidate-selection" ? this.#candidates?.revision ?? null : null
    );
    if (
      candidateSetRevision !== null &&
      candidateSetRevision !== this.#candidates?.revision
    ) {
      return false;
    }
    if (input.kind === "candidate-selection" && candidateSetRevision === null) return false;

    const now = this.#time();
    this.#pendingClarification = {
      candidateSetRevision,
      createdAt: now,
      expiresAt: now + this.#ttlMs.clarification,
      kind: input.kind
    };
    return true;
  }

  recordVerifiedAction(
    input: VoiceVerifiedActionInput,
    expected: VoiceContextRevisions
  ): boolean {
    this.#pruneExpired();
    if (
      !this.#matches(expected) ||
      !VERIFIED_ACTION_KINDS.has(input.kind)
    ) {
      return false;
    }
    const now = this.#time();
    this.#lastVerifiedAction = {
      expiresAt: now + this.#ttlMs.conversation,
      kind: input.kind,
      mediaRevision: this.#revisions.mediaRevision,
      positionSeconds: nonNegativeNumber(input.positionSeconds),
      recordedAt: now,
      serviceId: this.#activeService?.id ?? null
    };
    return true;
  }

  clearConversation(expected?: VoiceContextRevisions): boolean {
    this.#pruneExpired();
    if (expected !== undefined && !this.#matches(expected)) return false;
    this.#clearConversation();
    return true;
  }

  #matches(expected: VoiceContextRevisions): boolean {
    return expected.profileRevision === this.#revisions.profileRevision &&
      expected.serviceRevision === this.#revisions.serviceRevision &&
      expected.mediaRevision === this.#revisions.mediaRevision;
  }

  #clearConversation(): void {
    this.#clearTransientConversation();
    this.#lastMediaTarget = null;
    this.#lastProvider = null;
  }

  #clearTransientConversation(): void {
    this.#candidates = null;
    this.#lastVerifiedAction = null;
    this.#pendingClarification = null;
  }

  #copyCandidates(): VoiceCandidateSet | null {
    if (this.#candidates === null) return null;
    return {
      ...this.#candidates,
      candidates: this.#candidates.candidates.map((candidate) => ({
        ...referenceCopy(candidate),
        provider: candidate.provider === null ? null : { ...candidate.provider }
      }))
    };
  }

  #copyLiveMedia(): VoiceLiveMediaSnapshot | null {
    if (this.#liveMedia === null) return null;
    return {
      ...referenceCopy(this.#liveMedia),
      capabilities: [...this.#liveMedia.capabilities],
      revisions: revisionCopy(this.#liveMedia.revisions),
      service: { ...this.#liveMedia.service }
    };
  }

  #pruneExpired(): void {
    const now = this.#time();
    if (this.#liveMedia !== null && this.#liveMedia.updatedAt + this.#ttlMs.liveMedia <= now) {
      this.#liveMedia = null;
      this.#liveMediaKey = null;
      this.#clearConversation();
      this.#revisions.mediaRevision += 1;
      return;
    }
    if (this.#lastMediaTarget !== null && this.#lastMediaTarget.expiresAt <= now) {
      this.#lastMediaTarget = null;
    }
    if (this.#lastProvider !== null && this.#lastProvider.expiresAt <= now) {
      this.#lastProvider = null;
    }
    if (this.#lastVerifiedAction !== null && this.#lastVerifiedAction.expiresAt <= now) {
      this.#lastVerifiedAction = null;
    }
    if (this.#candidates !== null && this.#candidates.expiresAt <= now) {
      const expiredRevision = this.#candidates.revision;
      this.#candidates = null;
      if (this.#pendingClarification?.candidateSetRevision === expiredRevision) {
        this.#pendingClarification = null;
      }
    }
    if (
      this.#pendingClarification !== null &&
      this.#pendingClarification.expiresAt <= now
    ) {
      this.#pendingClarification = null;
    }
  }

  #time(): number {
    const now = this.#now();
    if (!Number.isFinite(now) || now < 0) {
      throw new TypeError("Voice context clock must return a non-negative finite number.");
    }
    return now;
  }
}
