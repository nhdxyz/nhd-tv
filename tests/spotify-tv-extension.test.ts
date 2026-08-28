import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const extensionRoot = path.resolve("extensions/spotify-tv");

describe("Spotify TV Mode extension", () => {
  it("uses local Manifest V3 content scripts without account or network permissions", async () => {
    const manifest = JSON.parse(await readFile(path.join(extensionRoot, "manifest.json"), "utf8")) as {
      content_scripts?: Array<{ css?: string[]; js?: string[]; matches?: string[]; run_at?: string }>;
      host_permissions?: string[];
      manifest_version?: number;
      permissions?: string[];
    };

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual([]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toEqual([
      {
        css: ["styles/tv.css"],
        js: ["src/navigation.js", "src/content.js"],
        matches: ["https://open.spotify.com/*"],
        run_at: "document_start"
      },
      {
        css: ["styles/auth.css"],
        js: ["src/navigation.js", "src/auth.js"],
        matches: ["https://accounts.spotify.com/*"],
        run_at: "document_start"
      }
    ]);
  });

  it("builds the TV navigation model from provider-owned routes", async () => {
    const content = await readFile(path.join(extensionRoot, "src/content.js"), "utf8");

    expect(content).toContain('NAV_ID = "nhdtv-spotify-tv-nav"');
    expect(content).toContain('link("Home", "/"');
    expect(content).toContain('link("Search", "/search"');
    expect(content).toContain('link("Your Library", "/collection/playlists"');
    expect(content).toContain('SEARCH_ID = "nhdtv-spotify-tv-search"');
    expect(content).toContain("`/search/${encodeURIComponent(query)}`");
    expect(content).toContain('data-nhdtv-spotify-route');
    expect(content).toContain('data-nhdtv-spotify-auth');
  });

  it("turns signed-out Play into one in-view login instead of a native-app popup", async () => {
    const content = await readFile(path.join(extensionRoot, "src/content.js"), "utf8");
    const css = await readFile(path.join(extensionRoot, "styles/tv.css"), "utf8");
    const authCss = await readFile(path.join(extensionRoot, "styles/auth.css"), "utf8");
    const auth = await readFile(path.join(extensionRoot, "src/auth.js"), "utf8");

    expect(content).toContain('new URL("https://accounts.spotify.com/en/login")');
    expect(content).toContain('SIGNIN_ID = "nhdtv-spotify-tv-signin"');
    expect(content).toContain('button.textContent = "Sign in to Spotify"');
    expect(content).toContain('data-nhdtv-spotify-default');
    expect(content).toContain('[data-testid="play-button"],button[aria-label^="Play "]');
    expect(content).toContain("event.stopImmediatePropagation()");
    expect(content).toContain("location.assign(authenticationUrl())");
    expect(css).toContain('[data-nhdtv-spotify-auth="signed-out"] #main-view');
    expect(css).toContain(".nhdtv-spotify-signin-button");
    expect(css).toContain('[data-testid="download-button"]');
    expect(css).toContain('a[href^="spotify:"]');
    expect(authCss).toContain("--nhdtv-spotify-auth-green: #1ed760");
    expect(authCss).toContain('button[type="submit"]');
    expect(authCss).toContain('[data-nhdtv-spotify-focused="true"]');
    expect(auth).toContain('root.setAttribute("data-nhdtv-extension-active", "true")');
    expect(auth).toContain('input:not([type="hidden"])');
    expect(auth).toContain('element.autocomplete === "username"');
  });

  it("uses one scoped ten-foot layout for home, details, tracks, and the player", async () => {
    const css = await readFile(path.join(extensionRoot, "styles/tv.css"), "utf8");

    expect(css.match(/html\.nhdtv-spotify-tv/g)?.length).toBeGreaterThan(55);
    expect(css).toContain('grid-template-areas:');
    expect(css).toContain('nav[aria-label="Main"]');
    expect(css).toContain('[data-testid="component-shelf"]');
    expect(css).toContain('[data-testid="playlist-page"] [data-testid="entityTitle"]');
    expect(css).toContain('[data-testid="tracklist-row"]');
    expect(css).toContain('[data-testid="now-playing-bar"]');
    expect(css).toContain('[data-nhdtv-spotify-focused="true"]');
    expect(css).toContain("@media (max-width: 1180px)");
  });

  it("lets NHD-TV own deterministic remote focus", async () => {
    const navigation = await readFile(path.join(extensionRoot, "src/navigation.js"), "utf8");
    const content = await readFile(path.join(extensionRoot, "src/content.js"), "utf8");

    expect(content).toContain('root.setAttribute("data-nhdtv-extension-active", "true")');
    expect(content).toContain('root.setAttribute("data-nhdtv-input-owner", "host")');
    expect(navigation).toContain('document.addEventListener("nhdtv-remote-action"');
    expect(navigation).toContain("horizontalScore");
    expect(navigation).toContain("verticalScore");
    expect(navigation).toContain("frame.scrollIntoView");
    expect(navigation).toContain('element.getAttribute("data-nhdtv-spotify-default")');
    expect(navigation).toContain("event.preventDefault()");
    expect(navigation).not.toContain("gamepadconnected");
  });

  it("marks Spotify's rendered card element instead of its zero-sized grid wrapper", async () => {
    const content = await readFile(path.join(extensionRoot, "src/content.js"), "utf8");

    expect(content).toContain('document.querySelectorAll(\'[data-encore-id="card"]\')');
    expect(content).not.toContain('document.querySelectorAll(\'[role="gridcell"]\')');
  });

  it("keeps annotation updates stable so provider DOM changes do not cause an observer loop", async () => {
    const content = await readFile(path.join(extensionRoot, "src/content.js"), "utf8");

    expect(content).toContain("const syncAttribute = (attribute, desiredElements)");
    expect(content).toContain('element.getAttribute(attribute) !== "true"');
    expect(content).toContain('root.getAttribute("data-nhdtv-spotify-auth") !== auth');
    expect(content).not.toContain('element.removeAttribute(CARD_ATTRIBUTE);');
  });
});
