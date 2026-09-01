import { describe, expect, it } from "vitest";
import {
  planVoiceCommand,
  type VoiceCommandContext
} from "../src/main/voice/voice-command-router";
import {
  continueWatchingResumeItemId,
  markContextualPlaybackConsent,
  markContinueWatchingResume
} from "../src/main/voice/voice-intent";
import type { VoiceMediaIntent } from "../src/main/voice/voice-intent";

const context: VoiceCommandContext = {
  activeServiceId: "netflix",
  enabledServiceIds: ["netflix", "youtube"],
  muted: null,
  playbackMode: "confirm",
  playing: true,
  services: [
    { id: "netflix", name: "Netflix" },
    { id: "spotify", name: "Spotify" },
    { id: "youtube", name: "YouTube" },
    { id: "hbo-max", name: "HBO Max" },
    { id: "movie-club", name: "Movie Club" }
  ],
  serviceOrder: ["youtube", "netflix"]
};

function mediaIntent(overrides: Partial<VoiceMediaIntent> = {}): VoiceMediaIntent {
  return {
    action: "play",
    creator: null,
    episode: null,
    kind: "media",
    mediaType: "title",
    providerHint: null,
    recency: null,
    season: null,
    title: "Apollo 13",
    ...overrides
  };
}

describe("voice command planning", () => {
  it("does nothing for an underspecified command instead of guessing", () => {
    expect(planVoiceCommand({ kind: "unknown" }, context)).toEqual({
      detail: "Please name what you want to watch, play, open, or control.",
      handled: false,
      kind: "no-op"
    });
  });

  it("preserves one opaque Continue Watching item through playback planning", () => {
    const continueWatchingIntent = markContinueWatchingResume(
      mediaIntent({ providerHint: "netflix", title: "The Diplomat" }),
      "0123456789abcdef01234567"
    );
    const plan = planVoiceCommand(continueWatchingIntent, context);
    expect(plan).toMatchObject({
      candidateServiceIds: ["netflix"],
      confirmationRequired: true,
      kind: "resolve-media",
      launchAllowed: true
    });
    expect(plan.kind === "resolve-media"
      ? continueWatchingResumeItemId(plan.intent)
      : null).toBe("0123456789abcdef01234567");
  });

  it("reports an empty Continue Watching profile without toggling the current app", () => {
    expect(planVoiceCommand({
      action: "resume-continue-watching",
      kind: "control"
    }, context)).toEqual({
      detail: "There is nothing in Continue Watching for this profile yet.",
      handled: false,
      kind: "no-op"
    });
  });

  it("fails closed when a contextual reference reaches the router unresolved", () => {
    expect(planVoiceCommand({
      action: "play",
      kind: "media-reference",
      ordinal: null,
      providerHint: null,
      reference: "last-media"
    }, context)).toEqual({
      detail: "I lost track of what that referred to. Please name it again.",
      handled: false,
      kind: "no-op"
    });
  });

  it("fails closed when a spoken decision has no bound confirmation", () => {
    expect(planVoiceCommand({ action: "confirm", kind: "confirmation" }, context)).toEqual({
      detail: "There isn't a voice confirmation waiting right now.",
      handled: false,
      kind: "no-op"
    });
  });

  it("routes ordinary controls directly", () => {
    expect(planVoiceCommand({ action: "volume-up", kind: "control" }, context)).toEqual({
      action: "volume-up",
      kind: "remote-action"
    });
    expect(planVoiceCommand({ action: "back", kind: "control" }, context)).toEqual({
      action: "back",
      kind: "remote-action"
    });
    expect(planVoiceCommand({ action: "down", kind: "control" }, context)).toEqual({
      action: "down",
      kind: "remote-action"
    });
  });

  it.each([0, 20, 100])("routes absolute volume %s%% outside provider actions", (volumePercent) => {
    expect(planVoiceCommand({
      action: "set-volume",
      kind: "control",
      volumePercent
    }, context)).toEqual({
      kind: "set-system-volume",
      volumePercent
    });
  });

  it("routes current-media questions without provider navigation", () => {
    expect(planVoiceCommand({ action: "identity", kind: "current-media" }, context)).toEqual({
      action: "identity",
      kind: "query-current-media"
    });
    expect(planVoiceCommand({ action: "episode", kind: "current-media" }, context)).toEqual({
      action: "episode",
      kind: "query-current-media"
    });
    expect(planVoiceCommand({ action: "song", kind: "current-media" }, context)).toEqual({
      action: "song",
      kind: "query-current-media"
    });
    expect(planVoiceCommand({ action: "position", kind: "current-media" }, context)).toEqual({
      action: "position",
      kind: "query-current-media"
    });
    expect(planVoiceCommand({ action: "duration", kind: "current-media" }, context)).toEqual({
      action: "duration",
      kind: "query-current-media"
    });
    expect(planVoiceCommand({
      action: "time-remaining",
      kind: "current-media"
    }, context)).toEqual({
      action: "time-remaining",
      kind: "query-current-media"
    });
    expect(planVoiceCommand({ action: "end-time", kind: "current-media" }, context)).toEqual({
      action: "end-time",
      kind: "query-current-media"
    });
  });

  it("routes bounded semantic playback controls without provider discovery", () => {
    expect(planVoiceCommand({
      action: "seek-relative",
      kind: "semantic-control",
      offsetSeconds: -120,
      playbackRate: null,
      positionSeconds: null
    }, context)).toEqual({
      kind: "semantic-control",
      request: { action: "seek-relative", offsetSeconds: -120 }
    });
    expect(planVoiceCommand({
      action: "seek-absolute",
      kind: "semantic-control",
      offsetSeconds: null,
      playbackRate: null,
      positionSeconds: 90
    }, context)).toEqual({
      kind: "semantic-control",
      request: { action: "seek-absolute", positionSeconds: 90 }
    });
    expect(planVoiceCommand({
      action: "skip-intro",
      kind: "semantic-control",
      offsetSeconds: null,
      playbackRate: null,
      positionSeconds: null
    }, context)).toEqual({
      kind: "semantic-control",
      request: { action: "skip-intro" }
    });
    expect(planVoiceCommand({
      action: "set-playback-rate",
      kind: "semantic-control",
      offsetSeconds: null,
      playbackRate: 1.5,
      positionSeconds: null
    }, context)).toEqual({
      kind: "semantic-control",
      request: { action: "set-playback-rate", playbackRate: 1.5 }
    });
    for (const action of [
      "shuffle-on",
      "shuffle-off",
      "repeat-all",
      "repeat-one",
      "repeat-off"
    ] as const) {
      expect(planVoiceCommand({
        action,
        kind: "semantic-control",
        offsetSeconds: null,
        playbackRate: null,
        positionSeconds: null
      }, context)).toEqual({
        kind: "semantic-control",
        request: { action }
      });
    }
  });

  it("routes track skipping only through Spotify's semantic controls", () => {
    expect(planVoiceCommand({ action: "next-track", kind: "control" }, {
      ...context,
      activeServiceId: "spotify"
    })).toEqual({ action: "fast-forward", kind: "remote-action" });
    expect(planVoiceCommand({ action: "previous-track", kind: "control" }, {
      ...context,
      activeServiceId: "spotify"
    })).toEqual({ action: "rewind", kind: "remote-action" });
    expect(planVoiceCommand({ action: "next-track", kind: "control" }, context)).toEqual({
      detail: "Track skipping is available only while Spotify is open.",
      handled: false,
      kind: "no-op"
    });
    expect(planVoiceCommand({ action: "previous-track", kind: "control" }, {
      ...context,
      activeServiceId: null
    })).toMatchObject({ handled: false, kind: "no-op" });
  });

  it("makes pause and resume idempotent when playback state is known", () => {
    expect(planVoiceCommand({ action: "pause", kind: "control" }, {
      ...context,
      playing: false
    })).toMatchObject({ kind: "no-op" });
    expect(planVoiceCommand({ action: "resume", kind: "control" }, {
      ...context,
      playing: true
    })).toMatchObject({ kind: "no-op" });
    expect(planVoiceCommand({ action: "pause", kind: "control" }, context)).toEqual({
      action: "play-pause",
      kind: "remote-action"
    });
  });

  it("stops playback without closing the app and reserves closing for explicit exit", () => {
    expect(planVoiceCommand({ action: "stop", kind: "control" }, context)).toEqual({
      action: "play-pause",
      kind: "remote-action"
    });
    expect(planVoiceCommand({ action: "stop", kind: "control" }, {
      ...context,
      playing: false
    })).toMatchObject({ kind: "no-op" });
    expect(planVoiceCommand({ action: "close-app", kind: "control" }, context)).toEqual({
      kind: "close-service"
    });
  });

  it("sets voice mute state explicitly instead of toggling it", () => {
    expect(planVoiceCommand({ action: "mute", kind: "control" }, {
      ...context,
      muted: null
    })).toEqual({ kind: "set-system-muted", muted: true });
    expect(planVoiceCommand({ action: "unmute", kind: "control" }, {
      ...context,
      muted: true
    })).toEqual({ kind: "set-system-muted", muted: false });
    expect(planVoiceCommand({ action: "mute", kind: "control" }, {
      ...context,
      muted: true
    })).toMatchObject({ kind: "no-op" });
    expect(planVoiceCommand({ action: "unmute", kind: "control" }, {
      ...context,
      muted: false
    })).toMatchObject({ kind: "no-op" });
  });

  it("launches only one exact enabled app and reports disabled or ambiguous names", () => {
    expect(planVoiceCommand({ kind: "app", title: "Netflix" }, context)).toEqual({
      kind: "launch-service",
      serviceId: "netflix",
      serviceName: "Netflix"
    });
    expect(planVoiceCommand({ kind: "app", title: "Max" }, context)).toEqual({
      detail: "HBO Max is not enabled in this profile.",
      handled: false,
      kind: "no-op"
    });
    expect(planVoiceCommand({ kind: "app", title: "Movie Club" }, {
      ...context,
      enabledServiceIds: [...context.enabledServiceIds, "movie-club"]
    })).toMatchObject({ kind: "launch-service", serviceId: "movie-club" });
    expect(planVoiceCommand({ kind: "app", title: "Netflix" }, {
      ...context,
      services: [...context.services, { id: "custom-netflix", name: "Netflix" }]
    })).toMatchObject({ kind: "no-op" });
  });

  it("opens only supported, enabled explicit provider destinations", () => {
    expect(planVoiceCommand({
      destination: "subscriptions",
      kind: "provider-destination",
      providerHint: "youtube"
    }, context)).toEqual({
      destination: "subscriptions",
      kind: "open-provider-destination",
      serviceId: "youtube",
      serviceName: "YouTube"
    });
    expect(planVoiceCommand({
      destination: "library",
      kind: "provider-destination",
      providerHint: "spotify"
    }, {
      ...context,
      enabledServiceIds: ["spotify", "youtube"]
    })).toMatchObject({
      destination: "library",
      kind: "open-provider-destination",
      serviceId: "spotify"
    });
    expect(planVoiceCommand({
      destination: "library",
      kind: "provider-destination",
      providerHint: "spotify"
    }, context)).toEqual({
      detail: "Spotify is not enabled in this profile.",
      handled: false,
      kind: "no-op"
    });
  });

  it("fails closed for explicit providers without that fixed destination", () => {
    expect(planVoiceCommand({
      destination: "library",
      kind: "provider-destination",
      providerHint: "netflix"
    }, context)).toMatchObject({
      detail: "Netflix does not have a supported voice library destination.",
      handled: false,
      kind: "no-op"
    });
    expect(planVoiceCommand({
      destination: "subscriptions",
      kind: "provider-destination",
      providerHint: "spotify"
    }, {
      ...context,
      enabledServiceIds: ["spotify", "youtube"]
    })).toMatchObject({
      detail: "Spotify does not have a supported voice subscriptions destination.",
      handled: false,
      kind: "no-op"
    });
  });

  it("routes generic subscriptions only to enabled YouTube", () => {
    expect(planVoiceCommand({
      destination: "subscriptions",
      kind: "provider-destination",
      providerHint: null
    }, context)).toMatchObject({
      kind: "open-provider-destination",
      serviceId: "youtube"
    });
    expect(planVoiceCommand({
      destination: "subscriptions",
      kind: "provider-destination",
      providerHint: null
    }, {
      ...context,
      enabledServiceIds: ["netflix"]
    })).toEqual({
      detail: "YouTube is not enabled in this profile.",
      handled: false,
      kind: "no-op"
    });
  });

  it("uses the active capable provider for a generic library", () => {
    for (const activeServiceId of ["spotify", "youtube"] as const) {
      expect(planVoiceCommand({
        destination: "library",
        kind: "provider-destination",
        providerHint: null
      }, {
        ...context,
        activeServiceId,
        enabledServiceIds: ["spotify", "youtube"]
      })).toMatchObject({
        kind: "open-provider-destination",
        serviceId: activeServiceId
      });
    }
  });

  it("fails a generic library closed while an unsupported provider is active", () => {
    expect(planVoiceCommand({
      destination: "library",
      kind: "provider-destination",
      providerHint: null
    }, {
      ...context,
      activeServiceId: "netflix",
      enabledServiceIds: ["netflix", "spotify"]
    })).toEqual({
      detail: "Netflix does not have a supported voice library. Say Spotify library or YouTube library.",
      handled: false,
      kind: "no-op"
    });
  });

  it("uses a sole capable Home provider and asks when both libraries are enabled", () => {
    const intent = {
      destination: "library",
      kind: "provider-destination",
      providerHint: null
    } as const;
    expect(planVoiceCommand(intent, {
      ...context,
      activeServiceId: null,
      enabledServiceIds: ["netflix", "spotify"]
    })).toMatchObject({ kind: "open-provider-destination", serviceId: "spotify" });
    expect(planVoiceCommand(intent, {
      ...context,
      activeServiceId: null,
      enabledServiceIds: ["spotify", "youtube"]
    })).toEqual({
      detail: "Say Spotify library or YouTube library.",
      handled: false,
      kind: "no-op"
    });
    expect(planVoiceCommand(intent, {
      ...context,
      activeServiceId: null,
      enabledServiceIds: ["netflix"]
    })).toEqual({
      detail: "Enable Spotify or YouTube to open your library.",
      handled: false,
      kind: "no-op"
    });
  });

  it("requires confirmation only before playback", () => {
    expect(planVoiceCommand(mediaIntent(), context)).toMatchObject({
      confirmationRequired: true,
      kind: "resolve-media",
      launchAllowed: true
    });
    expect(planVoiceCommand(mediaIntent({ action: "open" }), context)).toMatchObject({
      confirmationRequired: false,
      launchAllowed: true
    });
    expect(planVoiceCommand(mediaIntent(), {
      ...context,
      playbackMode: "automatic"
    })).toMatchObject({ confirmationRequired: false });
    expect(planVoiceCommand(mediaIntent({ providerHint: "spotify" }), context))
      .toMatchObject({ confirmationRequired: false, launchAllowed: false });
  });

  it("does not ask twice after an explicit contextual provider choice", () => {
    expect(planVoiceCommand(markContextualPlaybackConsent(mediaIntent({
      providerHint: "netflix"
    })), context)).toMatchObject({
      candidateServiceIds: ["netflix"],
      confirmationRequired: false,
      launchAllowed: true
    });
  });

  it("uses enabled lineup services as the subscription boundary", () => {
    expect(planVoiceCommand(mediaIntent({ providerHint: "netflix" }), context)).toMatchObject({
      candidateServiceIds: ["netflix"],
      launchAllowed: true
    });
    expect(planVoiceCommand(mediaIntent({ providerHint: "spotify" }), context)).toMatchObject({
      candidateServiceIds: [],
      launchAllowed: false
    });
  });

  it("does not confirm or fall back to Spotify for a generic movie or show", () => {
    expect(planVoiceCommand(mediaIntent(), {
      ...context,
      enabledServiceIds: ["spotify"],
      serviceOrder: ["spotify"]
    })).toMatchObject({
      candidateServiceIds: [],
      confirmationRequired: false,
      launchAllowed: false
    });
    expect(planVoiceCommand(mediaIntent({ action: "search" }), {
      ...context,
      activeServiceId: "spotify",
      enabledServiceIds: ["spotify"],
      serviceOrder: ["spotify"]
    })).toMatchObject({ candidateServiceIds: ["spotify"], launchAllowed: true });
  });

  it("honors an explicit provider for a non-playing search regardless of media label", () => {
    expect(planVoiceCommand(mediaIntent({
      action: "search",
      mediaType: "movie",
      providerHint: "spotify",
      title: "Dune"
    }), {
      ...context,
      enabledServiceIds: ["spotify", "youtube"],
      serviceOrder: ["youtube", "spotify"]
    })).toMatchObject({ candidateServiceIds: ["spotify"], launchAllowed: true });
    expect(planVoiceCommand(mediaIntent({
      action: "search",
      mediaType: "artist",
      providerHint: "youtube",
      title: "Taylor Swift"
    }), {
      ...context,
      enabledServiceIds: ["spotify", "youtube"],
      serviceOrder: ["spotify", "youtube"]
    })).toMatchObject({ candidateServiceIds: ["youtube"], launchAllowed: true });
  });

  it("keeps an unscoped search in the active supported app before type inference", () => {
    expect(planVoiceCommand(mediaIntent({
      action: "search",
      mediaType: "artist",
      providerHint: null,
      title: "Taylor Swift"
    }), {
      ...context,
      activeServiceId: "youtube",
      enabledServiceIds: ["spotify", "youtube"],
      serviceOrder: ["spotify", "youtube"]
    })).toMatchObject({ candidateServiceIds: ["youtube"], launchAllowed: true });
    expect(planVoiceCommand(mediaIntent({
      action: "search",
      mediaType: "video",
      providerHint: null,
      title: "Taylor Swift"
    }), {
      ...context,
      activeServiceId: "netflix",
      enabledServiceIds: ["netflix", "youtube"],
      serviceOrder: ["youtube", "netflix"]
    })).toMatchObject({ candidateServiceIds: ["netflix"], launchAllowed: true });
  });

  it("lets an unscoped Home search prefer its media app or fall back safely", () => {
    expect(planVoiceCommand(mediaIntent({
      action: "search",
      mediaType: "artist",
      providerHint: null,
      title: "Taylor Swift"
    }), {
      ...context,
      activeServiceId: null,
      enabledServiceIds: ["spotify", "youtube"],
      serviceOrder: ["youtube", "spotify"]
    })).toMatchObject({
      candidateServiceIds: ["youtube", "spotify"],
      launchAllowed: true
    });
    expect(planVoiceCommand(mediaIntent({
      action: "search",
      mediaType: "artist",
      providerHint: null,
      title: "Taylor Swift"
    }), {
      ...context,
      activeServiceId: null,
      enabledServiceIds: ["youtube"],
      serviceOrder: ["youtube"]
    })).toMatchObject({ candidateServiceIds: ["youtube"], launchAllowed: true });
  });

  it("honors an explicit Disney Plus request when it is enabled", () => {
    expect(planVoiceCommand(mediaIntent({
      mediaType: "movie",
      providerHint: "disney-plus",
      title: "Moana"
    }), {
      ...context,
      enabledServiceIds: ["disney-plus", "netflix"],
      serviceOrder: ["netflix", "disney-plus"]
    })).toMatchObject({ candidateServiceIds: ["disney-plus"], launchAllowed: true });
  });

  it("uses the user's lineup order when several services could handle a title", () => {
    expect(planVoiceCommand(mediaIntent(), context)).toMatchObject({
      candidateServiceIds: ["youtube", "netflix"]
    });
  });

  it("routes audio and video types only to their deterministic providers", () => {
    expect(planVoiceCommand(mediaIntent({ mediaType: "song" }), {
      ...context,
      enabledServiceIds: ["spotify", "youtube"]
    })).toMatchObject({ candidateServiceIds: ["spotify"] });
    expect(planVoiceCommand(mediaIntent({ mediaType: "channel" }), context)).toMatchObject({
      candidateServiceIds: ["youtube"]
    });
  });

  it("routes open-ended discovery only to Netflix without playback confirmation", () => {
    expect(planVoiceCommand(mediaIntent({
      action: "open",
      mediaType: "recommendation",
      title: "action movies"
    }), context)).toMatchObject({
      candidateServiceIds: ["netflix"],
      confirmationRequired: false,
      launchAllowed: true
    });
    expect(planVoiceCommand(mediaIntent({
      action: "open",
      mediaType: "similar-title",
      title: "Inception"
    }), { ...context, enabledServiceIds: ["youtube"] })).toMatchObject({
      candidateServiceIds: [],
      launchAllowed: false
    });
  });

  it("never launches a lookup-only request", () => {
    expect(planVoiceCommand(mediaIntent({ action: "lookup" }), context)).toMatchObject({
      confirmationRequired: false,
      launchAllowed: false
    });
  });

  it("searches the active supported app without requesting playback confirmation", () => {
    expect(planVoiceCommand(mediaIntent({ action: "search" }), context)).toMatchObject({
      candidateServiceIds: ["netflix"],
      confirmationRequired: false,
      launchAllowed: true
    });
    expect(planVoiceCommand(mediaIntent({
      action: "search",
      providerHint: "youtube"
    }), context)).toMatchObject({ candidateServiceIds: ["youtube"] });
  });
});
