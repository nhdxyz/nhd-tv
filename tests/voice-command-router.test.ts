import { describe, expect, it } from "vitest";
import {
  planVoiceCommand,
  type VoiceCommandContext
} from "../src/main/voice/voice-command-router";
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
