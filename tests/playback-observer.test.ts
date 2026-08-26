import { describe, expect, it } from "vitest";
import {
  buildPlaybackActivationTrackerScript,
  buildPlaybackSnapshotScript,
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
    expect(script).toContain('url.hostname.endsWith("." + host)');
    expect(script).toContain('["nflximg.net"].some');
    expect(script).toContain('=== "netflix"');
    expect(script).not.toContain("Example Show");
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
    expect(script).toContain("candidate.artworkPixelArea >= state.artworkPixelArea");
    expect(script).toContain('[class*="tracked-card"]');
    expect(script).toContain('element.querySelectorAll("picture source")');
    expect(script).toContain("candidate.area >= 80 * 45");
    expect(script).toContain('["/watch/"].some((prefix) => location.pathname.startsWith(prefix))');
    expect(script).not.toContain("ipcRenderer");
    expect(script).not.toContain("fetch(");
  });
});
