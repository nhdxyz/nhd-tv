import { describe, expect, it } from "vitest";
import {
  buildPlaybackActivationTrackerScript,
  buildLivePlaybackSnapshotScript,
  buildPlaybackSnapshotScript,
  qualifyLivePlaybackSnapshot,
  qualifyPlaybackSnapshot
} from "../src/main/playback-observer";

function snapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    artworkUrl: "https://assets.nflximg.net/poster.jpg",
    currentTime: 620,
    duration: 2_400,
    ended: false,
    hasError: false,
    playedSeconds: 8,
    readyState: 4,
    subtitle: "S1:E2 An Example",
    title: "Example Show S1:E2 An Example",
    url: "https://www.netflix.com/watch/123",
    visibleArea: 1280 * 720,
    ...overrides
  };
}

describe("passive playback observer", () => {
  it("qualifies visible long-form playback after real engagement", () => {
    expect(qualifyPlaybackSnapshot(snapshot())).toEqual({
      artworkUrl: "https://assets.nflximg.net/poster.jpg",
      currentTime: 620,
      duration: 2_400,
      ended: false,
      subtitle: "S1:E2 An Example",
      title: "Example Show",
      url: "https://www.netflix.com/watch/123"
    });
  });

  it("rejects cloud seeks, previews, hidden players, and errored media", () => {
    expect(qualifyPlaybackSnapshot(snapshot({ currentTime: 1_200, playedSeconds: 0 }))).toBeNull();
    expect(qualifyPlaybackSnapshot(snapshot({ duration: 45 }))).toBeNull();
    expect(qualifyPlaybackSnapshot(snapshot({ visibleArea: 0 }))).toBeNull();
    expect(qualifyPlaybackSnapshot(snapshot({ hasError: true }))).toBeNull();
  });

  it("describes new, short, and live video without relaxing persistence qualification", () => {
    const shortVideo = snapshot({
      currentTime: 12,
      duration: 45,
      paused: false,
      playbackRate: 1,
      playedSeconds: 0,
      readyState: 3
    });
    expect(qualifyPlaybackSnapshot(shortVideo)).toBeNull();
    expect(qualifyLivePlaybackSnapshot(shortVideo)).toEqual({
      currentTime: 12,
      duration: 45,
      playbackRate: 1,
      playbackState: "playing",
      subtitle: "S1:E2 An Example",
      title: "Example Show"
    });

    expect(qualifyLivePlaybackSnapshot({
      currentTime: 9_000,
      duration: Number.POSITIVE_INFINITY,
      ended: false,
      hasError: false,
      paused: false,
      playbackRate: 1.5,
      readyState: 4,
      subtitle: "Live",
      title: "News Live",
      visibleArea: 1280 * 720
    })).toEqual({
      currentTime: 9_000,
      duration: null,
      playbackRate: 1.5,
      playbackState: "playing",
      subtitle: "Live",
      title: "News"
    });
  });

  it("reports paused, ended, and not-yet-ready live playback states", () => {
    expect(qualifyLivePlaybackSnapshot(snapshot({ ended: true, paused: true }))?.playbackState)
      .toBe("ended");
    expect(qualifyLivePlaybackSnapshot(snapshot({ ended: false, paused: true }))?.playbackState)
      .toBe("paused");
    expect(qualifyLivePlaybackSnapshot(snapshot({
      ended: false,
      paused: false,
      readyState: 1
    }))?.playbackState).toBe("unknown");
  });

  it("strictly qualifies a bounded finite playback rate", () => {
    expect(qualifyLivePlaybackSnapshot(snapshot({ playbackRate: 1.25 }))?.playbackRate)
      .toBe(1.25);
    for (const playbackRate of [0, -1, 4.01, Number.NaN, Number.POSITIVE_INFINITY, "1.5"]) {
      expect(qualifyLivePlaybackSnapshot(snapshot({ playbackRate }))?.playbackRate).toBeNull();
    }
  });

  it("bounds provider metadata and never embeds it into the generated script", () => {
    const qualified = qualifyPlaybackSnapshot(snapshot({
      subtitle: " ",
      title: `  ${"x".repeat(220)}  `
    }));
    expect(qualified?.title).toHaveLength(180);
    expect(qualified?.subtitle).toBeNull();

    const script = buildPlaybackSnapshotScript({
      pathPrefixes: ["/watch/"],
      queryParameters: [],
      subtitleSelectors: [".episode"],
      titleSelectors: ["h1"]
    }, "Netflix", ["nflximg.net"]);
    expect(script).toContain("video.played.end(index)");
    expect(script).toContain('readText(["h1"])');
    expect(script).toContain("recentActivation?.artworkUrl");
    expect(script).toContain('title.replace(/\\s+/g, " ")');
    expect(script).toContain("normalizedActivationTitle === normalizedTitle");
    expect(script).toContain("normalizedOpenGraphTitle === normalizedTitle");
    expect(script).toContain('url.hostname.endsWith("." + host)');
    expect(script).toContain('["nflximg.net"].some');
    expect(script).toContain('=== "netflix"');
    expect(script).not.toContain("Example Show");

    const liveScript = buildLivePlaybackSnapshotScript({
      pathPrefixes: ["/watch/"],
      queryParameters: [],
      subtitleSelectors: [".episode"],
      titleSelectors: ["h1"]
    }, "Netflix");
    expect(liveScript).toContain('document.querySelectorAll("video")');
    expect(liveScript).toContain("Number.isFinite(video.duration) ? video.duration : null");
    expect(liveScript).toContain("paused: video.paused");
    expect(liveScript).toContain("Number.isFinite(video.playbackRate) ? video.playbackRate : null");
    expect(liveScript).not.toContain("location.href");
    expect(liveScript).not.toContain("playedSeconds");
  });

  it("tracks the most recently activated visible tile without sending page data", () => {
    const script = buildPlaybackActivationTrackerScript(["/watch/"]);

    expect(script).toContain('document.addEventListener("focusin"');
    expect(script).toContain('document.addEventListener("pointerdown"');
    expect(script).toContain('document.addEventListener("click"');
    expect(script).toContain('document.addEventListener("keydown"');
    expect(script).toContain("sessionStorage.setItem(storageKey");
    expect(script).toContain("rememberVisibleDetail");
    expect(script).toContain("image.naturalWidth * image.naturalHeight");
    expect(script).toContain("previousTitle !== nextTitle");
    expect(script).toContain("candidate.artworkPixelArea >= state.artworkPixelArea");
    expect(script).toContain("if (uniqueUrls.size > 1) return null");
    expect(script).toContain('if (!title) return');
    expect(script).toContain('[class*="tracked-card"]');
    expect(script).toContain('element.querySelectorAll("picture source")');
    expect(script).toContain("candidate.area >= 80 * 45");
    expect(script).toContain('["/watch/"].some((prefix) => location.pathname.startsWith(prefix))');
    expect(script).not.toContain("ipcRenderer");
    expect(script).not.toContain("fetch(");
  });
});
