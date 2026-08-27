import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const extensionRoot = path.resolve("extensions/youtube-tv");

describe("YouTube TV Mode extension", () => {
  it("uses Manifest V3 with only the storage permission and local executable code", async () => {
    const manifest = JSON.parse(await readFile(path.join(extensionRoot, "manifest.json"), "utf8")) as {
      action?: { default_popup?: string };
      content_scripts?: Array<{ js?: string[]; matches?: string[]; run_at?: string }>;
      host_permissions?: string[];
      manifest_version?: number;
      permissions?: string[];
    };

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.action?.default_popup).toBe("popup/popup.html");
    expect(manifest.content_scripts).toEqual([
      expect.objectContaining({
        js: ["src/selectors.js", "src/navigation.js", "src/content.js"],
        matches: ["https://www.youtube.com/*"],
        run_at: "document_start"
      })
    ]);
  });

  it("keeps selectors centralized and scopes every presentation rule to TV Mode", async () => {
    const selectors = await readFile(path.join(extensionRoot, "src/selectors.js"), "utf8");
    const styles = await readFile(path.join(extensionRoot, "styles/tv.css"), "utf8");

    expect(selectors).toContain("ytd-rich-item-renderer");
    expect(selectors).toContain("yt-lockup-view-model");
    expect(selectors).toContain("[aria-modal='true']");
    expect(selectors).toContain("a[href^='/watch']");
    expect(selectors).toContain("#nhdtv-tv-rail");
    expect(selectors).toContain("ytd-feed-filter-chip-bar-renderer");
    expect(selectors).toContain("categoryScrollers");
    expect(styles.match(/html\.nhdtv-tv-mode/g)?.length).toBeGreaterThan(40);
    expect(styles).not.toMatch(/(^|\})\s*(ytd-|yt-|#movie_player|body\s*\{)/m);
  });

  it("removes page listeners, observers, styles, focus state, and injected attributes when disabled", async () => {
    const content = await readFile(path.join(extensionRoot, "src/content.js"), "utf8");
    const navigation = await readFile(path.join(extensionRoot, "src/navigation.js"), "utf8");

    expect(content).toContain("this.#observer?.disconnect()");
    expect(content).toContain("this.navigator.stop()");
    expect(content).toContain("this.#style?.remove()");
    expect(content).toContain("this.#rail?.remove()");
    expect(content).toContain("PAGE_HEADING_ID");
    expect(content).toContain('title: "Recommended for you"');
    expect(content).toContain("Results for");
    expect(content).toContain('route === "results" ? "ytd-search" : "ytd-browse"');
    expect(content).toContain('pageSurface.querySelector(":scope > #container > #primary")');
    expect(content).toContain('data-nhdtv-category');
    expect(content).toContain("root.classList.remove(ROOT_CLASS)");
    expect(content).toContain("document.removeEventListener(\"yt-navigate-finish\"");
    expect(content).toContain("document.removeEventListener(\"fullscreenchange\"");
    expect(navigation).toContain("document.removeEventListener(\"keydown\"");
    expect(navigation).toContain("cancelAnimationFrame(this.#gamepadFrame)");
    expect(navigation).toContain("clearRestoreState()");
  });

  it("installs a deterministic TV rail without relying on YouTube's hamburger guide", async () => {
    const content = await readFile(path.join(extensionRoot, "src/content.js"), "utf8");
    const styles = await readFile(path.join(extensionRoot, "styles/tv.css"), "utf8");

    expect(content).toContain('rail.id = RAIL_ID');
    expect(content).toContain('label: "Subscriptions"');
    expect(content).toContain('label: "You"');
    expect(content).toContain("this.ensureRail()");
    expect(styles).toContain("#nhdtv-tv-rail");
    expect(styles).toContain("ytd-masthead #guide-button");
    expect(styles).toContain("ytd-app #guide");
    expect(styles).not.toContain("ytd-app[mini-guide-visible]");
    expect(styles).toContain("overflow: clip");
    expect(styles).toContain("--ytd-toolbar-height");
  });

  it("removes the TV rail and its reserved width for player fullscreen", async () => {
    const content = await readFile(path.join(extensionRoot, "src/content.js"), "utf8");
    const styles = await readFile(path.join(extensionRoot, "styles/tv.css"), "utf8");

    expect(content).toContain('"data-nhdtv-fullscreen"');
    expect(content).toContain('document.addEventListener("fullscreenchange"');
    expect(content).toContain("document.fullscreenElement !== null");
    expect(styles).toContain('data-nhdtv-fullscreen="true"] #nhdtv-tv-rail');
    expect(styles).toContain('data-nhdtv-fullscreen="true"] #page-manager');
    expect(styles).toContain("#movie_player.ytp-fullscreen");
    expect(styles).toContain("width: 100vw !important;");
  });

  it("keeps a useful first row of YouTube's own recommendations visible", async () => {
    const styles = await readFile(path.join(extensionRoot, "styles/tv.css"), "utf8");

    expect(styles).toContain("--ytd-rich-grid-items-per-row: 4 !important;");
    expect(styles).toContain("--ytd-rich-grid-items-per-row: 5 !important;");
    expect(styles).toContain("padding-bottom: 8vh !important;");
    expect(styles).toContain("margin-block: clamp(18px, 3vh, 36px) !important;");
  });

  it("uses row-locked horizontal scoring and column-aware vertical scoring", async () => {
    const source = await readFile(path.join(extensionRoot, "src/navigation.js"), "utf8");
    const context = vm.createContext({
      NHDYouTubeTV: { dom: {}, selectors: {} }
    });
    vm.runInContext(source, context);
    const geometry = (context.NHDYouTubeTV as {
      geometry: {
        horizontalScore: (direction: string, current: DOMRect, candidate: DOMRect) => number;
        verticalScore: (direction: string, current: DOMRect, candidate: DOMRect, desiredX: number) => number;
      };
    }).geometry;
    const rect = (left: number, top: number, width = 300, height = 180) => ({
      bottom: top + height,
      height,
      left,
      right: left + width,
      top,
      width
    }) as DOMRect;

    expect(geometry.horizontalScore("right", rect(100, 100), rect(430, 108))).toBeLessThan(
      Number.POSITIVE_INFINITY
    );
    expect(geometry.horizontalScore("right", rect(100, 100), rect(430, 360))).toBe(
      Number.POSITIVE_INFINITY
    );
    expect(geometry.verticalScore("down", rect(100, 100), rect(110, 340), 250)).toBeLessThan(
      geometry.verticalScore("down", rect(100, 100), rect(760, 340), 250)
    );
  });

  it("treats category chips as a first-class remote row", async () => {
    const navigation = await readFile(path.join(extensionRoot, "src/navigation.js"), "utf8");
    const styles = await readFile(path.join(extensionRoot, "styles/tv.css"), "utf8");

    expect(navigation).toContain('direction === "up" && visibleCategories.length > 0');
    expect(navigation).toContain("categoryScroller.scrollWidth");
    expect(navigation).toContain('block: "nearest"');
    expect(styles).toContain('[data-nhdtv-category="true"][data-nhdtv-focused="true"]');
  });

  it("maps one dominant gamepad direction plus A/B without diagonal double movement", async () => {
    const source = await readFile(path.join(extensionRoot, "src/navigation.js"), "utf8");
    const context = vm.createContext({ NHDYouTubeTV: { dom: {}, selectors: {} } });
    vm.runInContext(source, context);
    const { gamepadActionsFor } = (context.NHDYouTubeTV as {
      input: { gamepadActionsFor: (gamepad: { axes: number[]; buttons: Array<{ pressed: boolean; value: number }> }) => string[] };
    }).input;
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    buttons[0] = { pressed: true, value: 1 };
    buttons[1] = { pressed: true, value: 1 };

    expect(gamepadActionsFor({ axes: [0.9, 0.7], buttons })).toEqual(["right", "select", "back"]);
    buttons[14] = { pressed: true, value: 1 };
    expect(gamepadActionsFor({ axes: [0.9, -0.95], buttons })).toEqual(["left", "select", "back"]);
  });

  it("uses player-first watch input and gives a hosted NHD shell sole controller ownership", async () => {
    const navigation = await readFile(path.join(extensionRoot, "src/navigation.js"), "utf8");
    const content = await readFile(path.join(extensionRoot, "src/content.js"), "utf8");

    expect(navigation).toContain("dom.isPlaybackRoute() && dom.visibleDialog() === null");
    expect(navigation).toContain('this.handleAction(action, "gamepad")');
    expect(navigation).toContain('this.handleAction(action, "host")');
    expect(navigation).toContain('this.#inputOwner !== "browser"');
    expect(navigation).toContain('window.addEventListener("gamepadconnected"');
    expect(content).toContain('this.navigator.setInputOwner("host")');
    expect(content).toContain("nhdtv-tv-mode-config");
  });

  it("persists focus per route and exposes scale, safe-area, and selector diagnostics", async () => {
    const navigation = await readFile(path.join(extensionRoot, "src/navigation.js"), "utf8");
    const content = await readFile(path.join(extensionRoot, "src/content.js"), "utf8");
    const styles = await readFile(path.join(extensionRoot, "styles/tv.css"), "utf8");

    expect(navigation).toContain("MAX_RESTORE_ROUTES");
    expect(navigation).toContain("candidateIndex");
    expect(navigation).toContain("shelfIndex");
    expect(navigation).toContain("element.closest(selectors.guideRoots) !== null");
    expect(navigation).toContain("candidates.includes(this.#lastContentTarget)");
    expect(navigation).toContain("guide.scrollLeft = 0");
    expect(navigation).toContain("dom.isEditable(document.activeElement)");
    expect(content).toContain('message?.type !== "nhdtv:get-diagnostics"');
    expect(content).toContain('data-nhdtv-safe-area');
    expect(content).toContain('data-nhdtv-scale');
    expect(styles).toContain('data-nhdtv-safe-area="wide"');
    expect(styles).toContain('data-nhdtv-scale="large"');
    expect(styles).toContain('data-nhdtv-editing="true"]::before');
    expect(styles).toContain("scroll-snap-type: x proximity");
  });
});
