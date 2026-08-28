import { describe, expect, it } from "vitest";
import {
  buildSpotifyMediaActionScript,
  buildSpotifyPlaybackSnapshotScript,
  qualifySpotifyPlaybackSnapshot
} from "../src/main/spotify-playback";

describe("Spotify playback bridge", () => {
  it("bounds renderer metadata and accepts only allowlisted artwork", () => {
    expect(qualifySpotifyPlaybackSnapshot({
      album: "  Good   Girl ",
      artist: " Cloonee, Prospa ",
      artworkUrl: "https://i.scdn.co/image/cover",
      durationSeconds: 181,
      playing: true,
      positionSeconds: 250,
      signedIn: true,
      title: " Good   Girl "
    }, ["i.scdn.co"])).toEqual({
      album: "Good Girl",
      artist: "Cloonee, Prospa",
      artworkUrl: "https://i.scdn.co/image/cover",
      durationSeconds: 181,
      playbackState: "playing",
      playing: true,
      positionSeconds: 181,
      signedIn: true,
      title: "Good Girl"
    });

    expect(qualifySpotifyPlaybackSnapshot({
      artworkUrl: "https://tracking.example/cover",
      playing: "true",
      positionSeconds: -1
    }, ["i.scdn.co"])?.artworkUrl).toBeNull();
    expect(qualifySpotifyPlaybackSnapshot(null, ["i.scdn.co"])).toBeNull();
  });

  it("normalizes paused, ended, and empty-player state", () => {
    expect(qualifySpotifyPlaybackSnapshot({
      artist: "Artist",
      durationSeconds: 180,
      playing: false,
      positionSeconds: 30,
      title: "Track"
    }, [])?.playbackState).toBe("paused");
    expect(qualifySpotifyPlaybackSnapshot({
      artist: "Artist",
      durationSeconds: 180,
      playing: false,
      positionSeconds: 180,
      title: "Track"
    }, [])?.playbackState).toBe("ended");
    expect(qualifySpotifyPlaybackSnapshot({
      durationSeconds: null,
      playing: false,
      positionSeconds: null
    }, [])?.playbackState).toBe("unknown");
  });

  it("reads semantic Now Playing fields without account or API access", () => {
    const script = buildSpotifyPlaybackSnapshotScript(["i.scdn.co"]);
    expect(script).toContain('navigator.mediaSession?.metadata');
    expect(script).toContain('[data-testid="context-item-info-title"]');
    expect(script).toContain('[data-testid="playback-position"]');
    expect(script).toContain('[data-testid="playback-duration"]');
    expect(script).toContain('document.querySelector(\'[data-testid="login-button"]\')');
    expect(script).toContain("artworkSize(right) - artworkSize(left)");
    expect(script).toContain('"i.scdn.co"');
  });

  it("clicks only Spotify's semantic transport buttons", () => {
    expect(buildSpotifyMediaActionScript("play-pause")).toContain(
      "control-button-playpause"
    );
    expect(buildSpotifyMediaActionScript("rewind")).toContain(
      "control-button-skip-back"
    );
    expect(buildSpotifyMediaActionScript("fast-forward")).toContain(
      "control-button-skip-forward"
    );
    expect(buildSpotifyMediaActionScript("volume-up")).toBeNull();
  });
});
