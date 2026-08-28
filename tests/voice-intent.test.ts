import { describe, expect, it } from "vitest";
import {
  parseVoiceIntent,
  VOICE_INTENT_JSON_SCHEMA
} from "../src/main/voice/voice-intent";

function mediaIntent(overrides: Record<string, unknown> = {}) {
  return {
    kind: "media",
    currentMediaAction: null,
    controlAction: null,
    mediaAction: "play",
    reference: null,
    ordinal: null,
    mediaType: "title",
    title: "Apollo 13",
    creator: null,
    season: null,
    episode: null,
    providerHint: null,
    recency: null,
    ...overrides
  };
}

describe("voice intent boundary", () => {
  it("publishes a closed structured-output schema", () => {
    expect(VOICE_INTENT_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(VOICE_INTENT_JSON_SCHEMA.required).toEqual([
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
    ]);
  });

  it("parses a generic title request without choosing a provider", () => {
    expect(parseVoiceIntent(mediaIntent())).toEqual({
      action: "play",
      creator: null,
      episode: null,
      kind: "media",
      mediaType: "title",
      providerHint: null,
      recency: null,
      season: null,
      title: "Apollo 13"
    });
  });

  it("parses shared-context media references without inventing a title", () => {
    expect(parseVoiceIntent(mediaIntent({
      kind: "media-reference",
      mediaType: null,
      title: null,
      reference: "last-media"
    }))).toEqual({
      action: "play",
      kind: "media-reference",
      ordinal: null,
      providerHint: null,
      reference: "last-media"
    });
    expect(parseVoiceIntent(mediaIntent({
      kind: "media-reference",
      mediaType: null,
      ordinal: 3,
      providerHint: "netflix",
      reference: "candidate",
      title: null
    }))).toEqual({
      action: "play",
      kind: "media-reference",
      ordinal: 3,
      providerHint: "netflix",
      reference: "candidate"
    });
  });

  it("strictly bounds and isolates media-reference fields", () => {
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "media-reference",
      mediaType: null,
      ordinal: 11,
      reference: "candidate",
      title: null
    }))).toThrow("invalid number");
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "media-reference",
      mediaType: null,
      ordinal: 2,
      reference: "last-media",
      title: null
    }))).toThrow("Only candidate references");
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "media-reference",
      mediaType: null,
      reference: "last-media"
    }))).toThrow("media-reference voice intent is inconsistent");
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "media-reference",
      mediaAction: null,
      mediaType: null,
      reference: "last-media",
      title: null
    }))).toThrow("media-reference voice intent is incomplete");
  });

  it("parses an app launch without letting the model choose a URL or service id", () => {
    expect(parseVoiceIntent(mediaIntent({
      kind: "app",
      mediaAction: null,
      mediaType: null,
      title: "Prime Video"
    }))).toEqual({ kind: "app", title: "Prime Video" });
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "app",
      mediaType: null,
      title: "Netflix"
    }))).toThrow("app intent is inconsistent");
  });

  it("parses an exact Netflix episode", () => {
    expect(parseVoiceIntent(mediaIntent({
      mediaType: "episode",
      title: "  Breaking   Bad ",
      season: 1,
      episode: 3,
      providerHint: "netflix"
    }))).toMatchObject({
      episode: 3,
      mediaType: "episode",
      providerHint: "netflix",
      season: 1,
      title: "Breaking Bad"
    });
  });

  it("parses Spotify and YouTube navigation requests", () => {
    expect(parseVoiceIntent(mediaIntent({
      mediaAction: "open",
      mediaType: "artist",
      title: "Kanye West",
      providerHint: "spotify"
    }))).toMatchObject({ action: "open", mediaType: "artist", providerHint: "spotify" });
    expect(parseVoiceIntent(mediaIntent({
      mediaType: "channel",
      title: "Outdoor Boys",
      providerHint: "youtube"
    }))).toMatchObject({ mediaType: "channel", providerHint: "youtube" });
  });

  it("distinguishes search-only media from lookup and playback", () => {
    expect(parseVoiceIntent(mediaIntent({
      mediaAction: "search",
      title: "Dune"
    }))).toMatchObject({ action: "search", kind: "media", title: "Dune" });
    expect(parseVoiceIntent(mediaIntent({
      mediaAction: "search",
      mediaType: "movie",
      providerHint: "spotify",
      title: "Dune"
    }))).toMatchObject({ action: "search", mediaType: "movie", providerHint: "spotify" });
    expect(parseVoiceIntent(mediaIntent({
      mediaAction: "search",
      mediaType: "artist",
      providerHint: "youtube",
      title: "Taylor Swift"
    }))).toMatchObject({ action: "search", mediaType: "artist", providerHint: "youtube" });
  });

  it("preserves an explicit Disney Plus destination for exact media", () => {
    expect(parseVoiceIntent(mediaIntent({
      mediaType: "movie",
      providerHint: "disney-plus",
      title: "Moana"
    }))).toMatchObject({ mediaType: "movie", providerHint: "disney-plus" });
  });

  it("parses bounded recommendation and similar-title discovery requests", () => {
    expect(parseVoiceIntent(mediaIntent({
      mediaAction: "open",
      mediaType: "recommendation",
      title: "tense action movies with a clever lead"
    }))).toMatchObject({
      action: "open",
      mediaType: "recommendation",
      title: "tense action movies with a clever lead"
    });
    expect(parseVoiceIntent(mediaIntent({
      mediaAction: "open",
      mediaType: "similar-title",
      title: "Inception"
    }))).toMatchObject({ mediaType: "similar-title", title: "Inception" });
  });

  it("parses an allowlisted control with no media fields", () => {
    expect(parseVoiceIntent({
      kind: "control",
      currentMediaAction: null,
      controlAction: "pause",
      mediaAction: null,
      reference: null,
      ordinal: null,
      mediaType: null,
      title: null,
      creator: null,
      season: null,
      episode: null,
      providerHint: null,
      recency: null
    })).toEqual({ action: "pause", kind: "control" });
    expect(parseVoiceIntent({
      kind: "control",
      currentMediaAction: null,
      controlAction: "close-app",
      mediaAction: null,
      reference: null,
      ordinal: null,
      mediaType: null,
      title: null,
      creator: null,
      season: null,
      episode: null,
      providerHint: null,
      recency: null
    })).toEqual({ action: "close-app", kind: "control" });
    expect(parseVoiceIntent({
      kind: "control",
      currentMediaAction: null,
      controlAction: "next-track",
      mediaAction: null,
      reference: null,
      ordinal: null,
      mediaType: null,
      title: null,
      creator: null,
      season: null,
      episode: null,
      providerHint: null,
      recency: null
    })).toEqual({ action: "next-track", kind: "control" });
  });

  it.each([
    ["identity", "identity"],
    ["episode", "episode"],
    ["song", "song"],
    ["time-remaining", "time-remaining"],
    ["end-time", "end-time"]
  ] as const)("parses the closed current-media question %s", (currentMediaAction, action) => {
    expect(parseVoiceIntent(mediaIntent({
      kind: "current-media",
      currentMediaAction,
      mediaAction: null,
      mediaType: null,
      title: null
    }))).toEqual({ action, kind: "current-media" });
  });

  it("rejects executable or media fields on current-media questions", () => {
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "current-media",
      currentMediaAction: "identity",
      mediaAction: "play",
      mediaType: null,
      title: null
    }))).toThrow("current-media voice intent is inconsistent");
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "current-media",
      currentMediaAction: "position",
      mediaAction: null,
      mediaType: null,
      title: null
    }))).toThrow("current-media voice intent is inconsistent");
  });

  it("accepts only an entirely empty unknown intent", () => {
    expect(parseVoiceIntent({
      kind: "unknown",
      currentMediaAction: null,
      controlAction: null,
      mediaAction: null,
      reference: null,
      ordinal: null,
      mediaType: null,
      title: null,
      creator: null,
      season: null,
      episode: null,
      providerHint: null,
      recency: null
    })).toEqual({ kind: "unknown" });
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "unknown",
      mediaAction: null
    }))).toThrow("unknown voice intent is inconsistent");
  });

  it("rejects extra fields, executable URLs, and unknown actions", () => {
    expect(() => parseVoiceIntent(mediaIntent({ selector: "#play" }))).toThrow("exactly");
    expect(() => parseVoiceIntent(mediaIntent({ title: "https://evil.example/watch" }))).toThrow(
      "invalid text"
    );
    expect(() => parseVoiceIntent(mediaIntent({ mediaAction: "purchase" }))).toThrow(
      "unsupported enum"
    );
  });

  it("requires exact episode coordinates and rejects irrelevant coordinates", () => {
    expect(() => parseVoiceIntent(mediaIntent({ mediaType: "episode", season: 1 }))).toThrow(
      "require a season and episode"
    );
    expect(() => parseVoiceIntent(mediaIntent({ season: 1, episode: 3 }))).toThrow(
      "Only episode intents"
    );
  });

  it("rejects cross-provider media hints", () => {
    expect(() => parseVoiceIntent(mediaIntent({
      mediaType: "song",
      providerHint: "netflix"
    }))).toThrow("only target Spotify");
    expect(() => parseVoiceIntent(mediaIntent({
      mediaType: "video",
      providerHint: "spotify"
    }))).toThrow("only target YouTube");
    expect(() => parseVoiceIntent(mediaIntent({
      mediaType: "movie",
      providerHint: "spotify"
    }))).toThrow("only receive audio intents");
  });

  it("never turns an open-ended recommendation into automatic playback", () => {
    expect(() => parseVoiceIntent(mediaIntent({
      mediaType: "recommendation",
      title: "action movies"
    }))).toThrow("only open Netflix discovery");
    expect(() => parseVoiceIntent(mediaIntent({
      mediaAction: "open",
      mediaType: "similar-title",
      providerHint: "youtube",
      title: "Inception"
    }))).toThrow("only open Netflix discovery");
  });

  it("requires a creator for latest-video requests", () => {
    expect(parseVoiceIntent(mediaIntent({
      creator: "Outdoor Boys",
      mediaType: "video",
      providerHint: "youtube",
      recency: "latest",
      title: "latest video"
    }))).toMatchObject({ creator: "Outdoor Boys", recency: "latest" });
    expect(() => parseVoiceIntent(mediaIntent({
      mediaType: "video",
      providerHint: "youtube",
      recency: "latest"
    }))).toThrow("require a video creator");
  });

  it("bounds title, season, and episode values", () => {
    expect(() => parseVoiceIntent(mediaIntent({ title: "x".repeat(161) }))).toThrow("invalid text");
    expect(() => parseVoiceIntent(mediaIntent({
      mediaType: "episode",
      season: 0,
      episode: 1
    }))).toThrow("invalid number");
    expect(() => parseVoiceIntent(mediaIntent({
      mediaType: "episode",
      season: 1,
      episode: 1_001
    }))).toThrow("invalid number");
  });
});
