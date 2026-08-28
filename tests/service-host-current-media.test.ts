import { describe, expect, it } from "vitest";
import {
  currentMediaSnapshotForPresentation,
  type CurrentMediaSnapshot
} from "../src/main/service-host";

function snapshot(overrides: Partial<CurrentMediaSnapshot> = {}): CurrentMediaSnapshot {
  return {
    album: null,
    artist: null,
    backgrounded: false,
    durationSeconds: 2_400,
    fullscreen: false,
    mediaKind: "video",
    observedAt: 10_000,
    playbackState: "playing",
    positionSeconds: 620,
    serviceId: "netflix",
    serviceName: "Netflix",
    subtitle: "S1:E2 An Example",
    title: "Example Show",
    ...overrides
  };
}

describe("ServiceHost current-media presentation", () => {
  it("returns a copy with current display state and no provider URL surface", () => {
    const stored = snapshot();
    const presented = currentMediaSnapshotForPresentation(stored, {
      activeServiceId: "netflix",
      backgrounded: true,
      fullscreen: true,
      now: 10_100
    });

    expect(presented).toEqual({
      ...stored,
      backgrounded: true,
      fullscreen: true
    });
    expect(presented).not.toBe(stored);
    expect(Object.keys(presented ?? {})).not.toContain("url");
    expect(Object.keys(presented ?? {})).not.toContain("watchUrl");
  });

  it("hides media from an inactive provider and demotes stale transport state", () => {
    expect(currentMediaSnapshotForPresentation(snapshot(), {
      activeServiceId: "youtube",
      backgrounded: false,
      fullscreen: false,
      now: 10_100
    })).toBeNull();

    expect(currentMediaSnapshotForPresentation(snapshot(), {
      activeServiceId: "netflix",
      backgrounded: false,
      fullscreen: false,
      now: 40_001
    })?.playbackState).toBe("unknown");
    expect(currentMediaSnapshotForPresentation(snapshot({
      mediaKind: "audio",
      serviceId: "spotify",
      serviceName: "Spotify"
    }), {
      activeServiceId: "spotify",
      backgrounded: true,
      fullscreen: false,
      now: 15_001
    })?.playbackState).toBe("unknown");
  });
});
