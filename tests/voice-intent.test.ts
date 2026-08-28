import { describe, expect, it } from "vitest";
import {
  parseVoiceIntent,
  VOICE_INTENT_JSON_SCHEMA
} from "../src/main/voice/voice-intent";

function mediaIntent(overrides: Record<string, unknown> = {}) {
  return {
    kind: "media",
    controlAction: null,
    mediaAction: "play",
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
      "controlAction",
      "mediaAction",
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
      controlAction: "pause",
      mediaAction: null,
      mediaType: null,
      title: null,
      creator: null,
      season: null,
      episode: null,
      providerHint: null,
      recency: null
    })).toEqual({ action: "pause", kind: "control" });
  });

  it("accepts only an entirely empty unknown intent", () => {
    expect(parseVoiceIntent({
      kind: "unknown",
      controlAction: null,
      mediaAction: null,
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
