import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  currentMediaSnapshotForPresentation,
  type CurrentMediaSnapshot
} from "../src/main/service-host";

const serviceHostSource = readFileSync(
  new URL("../src/main/service-host.ts", import.meta.url),
  "utf8"
);

function snapshot(overrides: Partial<CurrentMediaSnapshot> = {}): CurrentMediaSnapshot {
  return {
    album: null,
    artist: null,
    backgrounded: false,
    durationSeconds: 2_400,
    fullscreen: false,
    mediaKind: "video",
    observedAt: 10_000,
    playbackRate: 1.5,
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

    const staleVideo = currentMediaSnapshotForPresentation(snapshot(), {
      activeServiceId: "netflix",
      backgrounded: false,
      fullscreen: false,
      now: 40_001
    });
    expect(staleVideo?.playbackState).toBe("unknown");
    expect(staleVideo?.playbackRate).toBeNull();
    expect(currentMediaSnapshotForPresentation(snapshot({
      mediaKind: "audio",
      playbackRate: null,
      serviceId: "spotify",
      serviceName: "Spotify"
    }), {
      activeServiceId: "spotify",
      backgrounded: true,
      fullscreen: false,
      now: 15_001
    })?.playbackState).toBe("unknown");
  });

  it("does not present an out-of-range playback rate", () => {
    expect(currentMediaSnapshotForPresentation(snapshot({ playbackRate: 8 }), {
      activeServiceId: "netflix",
      backgrounded: false,
      fullscreen: false,
      now: 10_100
    })?.playbackRate).toBeNull();
  });

  it("does not assume a Spotify playback rate", () => {
    const spotifyCapture = serviceHostSource.slice(
      serviceHostSource.indexOf("#captureSpotifyPlayback("),
      serviceHostSource.indexOf("async #sendSpotifyMediaAction(")
    );
    expect(spotifyCapture).toContain('mediaKind: "audio"');
    expect(spotifyCapture).toContain("playbackRate: null");
  });
});
