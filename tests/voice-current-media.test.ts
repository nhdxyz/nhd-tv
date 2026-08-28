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
    playbackRate: 1,
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

  it("formats elapsed position and total runtime from observed playback", () => {
    expect(answerCurrentMediaQuestion("position", videoSnapshot()).detail).toBe(
      "You're 15 minutes into this."
    );
    expect(answerCurrentMediaQuestion("duration", videoSnapshot()).detail).toBe(
      "The total runtime is 1 hour."
    );
    const precise = videoSnapshot({
      durationSeconds: 3_723.4,
      positionSeconds: 754.4
    });
    expect(answerCurrentMediaQuestion("position", precise).detail).toBe(
      "You're 12 minutes and 34 seconds into this."
    );
    expect(answerCurrentMediaQuestion("duration", precise).detail).toBe(
      "The total runtime is 1 hour, 2 minutes, and 3 seconds."
    );
  });

  it("reports the beginning and bounds a stale position to the observed runtime", () => {
    expect(answerCurrentMediaQuestion("position", videoSnapshot({
      positionSeconds: 0
    })).detail).toBe("Playback is at the beginning.");
    expect(answerCurrentMediaQuestion("position", videoSnapshot({
      durationSeconds: 3_600,
      positionSeconds: 3_700
    })).detail).toBe("You're 1 hour into this.");
  });

  it("formats remaining duration and estimated end time", () => {
    const snapshot = videoSnapshot({
      durationSeconds: 7_500,
      positionSeconds: 3_600
    });
    expect(answerCurrentMediaQuestion("time-remaining", snapshot, {
      now: () => 1_000
    }).detail).toBe(
      "There are about 1 hour and 5 minutes left."
    );
    expect(answerCurrentMediaQuestion("end-time", snapshot, {
      formatTime: () => "9:15 PM",
      now: () => 1_000
    }).detail).toBe("It should finish around 9:15 PM.");
    expect(answerCurrentMediaQuestion("time-remaining", videoSnapshot({
      durationSeconds: 3_600,
      positionSeconds: 0
    }), {
      now: () => 1_000
    }).detail).toBe("There is about 1 hour left.");
  });

  it("uses fresh elapsed time and playback speed for wall-clock timing", () => {
    const snapshot = videoSnapshot({
      durationSeconds: 3_600,
      observedAt: 1_000,
      playbackRate: 1.5,
      positionSeconds: 600
    });
    expect(answerCurrentMediaQuestion("position", snapshot, {
      now: () => 11_000
    }).detail).toBe("You're 10 minutes and 15 seconds into this.");
    expect(answerCurrentMediaQuestion("time-remaining", snapshot, {
      now: () => 11_000
    }).detail).toBe("There are about 34 minutes left.");

    let estimatedEnd = 0;
    expect(answerCurrentMediaQuestion("end-time", snapshot, {
      formatTime: (timestamp) => {
        estimatedEnd = timestamp;
        return "12:25 PM";
      },
      now: () => 11_000
    }).detail).toBe("It should finish around 12:25 PM.");
    expect(estimatedEnd).toBe(2_001_000);
  });

  it("does not extrapolate paused, unknown, or stale timing observations", () => {
    const paused = videoSnapshot({
      durationSeconds: 3_600,
      observedAt: 1_000,
      playbackRate: 2,
      playbackState: "paused",
      positionSeconds: 600
    });
    expect(answerCurrentMediaQuestion("position", paused, {
      now: () => 11_000
    }).detail).toBe("You're 10 minutes into this.");
    expect(answerCurrentMediaQuestion("time-remaining", paused, {
      now: () => 11_000
    }).detail).toBe("Playback is paused with about 50 minutes of content remaining.");
    expect(answerCurrentMediaQuestion("end-time", paused, {
      now: () => 11_000
    }).detail).toBe("Playback is paused, so there isn't an end time yet.");

    const unknown = { ...paused, playbackState: "unknown" as const };
    expect(answerCurrentMediaQuestion("position", unknown, {
      now: () => 11_000
    }).detail).toBe("You're 10 minutes into this.");
    expect(answerCurrentMediaQuestion("end-time", unknown, {
      now: () => 11_000
    }).detail).toBe(
      "I can't estimate an end time because the current playback state is unavailable."
    );

    const stale = { ...paused, playbackState: "playing" as const };
    expect(answerCurrentMediaQuestion("position", stale, {
      now: () => 40_001
    }).detail).toBe("You're 10 minutes into this.");
    expect(answerCurrentMediaQuestion("end-time", stale, {
      now: () => 40_001
    }).detail).toBe(
      "I can't estimate an end time because the latest playback timing is too old."
    );
  });

  it("never invents an end clock without a trustworthy playback speed", () => {
    const missingRate = videoSnapshot({ playbackRate: null });
    expect(answerCurrentMediaQuestion("time-remaining", missingRate, {
      now: () => 1_000
    }).detail).toBe(
      "About 45 minutes of content remains, but the current playback speed is unavailable."
    );
    expect(answerCurrentMediaQuestion("time-remaining", videoSnapshot({
      playbackRate: null,
      positionSeconds: 0
    }), {
      now: () => 1_000
    }).detail).toBe(
      "About 1 hour of content remains, but the current playback speed is unavailable."
    );
    expect(answerCurrentMediaQuestion("end-time", missingRate, {
      now: () => 1_000
    }).detail).toBe(
      "I can't estimate an end time because the current playback speed is unavailable."
    );
    expect(answerCurrentMediaQuestion("end-time", videoSnapshot({
      playbackRate: 8
    }), {
      now: () => 1_000
    }).detail).toBe(
      "I can't estimate an end time because the current playback speed is unavailable."
    );
    expect(answerCurrentMediaQuestion("end-time", videoSnapshot({
      playbackState: "ended"
    }), {
      now: () => 1_000
    }).detail).toBe("This is at the end.");
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
    expect(answerCurrentMediaQuestion("position", unknown).detail).toBe(
      "The current media is not reporting its playback position."
    );
    expect(answerCurrentMediaQuestion("duration", unknown).detail).toBe(
      "The current media does not report a total runtime."
    );
  });

  it("rejects non-finite or negative timing observations without inventing values", () => {
    expect(answerCurrentMediaQuestion("position", videoSnapshot({
      positionSeconds: Number.NaN
    })).detail).toBe("The current media is not reporting its playback position.");
    expect(answerCurrentMediaQuestion("position", videoSnapshot({
      durationSeconds: null,
      positionSeconds: 42
    })).detail).toBe("You're 42 seconds into this.");
    expect(answerCurrentMediaQuestion("duration", videoSnapshot({
      durationSeconds: Number.POSITIVE_INFINITY
    })).detail).toBe("The current media does not report a total runtime.");
    expect(answerCurrentMediaQuestion("duration", videoSnapshot({
      durationSeconds: -1
    })).detail).toBe("The current media does not report a total runtime.");
  });

  it("uses structured coordinates when an episode subtitle is unavailable", () => {
    expect(answerCurrentMediaQuestion("episode", videoSnapshot({
      subtitle: null
    })).detail).toBe(
      "You're watching Breaking Bad, season 1, episode 3 on Netflix."
    );
  });
});
