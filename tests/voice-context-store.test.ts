import { describe, expect, it } from "vitest";
import {
  VoiceContextStore,
  type VoiceContextRevisions,
  type VoiceLiveMediaInput
} from "../src/main/voice/voice-context-store";

function video(overrides: Partial<VoiceLiveMediaInput> = {}): VoiceLiveMediaInput {
  return {
    capabilities: ["play", "pause", "seek", "pause"],
    captionsEnabled: false,
    durationSeconds: 2_400,
    fullscreen: true,
    identity: {
      contentId: "70196254",
      episodeNumber: 3,
      seasonNumber: 1,
      seriesTitle: "Breaking Bad",
      subtitle: "...And the Bag's in the River",
      title: "Breaking Bad"
    },
    mediaType: "episode",
    observedAt: 1_000,
    playbackStatus: "playing",
    positionSeconds: 3_000,
    ...overrides
  };
}

function activateNetflix(store: VoiceContextStore): VoiceContextRevisions {
  store.setActiveProfile("living-room");
  return store.setActiveService({ id: "netflix", name: "Netflix" });
}

describe("shared voice context store", () => {
  it("normalizes a video snapshot and returns defensive copies", () => {
    let now = 1_000;
    const store = new VoiceContextStore({ now: () => now });
    const serviceScope = activateNetflix(store);
    const mediaScope = store.observeMedia(video(), serviceScope);

    expect(mediaScope).not.toBeNull();
    const snapshot = store.snapshot();
    expect(snapshot.liveMedia).toMatchObject({
      capabilities: ["play", "pause", "seek"],
      durationSeconds: 2_400,
      mediaType: "episode",
      observedAt: 1_000,
      playbackStatus: "playing",
      positionSeconds: 2_400,
      service: { id: "netflix", name: "Netflix" },
      startedAt: 1_000,
      updatedAt: 1_000
    });
    expect(snapshot.liveMedia?.identity).toMatchObject({
      contentId: "70196254",
      episodeNumber: 3,
      seasonNumber: 1,
      seriesTitle: "Breaking Bad",
      title: "Breaking Bad"
    });

    (snapshot.liveMedia?.capabilities as string[]).push("next");
    if (snapshot.liveMedia !== null) snapshot.liveMedia.identity.title = "Changed";
    now = 1_100;
    expect(store.snapshot().liveMedia).toMatchObject({
      capabilities: ["play", "pause", "seek"],
      identity: { title: "Breaking Bad" }
    });
  });

  it("supports music identity and playback state with the same normalized model", () => {
    const store = new VoiceContextStore({ now: () => 5_000 });
    store.setActiveProfile("living-room");
    const serviceScope = store.setActiveService({ id: "spotify", name: "Spotify" });

    const scope = store.observeMedia({
      capabilities: ["play", "pause", "next", "previous", "shuffle", "repeat", "queue"],
      durationSeconds: 211.25,
      identity: {
        album: "Graduation",
        artist: "Kanye West",
        contentId: "spotify:track:example",
        title: "Stronger"
      },
      mediaType: "song",
      playbackStatus: "paused",
      positionSeconds: 42
    }, serviceScope);

    expect(scope).not.toBeNull();
    expect(store.snapshot().liveMedia).toMatchObject({
      identity: {
        album: "Graduation",
        artist: "Kanye West",
        contentId: "spotify:track:example",
        title: "Stronger"
      },
      mediaType: "song",
      playbackStatus: "paused",
      positionSeconds: 42
    });
  });

  it("keeps one TV-wide conversation while scoping it to the active profile", () => {
    const store = new VoiceContextStore({ now: () => 10_000 });
    let scope = activateNetflix(store);
    scope = store.observeMedia(video(), scope) ?? scope;

    expect(store.recordMediaTarget({
      identity: { title: "Better Call Saul" },
      mediaType: "episode"
    }, scope)).toBe(true);
    expect(store.recordProvider({ id: "netflix", name: "Netflix" }, scope)).toBe(true);
    expect(store.recordVerifiedAction({ kind: "play" }, scope)).toBe(true);

    expect(store.snapshot().conversation).toMatchObject({
      lastMediaTarget: { identity: { title: "Better Call Saul" } },
      lastProvider: { id: "netflix" },
      lastVerifiedAction: { kind: "play" }
    });

    const changed = store.setActiveProfile("guest");
    expect(store.snapshot()).toMatchObject({
      activeProfileId: "guest",
      activeService: null,
      conversation: {
        candidates: null,
        lastMediaTarget: null,
        lastProvider: null,
        lastVerifiedAction: null,
        pendingClarification: null
      },
      liveMedia: null,
      revisions: changed
    });
  });

  it("preserves the explicit target while clearing transient service and media context", () => {
    const store = new VoiceContextStore({ now: () => 20_000 });
    let scope = activateNetflix(store);
    expect(store.recordMediaTarget({
      identity: { title: "Apollo 13" },
      mediaType: "movie"
    }, scope)).toBe(true);

    scope = store.setActiveService({ id: "youtube", name: "YouTube" });
    expect(store.snapshot().conversation.lastMediaTarget).toMatchObject({
      identity: { title: "Apollo 13" }
    });
    expect(store.recordProvider({ id: "youtube", name: "YouTube" }, scope)).toBe(true);

    scope = store.observeMedia({
      identity: { contentId: "video-one", creator: "Outdoor Boys", title: "First video" },
      mediaType: "video",
      playbackStatus: "playing"
    }, scope) ?? scope;
    expect(store.recordVerifiedAction({ kind: "play" }, scope)).toBe(true);

    const nextScope = store.observeMedia({
      identity: { contentId: "video-two", creator: "Outdoor Boys", title: "Second video" },
      mediaType: "video",
      playbackStatus: "playing"
    }, scope);
    expect(nextScope?.mediaRevision).toBeGreaterThan(scope.mediaRevision);
    expect(store.snapshot().conversation).toMatchObject({
      candidates: null,
      lastMediaTarget: { identity: { title: "Apollo 13" } },
      lastProvider: { id: "youtube" },
      lastVerifiedAction: null,
      pendingClarification: null
    });
  });

  it("rejects stale profile, service, and media events", () => {
    const store = new VoiceContextStore({ now: () => 30_000 });
    const beforeProfile = store.revisions();
    store.setActiveProfile("living-room");
    expect(store.recordProvider({ id: "netflix" }, beforeProfile)).toBe(false);

    const netflixScope = store.setActiveService({ id: "netflix" });
    store.setActiveService({ id: "youtube" });
    expect(store.observeMedia(video(), netflixScope)).toBeNull();

    let youtubeScope = store.revisions();
    const firstMediaScope = store.observeMedia({
      identity: { contentId: "first", title: "First" },
      mediaType: "video",
      playbackStatus: "playing"
    }, youtubeScope);
    expect(firstMediaScope).not.toBeNull();
    youtubeScope = firstMediaScope ?? youtubeScope;
    const secondMediaScope = store.observeMedia({
      identity: { contentId: "second", title: "Second" },
      mediaType: "video",
      playbackStatus: "playing"
    }, youtubeScope);
    expect(secondMediaScope).not.toBeNull();
    expect(store.updatePlayback({ playbackStatus: "paused" }, youtubeScope)).toBe(false);
    expect(store.recordVerifiedAction({ kind: "pause" }, youtubeScope)).toBe(false);
    expect(store.snapshot().liveMedia?.identity.title).toBe("Second");
  });

  it("keeps candidate IDs stable within a revision and binds clarification to it", () => {
    const store = new VoiceContextStore({ now: () => 40_000 });
    const scope = activateNetflix(store);
    const candidates = store.setCandidates([{
      id: "breaking-bad-series",
      identity: { title: "Breaking Bad", year: 2008 },
      mediaType: "episode",
      provider: { id: "netflix", name: "Netflix" }
    }, {
      identity: { title: "El Camino", year: 2019 },
      mediaType: "movie",
      provider: { id: "netflix", name: "Netflix" }
    }], scope);

    expect(candidates?.candidates.map((candidate) => candidate.id)).toEqual([
      "breaking-bad-series",
      `choice-${candidates?.revision}-2`
    ]);
    expect(store.snapshot().conversation.candidates?.candidates.map(({ id }) => id)).toEqual(
      candidates?.candidates.map(({ id }) => id)
    );
    expect(store.setPendingClarification({ kind: "candidate-selection" }, scope)).toBe(true);
    expect(store.snapshot().conversation.pendingClarification).toMatchObject({
      candidateSetRevision: candidates?.revision,
      kind: "candidate-selection"
    });

    const replacement = store.setCandidates([{
      identity: { title: "Better Call Saul" },
      mediaType: "episode"
    }], scope);
    expect(replacement?.revision).not.toBe(candidates?.revision);
    expect(store.snapshot().conversation.pendingClarification).toBeNull();
    expect(store.setPendingClarification({
      candidateSetRevision: candidates?.revision,
      kind: "candidate-selection"
    }, scope)).toBe(false);
  });

  it("expires each context tier with an injectable clock", () => {
    let now = 50_000;
    const store = new VoiceContextStore({
      now: () => now,
      ttlMs: {
        candidates: 200,
        clarification: 100,
        conversation: 300,
        liveMedia: 400
      }
    });
    let scope = activateNetflix(store);
    scope = store.observeMedia(video({ observedAt: now }), scope) ?? scope;
    store.recordMediaTarget({ identity: { title: "Breaking Bad" }, mediaType: "episode" }, scope);
    const candidates = store.setCandidates([{
      identity: { title: "Breaking Bad" },
      mediaType: "episode"
    }], scope);
    store.setPendingClarification({
      candidateSetRevision: candidates?.revision,
      kind: "candidate-selection"
    }, scope);

    now += 100;
    expect(store.snapshot().conversation.pendingClarification).toBeNull();
    expect(store.snapshot().conversation.candidates).not.toBeNull();
    now += 100;
    expect(store.snapshot().conversation.candidates).toBeNull();
    expect(store.snapshot().conversation.lastMediaTarget).not.toBeNull();
    now += 100;
    expect(store.snapshot().conversation.lastMediaTarget).toBeNull();
    now += 100;
    const expired = store.snapshot();
    expect(expired.liveMedia).toBeNull();
    expect(expired.revisions.mediaRevision).toBeGreaterThan(scope.mediaRevision);
    expect(store.updatePlayback({ playbackStatus: "paused" }, scope)).toBe(false);
  });

  it("rejects out-of-order playback observations without changing state", () => {
    let now = 60_000;
    const store = new VoiceContextStore({ now: () => now });
    let scope = activateNetflix(store);
    scope = store.observeMedia(video({ observedAt: 60_000, positionSeconds: 100 }), scope) ?? scope;
    now = 60_100;
    expect(store.updatePlayback({ observedAt: 60_100, positionSeconds: 120 }, scope)).toBe(true);
    expect(store.updatePlayback({ observedAt: 60_050, positionSeconds: 110 }, scope)).toBe(false);
    expect(store.snapshot().liveMedia?.positionSeconds).toBe(120);
  });

  it("never admits URL or transcript fields into snapshots", () => {
    const store = new VoiceContextStore({ now: () => 70_000 });
    let scope = activateNetflix(store);
    scope = store.observeMedia({
      ...video({ observedAt: 70_000 }),
      transcript: "play the secret show",
      url: "https://www.netflix.com/watch/private"
    } as VoiceLiveMediaInput, scope) ?? scope;
    store.recordMediaTarget({
      identity: {
        title: "Apollo 13",
        watchUrl: "https://www.netflix.com/watch/private"
      },
      mediaType: "movie",
      transcript: "play Apollo 13"
    } as Parameters<VoiceContextStore["recordMediaTarget"]>[0], scope);
    store.setCandidates([{
      identity: { title: "Apollo 13" },
      mediaType: "movie",
      url: "https://example.com/private"
    } as Parameters<VoiceContextStore["setCandidates"]>[0][number]], scope);

    const serialized = JSON.stringify(store.snapshot());
    expect(serialized).not.toContain("https://");
    expect(serialized).not.toContain("transcript");
    expect(serialized).not.toContain("watchUrl");
    expect(serialized).toContain("Apollo 13");
  });
});
