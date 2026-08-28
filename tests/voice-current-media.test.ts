import { describe, expect, it } from "vitest";
import {
  answerCurrentMediaQuestion,
  type VoiceCurrentMediaSnapshot
} from "../src/main/voice/voice-current-media";

function videoSnapshot(
  overrides: Partial<VoiceCurrentMediaSnapshot> = {}
): VoiceCurrentMediaSnapshot {
  return {
    album: null,
    artist: null,
    backgrounded: false,
    durationSeconds: 3_600,
    episodeNumber: 3,
    fullscreen: true,
    mediaKind: "video",
    observedAt: 1_000,
    playbackState: "playing",
    positionSeconds: 900,
    serviceId: "netflix",
    serviceName: "Netflix",
    seasonNumber: 1,
    seriesTitle: "Breaking Bad",
    subtitle: "Season 1, Episode 3",
    title: "Breaking Bad",
    ...overrides
  };
}

describe("current media voice answers", () => {
  it("reports when nothing is currently playing", () => {
    expect(answerCurrentMediaQuestion("identity", null)).toEqual({
      detail: "Nothing is playing right now.",
      handled: true
    });
  });

  it("describes the current video and episode", () => {
    expect(answerCurrentMediaQuestion("identity", videoSnapshot()).detail).toBe(
      "You're watching Breaking Bad — Season 1, Episode 3 on Netflix."
    );
    expect(answerCurrentMediaQuestion("episode", videoSnapshot()).detail).toBe(
      "You're watching Breaking Bad — Season 1, Episode 3 on Netflix."
    );
  });

  it("describes a YouTube title using its creator", () => {
    expect(answerCurrentMediaQuestion("identity", videoSnapshot({
      serviceId: "youtube",
      serviceName: "YouTube",
      subtitle: "Outdoor Boys",
      title: "Camping in a Snowstorm"
    })).detail).toBe(
      "You're watching Camping in a Snowstorm by Outdoor Boys on YouTube."
    );
  });

  it("describes the current Spotify song", () => {
    const snapshot = videoSnapshot({
      artist: "Kanye West",
      mediaKind: "audio",
      serviceId: "spotify",
      serviceName: "Spotify",
      subtitle: null,
      title: "Stronger"
    });
    expect(answerCurrentMediaQuestion("song", snapshot).detail).toBe(
      "You're listening to Stronger by Kanye West on Spotify."
    );
  });

  it("formats remaining duration and estimated end time", () => {
    const snapshot = videoSnapshot({
      durationSeconds: 7_500,
      positionSeconds: 3_600
    });
    expect(answerCurrentMediaQuestion("time-remaining", snapshot).detail).toBe(
      "There are about 1 hour and 5 minutes left."
    );
    expect(answerCurrentMediaQuestion("end-time", snapshot, {
      formatTime: () => "9:15 PM",
      now: () => 1_000
    }).detail).toBe("It should finish around 9:15 PM.");
    expect(answerCurrentMediaQuestion("time-remaining", videoSnapshot({
      durationSeconds: 3_600,
      positionSeconds: 0
    })).detail).toBe("There is about 1 hour left.");
  });

  it("does not invent a duration or episode", () => {
    const unknown = videoSnapshot({
      durationSeconds: null,
      positionSeconds: null,
      episodeNumber: null,
      seasonNumber: null,
      subtitle: null
    });
    expect(answerCurrentMediaQuestion("time-remaining", unknown).detail).toBe(
      "The current media does not report a fixed ending time."
    );
    expect(answerCurrentMediaQuestion("episode", unknown).detail).toBe(
      "You're watching Breaking Bad on Netflix, but the episode is not available."
    );
  });

  it("uses structured coordinates when an episode subtitle is unavailable", () => {
    expect(answerCurrentMediaQuestion("episode", videoSnapshot({
      subtitle: null
    })).detail).toBe(
      "You're watching Breaking Bad, season 1, episode 3 on Netflix."
    );
  });
});
