import { describe, expect, it } from "vitest";
import { matchVoiceAppService } from "../src/main/voice/voice-app-matcher";
import { voiceTranscriptShortcut } from "../src/main/voice/voice-transcript-shortcuts";

describe("common voice utterance contract", () => {
  it.each([
    ["Pause the movie", "pause"],
    ["continue playing", "resume"],
    ["turn it up", "volume-up"],
    ["lower the volume", "volume-down"],
    ["mute the TV", "mute"],
    ["unmute", "unmute"],
    ["next song", "next-track"],
    ["skip this song", "next-track"],
    ["previous track", "previous-track"],
    ["go home", "home"],
    ["take me back", "back"],
    ["move down", "down"],
    ["move left", "left"],
    ["press select", "select"],
    ["stop playback", "stop"],
    ["exit this app", "close-app"]
  ] as const)("routes %s as the closed %s control", (phrase, action) => {
    expect(voiceTranscriptShortcut(phrase)).toEqual({ action, kind: "control" });
  });

  it.each([
    ["Netflix", "netflix"],
    ["Open the Netflix app", "netflix"],
    ["switch to YouTube", "youtube"],
    ["go to Spotify", "spotify"],
    ["launch Disney Plus", "disney plus"],
    ["open Max", "max"],
    ["start Amazon Prime Video", "amazon prime video"],
    ["open Apple TV+", "apple tv plus"]
  ] as const)("recognizes the explicit app phrase %s", (phrase, title) => {
    expect(voiceTranscriptShortcut(phrase)).toEqual({ kind: "app", title });
  });

  it("does not steal media titles, creator navigation, or parameterized controls", () => {
    expect(voiceTranscriptShortcut("Up")).toBeNull();
    expect(voiceTranscriptShortcut("Home")).toBeNull();
    expect(voiceTranscriptShortcut("Play Up")).toBeNull();
    expect(voiceTranscriptShortcut("Go to Outdoor Boys channel")).toBeNull();
    expect(voiceTranscriptShortcut("Rewind thirty seconds")).toBeNull();
    expect(voiceTranscriptShortcut("Skip")).toBeNull();
    expect(voiceTranscriptShortcut("Next episode")).toBeNull();
    expect(voiceTranscriptShortcut("Set volume to twenty percent")).toBeNull();
  });

  it.each([
    "Play Dune on Max",
    "Open Dune on Hulu",
    "Search Prime Video for Dune",
    "Find Dune on Apple TV"
  ])("safely rejects media targeted at an unsupported provider: %s", (phrase) => {
    expect(voiceTranscriptShortcut(phrase)).toEqual({ kind: "unknown" });
  });

  it("preserves app launch and supported-provider media phrases", () => {
    expect(voiceTranscriptShortcut("Open Max")).toEqual({ kind: "app", title: "max" });
    expect(voiceTranscriptShortcut("Play Dune on Netflix")).toBeNull();
    expect(voiceTranscriptShortcut("Search YouTube for Taylor Swift")).toBeNull();
  });

  it("matches only one trusted service and supports exact custom app names", () => {
    const services = [
      { id: "hbo-max", name: "HBO Max" },
      { id: "netflix", name: "Netflix" },
      { id: "movie-club", name: "Movie Club" }
    ];
    expect(matchVoiceAppService("Max", services)).toEqual({
      kind: "match",
      service: services[0]
    });
    expect(matchVoiceAppService("the Netflix app", services)).toEqual({
      kind: "match",
      service: services[1]
    });
    expect(matchVoiceAppService("Movie Club", services)).toEqual({
      kind: "match",
      service: services[2]
    });
    expect(matchVoiceAppService("Netflix", [
      ...services,
      { id: "custom-netflix", name: "Netflix" }
    ])).toEqual({ kind: "ambiguous" });
  });
});
