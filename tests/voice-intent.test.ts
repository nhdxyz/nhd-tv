import { describe, expect, it } from "vitest";
import {
  parseVoiceIntent,
  VOICE_INTENT_JSON_SCHEMA
} from "../src/main/voice/voice-intent";

function mediaIntent(overrides: Record<string, unknown> = {}) {
  return {
    kind: "media",
    confirmationAction: null,
    currentMediaAction: null,
    controlAction: null,
    semanticControlAction: null,
    offsetSeconds: null,
    positionSeconds: null,
    playbackRate: null,
    volumePercent: null,
    mediaAction: "play",
    reference: null,
    ordinal: null,
    mediaType: "title",
    title: "Apollo 13",
    creator: null,
    season: null,
    episode: null,
    providerHint: null,
    providerDestination: null,
    recency: null,
    ...overrides
  };
}

describe("voice intent boundary", () => {
  it("publishes a closed structured-output schema", () => {
    expect(VOICE_INTENT_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(VOICE_INTENT_JSON_SCHEMA.required).toEqual([
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
    ]);
    expect(VOICE_INTENT_JSON_SCHEMA.properties.semanticControlAction.anyOf[0].enum)
      .toEqual(expect.arrayContaining([
        "shuffle-on",
        "shuffle-off",
        "repeat-all",
        "repeat-one",
        "repeat-off"
      ]));
  });

  it("parses only the closed provider destinations without executable navigation data", () => {
    expect(parseVoiceIntent(mediaIntent({
      kind: "provider-destination",
      mediaAction: null,
      mediaType: null,
      providerDestination: "library",
      title: null
    }))).toEqual({
      destination: "library",
      kind: "provider-destination",
      providerHint: null
    });
    expect(parseVoiceIntent(mediaIntent({
      kind: "provider-destination",
      mediaAction: null,
      mediaType: null,
      providerDestination: "subscriptions",
      providerHint: "youtube",
      title: null
    }))).toEqual({
      destination: "subscriptions",
      kind: "provider-destination",
      providerHint: "youtube"
    });
  });

  it("strictly isolates provider destinations and rejects model-supplied routes", () => {
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "provider-destination",
      mediaAction: null,
      mediaType: null,
      providerDestination: "favorites",
      title: null
    }))).toThrow("unsupported enum");
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "provider-destination",
      mediaAction: null,
      mediaType: null,
      providerDestination: null,
      title: null
    }))).toThrow("provider-destination voice intent is incomplete");
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "provider-destination",
      mediaAction: null,
      mediaType: null,
      providerDestination: "library",
      title: "library"
    }))).toThrow("provider-destination voice intent is inconsistent");
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "provider-destination",
      mediaAction: null,
      mediaType: null,
      providerDestination: "library",
      title: null,
      url: "https://evil.example"
    }))).toThrow("exactly the allowlisted fields");
  });

  it("parses only a bare bounded confirmation decision", () => {
    expect(parseVoiceIntent(mediaIntent({
      confirmationAction: "confirm",
      kind: "confirmation",
      mediaAction: null,
      mediaType: null,
      title: null
    }))).toEqual({ action: "confirm", kind: "confirmation" });
    expect(parseVoiceIntent(mediaIntent({
      confirmationAction: "cancel",
      kind: "confirmation",
      mediaAction: null,
      mediaType: null,
      title: null
    }))).toEqual({ action: "cancel", kind: "confirmation" });
  });

  it("rejects unsupported or inconsistent confirmation decisions", () => {
    expect(() => parseVoiceIntent(mediaIntent({
      confirmationAction: "maybe",
      kind: "confirmation",
      mediaAction: null,
      mediaType: null,
      title: null
    }))).toThrow("confirmation intent is inconsistent");
    expect(() => parseVoiceIntent(mediaIntent({
      confirmationAction: "confirm",
      kind: "confirmation",
      mediaAction: null,
      mediaType: null
    }))).toThrow("confirmation intent is inconsistent");
  });

  it("parses bounded relative and absolute semantic seeks", () => {
    expect(parseVoiceIntent(mediaIntent({
      kind: "semantic-control",
      mediaAction: null,
      mediaType: null,
      offsetSeconds: -30,
      semanticControlAction: "seek-relative",
      title: null
    }))).toEqual({
      action: "seek-relative",
      kind: "semantic-control",
      offsetSeconds: -30,
      playbackRate: null,
      positionSeconds: null
    });
    expect(parseVoiceIntent(mediaIntent({
      kind: "semantic-control",
      mediaAction: null,
      mediaType: null,
      positionSeconds: 754,
      semanticControlAction: "seek-absolute",
      title: null
    }))).toEqual({
      action: "seek-absolute",
      kind: "semantic-control",
      offsetSeconds: null,
      playbackRate: null,
      positionSeconds: 754
    });
  });

  it.each([0.5, 0.75, 1, 1.25, 1.5] as const)(
    "parses the exact playback rate %s",
    (playbackRate) => {
      expect(parseVoiceIntent(mediaIntent({
        kind: "semantic-control",
        mediaAction: null,
        mediaType: null,
        playbackRate,
        semanticControlAction: "set-playback-rate",
        title: null
      }))).toEqual({
        action: "set-playback-rate",
        kind: "semantic-control",
        offsetSeconds: null,
        playbackRate,
        positionSeconds: null
      });
    }
  );

  it.each([0, 0.8, 1.3, 2, "1.5", Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects the unsupported playback rate %s",
    (playbackRate) => {
      expect(() => parseVoiceIntent(mediaIntent({
        kind: "semantic-control",
        mediaAction: null,
        mediaType: null,
        playbackRate,
        semanticControlAction: "set-playback-rate",
        title: null
      }))).toThrow("unsupported playback rate");
    }
  );

  it("strictly isolates the playback-rate parameter", () => {
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "semantic-control",
      mediaAction: null,
      mediaType: null,
      semanticControlAction: "set-playback-rate",
      title: null
    }))).toThrow("require only an allowlisted rate");
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "semantic-control",
      mediaAction: null,
      mediaType: null,
      offsetSeconds: 10,
      playbackRate: 1.5,
      semanticControlAction: "set-playback-rate",
      title: null
    }))).toThrow("require only an allowlisted rate");
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "semantic-control",
      mediaAction: null,
      mediaType: null,
      playbackRate: 1.5,
      semanticControlAction: "restart",
      title: null
    }))).toThrow("cannot contain seek parameters");
    expect(() => parseVoiceIntent(mediaIntent({ playbackRate: 1.5 })))
      .toThrow("voice intent kind is invalid");
  });

  it.each([0, 20, 100])("parses the bounded absolute volume %s%%", (volumePercent) => {
    expect(parseVoiceIntent(mediaIntent({
      controlAction: "set-volume",
      kind: "control",
      mediaAction: null,
      mediaType: null,
      title: null,
      volumePercent
    }))).toEqual({
      action: "set-volume",
      kind: "control",
      volumePercent
    });
  });

  it.each([-1, 101, 20.5, "20"])(
    "rejects an invalid absolute volume value %s",
    (volumePercent) => {
      expect(() => parseVoiceIntent(mediaIntent({
        controlAction: "set-volume",
        kind: "control",
        mediaAction: null,
        mediaType: null,
        title: null,
        volumePercent
      }))).toThrow("invalid number");
    }
  );

  it("strictly isolates the absolute volume parameter", () => {
    expect(() => parseVoiceIntent(mediaIntent({
      controlAction: "set-volume",
      kind: "control",
      mediaAction: null,
      mediaType: null,
      title: null
    }))).toThrow("require a volume percent");
    expect(() => parseVoiceIntent(mediaIntent({
      controlAction: "volume-up",
      kind: "control",
      mediaAction: null,
      mediaType: null,
      title: null,
      volumePercent: 20
    }))).toThrow("Only absolute volume controls");
  });

  it.each([
    "restart",
    "next",
    "previous",
    "skip-intro",
    "skip-recap",
    "skip-ad",
    "captions-on",
    "captions-off",
    "fullscreen-enter",
    "fullscreen-exit",
    "shuffle-on",
    "shuffle-off",
    "repeat-all",
    "repeat-one",
    "repeat-off"
  ] as const)("parses the parameter-free semantic control %s", (semanticControlAction) => {
    expect(parseVoiceIntent(mediaIntent({
      kind: "semantic-control",
      mediaAction: null,
      mediaType: null,
      semanticControlAction,
      title: null
    }))).toEqual({
      action: semanticControlAction,
      kind: "semantic-control",
      offsetSeconds: null,
      playbackRate: null,
      positionSeconds: null
    });
  });

  it("strictly isolates and bounds semantic control parameters", () => {
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "semantic-control",
      mediaAction: null,
      mediaType: null,
      offsetSeconds: 0,
      semanticControlAction: "seek-relative",
      title: null
    }))).toThrow("nonzero offset");
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "semantic-control",
      mediaAction: null,
      mediaType: null,
      offsetSeconds: 3_601,
      semanticControlAction: "seek-relative",
      title: null
    }))).toThrow("invalid number");
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "semantic-control",
      mediaAction: null,
      mediaType: null,
      positionSeconds: 86_401,
      semanticControlAction: "seek-absolute",
      title: null
    }))).toThrow("invalid number");
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "semantic-control",
      mediaAction: null,
      mediaType: null,
      offsetSeconds: 30,
      semanticControlAction: "restart",
      title: null
    }))).toThrow("cannot contain seek parameters");
    expect(() => parseVoiceIntent(mediaIntent({
      kind: "semantic-control",
      mediaAction: null,
      mediaType: null,
      semanticControlAction: "restart"
    }))).toThrow("semantic-control voice intent is inconsistent");
  });

  it.each([
    "shuffle-on",
    "shuffle-off",
    "repeat-all",
    "repeat-one",
    "repeat-off"
  ] as const)("requires every unrelated field to stay null for Spotify mode %s", (
    semanticControlAction
  ) => {
    for (const inconsistent of [
      { offsetSeconds: 1 },
      { positionSeconds: 1 },
      { playbackRate: 1 },
      { providerHint: "spotify" },
      { title: "Discover Weekly" }
    ]) {
      expect(() => parseVoiceIntent(mediaIntent({
        kind: "semantic-control",
        mediaAction: null,
        mediaType: null,
        semanticControlAction,
        title: null,
        ...inconsistent
      }))).toThrow();
    }
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
      confirmationAction: null,
      currentMediaAction: null,
      controlAction: "pause",
      semanticControlAction: null,
      offsetSeconds: null,
      positionSeconds: null,
      playbackRate: null,
      volumePercent: null,
      mediaAction: null,
      reference: null,
      ordinal: null,
      mediaType: null,
      title: null,
      creator: null,
      season: null,
      episode: null,
      providerHint: null,
      providerDestination: null,
      recency: null
    })).toEqual({ action: "pause", kind: "control" });
    expect(parseVoiceIntent({
      kind: "control",
      confirmationAction: null,
      currentMediaAction: null,
      controlAction: "close-app",
      semanticControlAction: null,
      offsetSeconds: null,
      positionSeconds: null,
      playbackRate: null,
      volumePercent: null,
      mediaAction: null,
      reference: null,
      ordinal: null,
      mediaType: null,
      title: null,
      creator: null,
      season: null,
      episode: null,
      providerHint: null,
      providerDestination: null,
      recency: null
    })).toEqual({ action: "close-app", kind: "control" });
    expect(parseVoiceIntent({
      kind: "control",
      confirmationAction: null,
      currentMediaAction: null,
      controlAction: "next-track",
      semanticControlAction: null,
      offsetSeconds: null,
      positionSeconds: null,
      playbackRate: null,
      volumePercent: null,
      mediaAction: null,
      reference: null,
      ordinal: null,
      mediaType: null,
      title: null,
      creator: null,
      season: null,
      episode: null,
      providerHint: null,
      providerDestination: null,
      recency: null
    })).toEqual({ action: "next-track", kind: "control" });
  });

  it.each([
    ["duration", "duration"],
    ["identity", "identity"],
    ["episode", "episode"],
    ["position", "position"],
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
      currentMediaAction: "playback-status",
      mediaAction: null,
      mediaType: null,
      title: null
    }))).toThrow("current-media voice intent is inconsistent");
  });

  it("accepts only an entirely empty unknown intent", () => {
    expect(parseVoiceIntent({
      kind: "unknown",
      confirmationAction: null,
      currentMediaAction: null,
      controlAction: null,
      semanticControlAction: null,
      offsetSeconds: null,
      positionSeconds: null,
      playbackRate: null,
      volumePercent: null,
      mediaAction: null,
      reference: null,
      ordinal: null,
      mediaType: null,
      title: null,
      creator: null,
      season: null,
      episode: null,
      providerHint: null,
      providerDestination: null,
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
