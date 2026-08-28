import { describe, expect, it } from "vitest";
import { matchVoiceAppService } from "../src/main/voice/voice-app-matcher";
import { voiceTranscriptShortcut } from "../src/main/voice/voice-transcript-shortcuts";

describe("common voice utterance contract", () => {
  it.each([
    ["yes", "confirm"],
    ["yeah", "confirm"],
    ["yep", "confirm"],
    ["confirm", "confirm"],
    ["go ahead", "confirm"],
    ["no", "cancel"],
    ["nope", "cancel"],
    ["cancel", "cancel"],
    ["never mind", "cancel"]
  ] as const)("represents the bare confirmation answer %s", (phrase, action) => {
    expect(voiceTranscriptShortcut(phrase)).toEqual({ action, kind: "confirmation" });
  });

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
    expect(voiceTranscriptShortcut("Skip")).toBeNull();
  });

  it.each([
    ["Set volume to twenty percent", 20],
    ["set the volume at 35", 35],
    ["turn the TV volume down to 0%", 0],
    ["put volume at ninety nine percent", 99],
    ["volume to one hundred percent", 100]
  ] as const)("normalizes the absolute volume %s", (phrase, volumePercent) => {
    expect(voiceTranscriptShortcut(phrase)).toEqual({
      action: "set-volume",
      kind: "control",
      volumePercent
    });
  });

  it.each([
    "set volume to -1 percent",
    "set volume to minus one percent",
    "set volume to 101 percent",
    "set volume to 20.5 percent",
    "set volume to loud"
  ])("rejects an invalid absolute volume without guessing: %s", (phrase) => {
    expect(voiceTranscriptShortcut(phrase)).toEqual({ kind: "unknown" });
  });

  it("does not steal volume-like media titles or relative controls", () => {
    expect(voiceTranscriptShortcut("Play Volume 2")).toBeNull();
    expect(voiceTranscriptShortcut("Volume 2")).toBeNull();
    expect(voiceTranscriptShortcut("turn it up")).toEqual({
      action: "volume-up",
      kind: "control"
    });
  });

  it.each([
    ["How far into this am I?", "position"],
    ["how far in am I", "position"],
    ["What timestamp are we at?", "position"],
    ["What's the current timestamp?", "position"],
    ["How long is this?", "duration"],
    ["how long is this episode", "duration"],
    ["What's the runtime?", "duration"],
    ["what is the total runtime", "duration"],
    ["How much time is left?", "time-remaining"],
    ["When will this end?", "end-time"]
  ] as const)("represents the read-only current-media question %s", (phrase, action) => {
    expect(voiceTranscriptShortcut(phrase)).toEqual({
      action,
      kind: "current-media"
    });
  });

  it("does not confuse current timing questions with seeks or titled media", () => {
    expect(voiceTranscriptShortcut("Play The Runtime")).toBeNull();
    expect(voiceTranscriptShortcut("Play How Long Is This Love")).toBeNull();
    expect(voiceTranscriptShortcut("go to timestamp 12:30")).toEqual({
      action: "seek-absolute",
      kind: "semantic-control",
      offsetSeconds: null,
      positionSeconds: 750
    });
  });

  it.each([
    ["Rewind thirty seconds", -30],
    ["skip ahead 2 minutes", 120],
    ["go back one minute and thirty seconds", -90],
    ["fast-forward one hour", 3_600]
  ] as const)("normalizes the relative seek %s", (phrase, offsetSeconds) => {
    expect(voiceTranscriptShortcut(phrase)).toEqual({
      action: "seek-relative",
      kind: "semantic-control",
      offsetSeconds,
      positionSeconds: null
    });
  });

  it.each([
    ["go to 12:34", 754],
    ["jump to one hour two minutes and three seconds", 3_723],
    ["seek to timestamp 0:05", 5],
    ["go to zero seconds", 0]
  ] as const)("normalizes the absolute seek %s", (phrase, positionSeconds) => {
    expect(voiceTranscriptShortcut(phrase)).toEqual({
      action: "seek-absolute",
      kind: "semantic-control",
      offsetSeconds: null,
      positionSeconds
    });
  });

  it.each([
    ["restart", "restart"],
    ["start over", "restart"],
    ["next episode", "next"],
    ["previous video", "previous"],
    ["skip the intro", "skip-intro"],
    ["skip recap", "skip-recap"],
    ["skip ad", "skip-ad"],
    ["turn captions on", "captions-on"],
    ["subtitles off", "captions-off"],
    ["go fullscreen", "fullscreen-enter"],
    ["exit full-screen", "fullscreen-exit"]
  ] as const)("represents the semantic playback phrase %s", (phrase, action) => {
    expect(voiceTranscriptShortcut(phrase)).toEqual({
      action,
      kind: "semantic-control",
      offsetSeconds: null,
      positionSeconds: null
    });
  });

  it("preserves legacy controls and titles around semantic-control words", () => {
    expect(voiceTranscriptShortcut("Back")).toBeNull();
    expect(voiceTranscriptShortcut("fast forward")).toEqual({
      action: "fast-forward",
      kind: "control"
    });
    expect(voiceTranscriptShortcut("rewind")).toEqual({ action: "rewind", kind: "control" });
    expect(voiceTranscriptShortcut("next track")).toEqual({
      action: "next-track",
      kind: "control"
    });
    expect(voiceTranscriptShortcut("previous track")).toEqual({
      action: "previous-track",
      kind: "control"
    });
    expect(voiceTranscriptShortcut("Play Next Friday")).toBeNull();
    expect(voiceTranscriptShortcut("Play Restart the Earth")).toBeNull();
    expect(voiceTranscriptShortcut("Go to Back to the Future")).toBeNull();
  });

  it.each([
    ["Play it", "play", "last-media", null],
    ["put that on", "play", "last-media", null],
    ["open it", "open", "last-media", null],
    ["where can I watch it", "lookup", "last-media", null],
    ["what service has it", "lookup", "last-media", null],
    ["play this", "play", "current-media", null],
    ["the first one", "play", "candidate", 1],
    ["the second one", "play", "candidate", 2],
    ["the third one", "play", "candidate", 3],
    ["the tenth one", "play", "candidate", 10]
  ] as const)("represents the shared-context phrase %s", (phrase, action, reference, ordinal) => {
    expect(voiceTranscriptShortcut(phrase)).toEqual({
      action,
      kind: "media-reference",
      ordinal,
      providerHint: null,
      reference
    });
  });

  it.each([
    ["on Netflix instead", "netflix"],
    ["Spotify instead", "spotify"],
    ["on YouTube instead", "youtube"],
    ["Disney Plus instead", "disney-plus"]
  ] as const)("preserves the provider correction %s", (phrase, providerHint) => {
    expect(voiceTranscriptShortcut(phrase)).toEqual({
      action: "play",
      kind: "media-reference",
      ordinal: null,
      providerHint,
      reference: "last-media"
    });
  });

  it("does not broaden underspecified guards into titled media or controls", () => {
    expect(voiceTranscriptShortcut("Play It 2017")).toBeNull();
    expect(voiceTranscriptShortcut("Play That Thing You Do")).toBeNull();
    expect(voiceTranscriptShortcut("Play The First Omen")).toBeNull();
    expect(voiceTranscriptShortcut("On Netflix instead of YouTube")).toBeNull();
    expect(voiceTranscriptShortcut("Pause it")).toEqual({
      action: "pause",
      kind: "control"
    });
  });

  it("does not steal controls or media titles containing decision words", () => {
    expect(voiceTranscriptShortcut("stop")).toEqual({ action: "stop", kind: "control" });
    expect(voiceTranscriptShortcut("play it")).toMatchObject({
      action: "play",
      kind: "media-reference"
    });
    expect(voiceTranscriptShortcut("Play Yes Man")).toBeNull();
    expect(voiceTranscriptShortcut("Play No Country for Old Men")).toBeNull();
    expect(voiceTranscriptShortcut("Play Nope")).toBeNull();
    expect(voiceTranscriptShortcut("Play Never Mind the Buzzcocks")).toBeNull();
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
