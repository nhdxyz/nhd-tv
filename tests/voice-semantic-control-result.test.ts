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
    }, "acted", "YouTube")).toEqual({
      detail: "Skipped forward 30 seconds.",
      handled: true
    });
    expect(voiceSemanticControlOutcome({
      action: "seek-relative",
      offsetSeconds: -120
    }, "acted", "Netflix").detail).toBe("Went back 2 minutes.");
    expect(voiceSemanticControlOutcome({
      action: "seek-absolute",
      positionSeconds: 3_600
    }, "complete", "Netflix").detail).toBe("Playback is already at 1 hour.");
  });

  it("distinguishes verified idempotence from a newly applied state", () => {
    expect(voiceSemanticControlOutcome({ action: "captions-on" }, "complete", "YouTube"))
      .toMatchObject({ detail: "Captions are already on.", handled: true });
    expect(voiceSemanticControlOutcome({ action: "fullscreen-enter" }, "acted", "Netflix"))
      .toMatchObject({ detail: "Entered full screen.", handled: true });
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
  });
});
