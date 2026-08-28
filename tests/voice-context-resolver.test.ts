import { describe, expect, it } from "vitest";
import { VoiceContextStore } from "../src/main/voice/voice-context-store";
import {
  recordVoiceMediaIntentContext,
  resolveVoiceContextIntent,
  resolveVoiceMediaReferenceIntent
} from "../src/main/voice/voice-context-resolver";
import { hasContextualPlaybackConsent } from "../src/main/voice/voice-intent";
import type {
  VoiceMediaIntent,
  VoiceMediaReferenceIntent
} from "../src/main/voice/voice-intent";

function mediaIntent(overrides: Partial<VoiceMediaIntent> = {}): VoiceMediaIntent {
  return {
    action: "play",
    creator: null,
    episode: null,
    kind: "media",
    mediaType: "movie",
    providerHint: null,
    recency: null,
    season: null,
    title: "Apollo 13",
    ...overrides
  };
}

function referenceIntent(
  overrides: Partial<VoiceMediaReferenceIntent> = {}
): VoiceMediaReferenceIntent {
  return {
    action: "play",
    kind: "media-reference",
    ordinal: null,
    providerHint: null,
    reference: "last-media",
    ...overrides
  };
}

describe("shared voice context resolver", () => {
  it("records only structured explicit target and provider context", () => {
    const store = new VoiceContextStore({ now: () => 1_000 });
    const intent = {
      ...mediaIntent({
        episode: 3,
        mediaType: "episode",
        providerHint: "netflix",
        season: 1,
        title: "Breaking Bad"
      }),
      transcript: "play the secret URL",
      url: "https://www.netflix.com/watch/private"
    } as VoiceMediaIntent;

    expect(recordVoiceMediaIntentContext(store, intent)).toBe(true);
    expect(store.snapshot().conversation).toMatchObject({
      lastMediaTarget: {
        identity: {
          episodeNumber: 3,
          seasonNumber: 1,
          seriesTitle: "Breaking Bad",
          title: "Breaking Bad"
        },
        mediaType: "episode"
      },
      lastProvider: { id: "netflix", name: "Netflix" }
    });
    const serialized = JSON.stringify(store.snapshot());
    expect(serialized).not.toContain("transcript");
    expect(serialized).not.toContain("https://");
    expect(serialized).not.toContain("watch/private");
  });

  it("replaces a prior provider instead of attaching it to a new unqualified target", () => {
    const store = new VoiceContextStore({ now: () => 2_000 });
    expect(recordVoiceMediaIntentContext(store, mediaIntent({
      providerHint: "netflix",
      title: "Apollo 13"
    }))).toBe(true);
    expect(recordVoiceMediaIntentContext(store, mediaIntent({
      providerHint: null,
      title: "Dune"
    }))).toBe(true);

    expect(store.snapshot().conversation.lastProvider).toBeNull();
    expect(resolveVoiceMediaReferenceIntent(
      referenceIntent(),
      store.snapshot()
    )).toMatchObject({ providerHint: null, title: "Dune" });
  });

  it("can commit a target without erasing provider choices created by execution", () => {
    const store = new VoiceContextStore({ now: () => 2_500 });
    let scope = store.setActiveService({ id: "netflix", name: "Netflix" });
    scope = store.observeMedia({
      identity: { title: "Old title" },
      mediaType: "movie",
      playbackStatus: "playing"
    }, scope) ?? scope;
    expect(store.recordVerifiedAction({ kind: "play" }, scope)).toBe(true);
    const candidates = store.setCandidates([{
      identity: { title: "Apollo 13" },
      mediaType: "movie",
      provider: { id: "netflix", name: "Netflix" }
    }, {
      identity: { title: "Apollo 13" },
      mediaType: "movie",
      provider: { id: "disney-plus", name: "Disney+" }
    }], scope);
    expect(store.setPendingClarification({
      candidateSetRevision: candidates?.revision,
      kind: "provider-selection"
    }, scope)).toBe(true);

    expect(recordVoiceMediaIntentContext(store, mediaIntent(), {
      preserveCandidates: true
    })).toBe(true);
    const conversation = store.snapshot().conversation;
    expect(conversation.lastMediaTarget).toMatchObject({
      identity: { title: "Apollo 13" }
    });
    expect(conversation.lastProvider).toBeNull();
    expect(conversation.lastVerifiedAction).toBeNull();
    expect(conversation.candidates?.candidates).toHaveLength(2);
    expect(conversation.pendingClarification).toMatchObject({
      kind: "provider-selection"
    });
  });

  it("returns unknown for every absent contextual reference", () => {
    const snapshot = new VoiceContextStore().snapshot();
    expect(resolveVoiceMediaReferenceIntent(referenceIntent(), snapshot)).toEqual({
      kind: "unknown"
    });
    expect(resolveVoiceMediaReferenceIntent(referenceIntent({
      reference: "current-media"
    }), snapshot)).toEqual({ kind: "unknown" });
    expect(resolveVoiceMediaReferenceIntent(referenceIntent({
      ordinal: 1,
      reference: "candidate"
    }), snapshot)).toEqual({ kind: "unknown" });
    expect(resolveVoiceMediaReferenceIntent(referenceIntent({
      ordinal: null,
      reference: "candidate"
    }), snapshot)).toEqual({ kind: "unknown" });
  });

  it("honors store expiry for last targets, candidates, and current media", () => {
    let now = 3_000;
    const store = new VoiceContextStore({
      now: () => now,
      ttlMs: { candidates: 20, conversation: 10, liveMedia: 30 }
    });
    let scope = store.setActiveService({ id: "netflix", name: "Netflix" });
    scope = store.observeMedia({
      identity: { title: "Apollo 13" },
      mediaType: "movie",
      playbackStatus: "playing"
    }, scope) ?? scope;
    expect(recordVoiceMediaIntentContext(store, mediaIntent())).toBe(true);
    const candidates = store.setCandidates([{
      identity: { title: "Dune" },
      mediaType: "movie"
    }], scope);
    expect(store.setPendingClarification({
      candidateSetRevision: candidates?.revision,
      kind: "provider-selection"
    }, scope)).toBe(true);

    now += 10;
    expect(resolveVoiceMediaReferenceIntent(referenceIntent(), store.snapshot())).toEqual({
      kind: "unknown"
    });
    now += 10;
    expect(resolveVoiceMediaReferenceIntent(referenceIntent({
      ordinal: 1,
      reference: "candidate"
    }), store.snapshot())).toEqual({ kind: "unknown" });
    now += 10;
    expect(resolveVoiceMediaReferenceIntent(referenceIntent({
      reference: "current-media"
    }), store.snapshot())).toEqual({ kind: "unknown" });
  });

  it("inherits a recorded provider and gives an explicit compatible override priority", () => {
    const store = new VoiceContextStore({ now: () => 4_000 });
    recordVoiceMediaIntentContext(store, mediaIntent({ providerHint: "netflix" }));

    expect(resolveVoiceMediaReferenceIntent(referenceIntent(), store.snapshot())).toMatchObject({
      kind: "media",
      providerHint: "netflix",
      title: "Apollo 13"
    });
    expect(resolveVoiceMediaReferenceIntent(referenceIntent({
      providerHint: "youtube"
    }), store.snapshot())).toMatchObject({
      kind: "media",
      providerHint: "youtube",
      title: "Apollo 13"
    });
    expect(resolveVoiceMediaReferenceIntent(referenceIntent({
      providerHint: "spotify"
    }), store.snapshot())).toEqual({ kind: "unknown" });
  });

  it("selects candidates strictly by their stored one-based order", () => {
    const store = new VoiceContextStore({ now: () => 5_000 });
    const scope = store.revisions();
    const candidates = store.setCandidates([{
      id: "z-last-alphabetically",
      identity: { title: "First stored choice", year: 2020 },
      mediaType: "movie",
      provider: { id: "netflix", name: "Netflix" }
    }, {
      id: "a-first-alphabetically",
      identity: { title: "Second stored choice", year: 2021 },
      mediaType: "movie",
      provider: { id: "disney-plus", name: "Disney+" }
    }], scope);
    expect(store.setPendingClarification({
      candidateSetRevision: candidates?.revision,
      kind: "provider-selection"
    }, scope)).toBe(true);

    const resolved = resolveVoiceMediaReferenceIntent(referenceIntent({
      ordinal: 2,
      reference: "candidate"
    }), store.snapshot());
    expect(resolved).toEqual({
      action: "play",
      creator: null,
      episode: null,
      kind: "media",
      mediaType: "movie",
      providerHint: "disney-plus",
      recency: null,
      season: null,
      title: "Second stored choice"
    });
    expect(resolved.kind === "media" && hasContextualPlaybackConsent(resolved)).toBe(true);
    expect(resolveVoiceMediaReferenceIntent(referenceIntent({
      ordinal: 3,
      reference: "candidate"
    }), store.snapshot())).toEqual({ kind: "unknown" });
  });

  it("requires both coordinates before resolving an exact episode", () => {
    const store = new VoiceContextStore({ now: () => 6_000 });
    const scope = store.revisions();
    const candidates = store.setCandidates([{
      identity: { seriesTitle: "Breaking Bad", title: "Breaking Bad" },
      mediaType: "episode",
      provider: { id: "netflix" }
    }, {
      identity: {
        episodeNumber: 4,
        seasonNumber: 1,
        seriesTitle: "Breaking Bad",
        subtitle: "Cancer Man",
        title: "Cancer Man"
      },
      mediaType: "episode",
      provider: { id: "netflix" }
    }], scope);
    expect(store.setPendingClarification({
      candidateSetRevision: candidates?.revision,
      kind: "candidate-selection"
    }, scope)).toBe(true);

    expect(resolveVoiceMediaReferenceIntent(referenceIntent({
      ordinal: 1,
      reference: "candidate"
    }), store.snapshot())).toEqual({ kind: "unknown" });
    expect(resolveVoiceMediaReferenceIntent(referenceIntent({
      ordinal: 2,
      reference: "candidate"
    }), store.snapshot())).toMatchObject({
      episode: 4,
      mediaType: "episode",
      season: 1,
      title: "Breaking Bad"
    });
  });

  it("rejects a numbered choice when its displayed clarification is absent or expired", () => {
    let now = 6_500;
    const store = new VoiceContextStore({
      now: () => now,
      ttlMs: { candidates: 200, clarification: 100 }
    });
    const scope = store.revisions();
    const candidates = store.setCandidates([{
      identity: { title: "Apollo 13" },
      mediaType: "movie",
      provider: { id: "netflix", name: "Netflix" }
    }], scope);
    const ordinal = referenceIntent({ ordinal: 1, reference: "candidate" });

    expect(resolveVoiceMediaReferenceIntent(ordinal, store.snapshot())).toEqual({
      kind: "unknown"
    });
    expect(store.setPendingClarification({
      candidateSetRevision: candidates?.revision,
      kind: "provider-selection"
    }, scope)).toBe(true);
    expect(resolveVoiceMediaReferenceIntent(ordinal, store.snapshot())).toMatchObject({
      providerHint: "netflix",
      title: "Apollo 13"
    });

    now += 100;
    expect(store.snapshot().conversation.candidates).not.toBeNull();
    expect(resolveVoiceMediaReferenceIntent(ordinal, store.snapshot())).toEqual({
      kind: "unknown"
    });
  });

  it("resumes paused current playback without searching for it again", () => {
    const store = new VoiceContextStore({ now: () => 7_000 });
    const serviceScope = store.setActiveService({ id: "netflix", name: "Netflix" });
    store.observeMedia({
      capabilities: ["play", "seek"],
      identity: { title: "Apollo 13" },
      mediaType: "movie",
      playbackStatus: "paused",
      positionSeconds: 400
    }, serviceScope);

    const snapshot = store.snapshot();
    expect(resolveVoiceMediaReferenceIntent(referenceIntent({
      reference: "current-media"
    }), snapshot)).toEqual({ action: "resume", kind: "control" });
    expect(resolveVoiceMediaReferenceIntent(referenceIntent({
      providerHint: "netflix",
      reference: "current-media"
    }), snapshot)).toEqual({ action: "resume", kind: "control" });
    expect(resolveVoiceMediaReferenceIntent(referenceIntent({
      providerHint: "disney-plus",
      reference: "current-media"
    }), snapshot)).toMatchObject({
      kind: "media",
      providerHint: "disney-plus",
      title: "Apollo 13"
    });
  });

  it("maps playable context types conservatively and rejects unsupported ones", () => {
    const shortStore = new VoiceContextStore({ now: () => 8_000 });
    let scope = shortStore.setActiveService({ id: "youtube" });
    shortStore.observeMedia({
      identity: { creator: "Outdoor Boys", title: "Camp in a blizzard" },
      mediaType: "short",
      playbackStatus: "playing"
    }, scope);
    expect(resolveVoiceMediaReferenceIntent(referenceIntent({
      reference: "current-media"
    }), shortStore.snapshot())).toMatchObject({
      creator: "Outdoor Boys",
      mediaType: "video",
      providerHint: "youtube"
    });

    const podcastStore = new VoiceContextStore({ now: () => 8_000 });
    scope = podcastStore.setActiveService({ id: "spotify" });
    podcastStore.observeMedia({
      identity: { title: "An unsupported podcast episode" },
      mediaType: "podcast-episode",
      playbackStatus: "playing"
    }, scope);
    expect(resolveVoiceMediaReferenceIntent(referenceIntent({
      reference: "current-media"
    }), podcastStore.snapshot())).toEqual({ kind: "unknown" });
  });

  it("preserves explicit artist and channel semantics but does not record discovery prompts", () => {
    const artistStore = new VoiceContextStore({ now: () => 8_500 });
    expect(recordVoiceMediaIntentContext(artistStore, mediaIntent({
      creator: "Kanye West",
      mediaType: "artist",
      providerHint: "spotify",
      title: "Kanye West"
    }))).toBe(true);
    expect(resolveVoiceMediaReferenceIntent(referenceIntent(), artistStore.snapshot())).toMatchObject({
      creator: "Kanye West",
      mediaType: "artist",
      providerHint: "spotify",
      title: "Kanye West"
    });

    const channelStore = new VoiceContextStore({ now: () => 8_500 });
    expect(recordVoiceMediaIntentContext(channelStore, mediaIntent({
      creator: null,
      mediaType: "channel",
      providerHint: "youtube",
      title: "Outdoor Boys"
    }))).toBe(true);
    expect(resolveVoiceMediaReferenceIntent(referenceIntent(), channelStore.snapshot())).toMatchObject({
      creator: "Outdoor Boys",
      mediaType: "channel",
      providerHint: "youtube",
      title: "Outdoor Boys"
    });

    expect(recordVoiceMediaIntentContext(channelStore, mediaIntent({
      action: "open",
      mediaType: "recommendation",
      providerHint: "netflix",
      title: "funny action movies"
    }))).toBe(false);
    expect(channelStore.snapshot().conversation.lastMediaTarget).toBeNull();
  });

  it("does not reinterpret an explicit title named It as a contextual pronoun", () => {
    const explicit = mediaIntent({ title: "It" });
    expect(resolveVoiceContextIntent(
      explicit,
      new VoiceContextStore().snapshot()
    )).toBe(explicit);
  });
});
