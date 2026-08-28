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
  it("routes ordinary controls directly", () => {
    expect(planVoiceCommand({ action: "volume-up", kind: "control" }, context)).toEqual({
      action: "volume-up",
      kind: "remote-action"
    });
    expect(planVoiceCommand({ action: "back", kind: "control" }, context)).toEqual({
      action: "back",
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

  it("routes stop through the host-owned close operation", () => {
    expect(planVoiceCommand({ action: "stop", kind: "control" }, context)).toEqual({
      kind: "close-service"
    });
    expect(planVoiceCommand({ action: "stop", kind: "control" }, {
      ...context,
      activeServiceId: null
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
});
