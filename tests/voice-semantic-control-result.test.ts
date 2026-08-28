import { describe, expect, it } from "vitest";
import {
  verifiedActionForSemanticControl,
  voiceSemanticControlOutcome
} from "../src/main/voice/voice-semantic-control-result";

describe("semantic voice control outcomes", () => {
  it("describes applied seeks with natural bounded durations", () => {
    expect(voiceSemanticControlOutcome({
      action: "seek-relative",
      offsetSeconds: 30
    }, "verified", "YouTube")).toEqual({
      detail: "Skipped forward 30 seconds.",
      handled: true
    });
    expect(voiceSemanticControlOutcome({
      action: "seek-relative",
      offsetSeconds: -120
    }, "verified", "Netflix").detail).toBe("Went back 2 minutes.");
    expect(voiceSemanticControlOutcome({
      action: "seek-absolute",
      positionSeconds: 3_600
    }, "complete", "Netflix").detail).toBe("Playback is already at 1 hour.");
  });

  it("distinguishes verified idempotence from a newly applied state", () => {
    expect(voiceSemanticControlOutcome({ action: "captions-on" }, "complete", "YouTube"))
      .toMatchObject({ detail: "Captions are already on.", handled: true });
    expect(voiceSemanticControlOutcome({ action: "fullscreen-enter" }, "verified", "Netflix"))
      .toMatchObject({ detail: "Entered full screen.", handled: true });
    expect(voiceSemanticControlOutcome({
      action: "set-playback-rate",
      playbackRate: 1.5
    }, "verified", "YouTube")).toMatchObject({
      detail: "Set playback speed to 1.5\u00d7.",
      handled: true
    });
    expect(voiceSemanticControlOutcome({
      action: "set-playback-rate",
      playbackRate: 1
    }, "verified", "Netflix")).toMatchObject({
      detail: "Restored normal playback speed.",
      handled: true
    });
    expect(voiceSemanticControlOutcome({
      action: "set-playback-rate",
      playbackRate: 1
    }, "complete", "Netflix")).toMatchObject({
      detail: "Playback is already at normal speed.",
      handled: true
    });
  });

  it("does not claim an unverified provider click completed", () => {
    expect(voiceSemanticControlOutcome({ action: "skip-intro" }, "acted", "Netflix"))
      .toEqual({
        detail: "Sent a request to skip the intro in Netflix.",
        handled: true
      });
  });

  it("reports unsupported and unavailable controls honestly", () => {
    expect(voiceSemanticControlOutcome({ action: "skip-intro" }, "unsupported", "YouTube"))
      .toEqual({
        detail: "YouTube does not support the command to skip the intro.",
        handled: false
      });
    expect(voiceSemanticControlOutcome({ action: "skip-ad" }, "unavailable", "YouTube"))
      .toMatchObject({
        detail: "I couldn't find a safe way to skip the ad in YouTube right now.",
        handled: false
      });
  });

  it("maps every request to the context store's verified action vocabulary", () => {
    expect(verifiedActionForSemanticControl({
      action: "seek-relative",
      offsetSeconds: 10
    })).toBe("seek");
    expect(verifiedActionForSemanticControl({ action: "skip-recap" })).toBe("skip-recap");
    expect(verifiedActionForSemanticControl({ action: "fullscreen-exit" }))
      .toBe("fullscreen-exit");
    expect(verifiedActionForSemanticControl({
      action: "set-playback-rate",
      playbackRate: 1.25
    })).toBe("playback-rate");
  });
});
