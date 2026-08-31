import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../src/renderer/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/renderer/style.css", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../src/renderer/index.ts", import.meta.url), "utf8");

describe("TV catalog layout", () => {
  it("keeps phone pairing visible and the home controls purpose-built", () => {
    expect(html).toContain('class="remote-invite" id="remote-invite"');
    expect(html).toContain('id="remote-invite-qr"');
    expect(html).not.toContain("Edit lineup");
    expect(html).toContain('id="top-search-button"');
    expect(html).not.toContain("<span>Search</span>");
  });

  it("provides host-owned offline and service recovery surfaces", () => {
    expect(html).toContain('id="network-banner"');
    expect(html).toContain('id="recovery-dialog"');
    expect(html).toContain('id="recovery-retry"');
    expect(html).toContain('id="recovery-reload"');
    expect(html).toContain('id="recovery-home"');
    expect(css).toContain(".recovery-dialog-shell");
    expect(css).toContain(".network-banner");
  });

  it("uses artwork-first Continue Watching cards with readable titles", () => {
    expect(css).toContain("aspect-ratio: 16 / 9");
    expect(css).toContain("grid-area: 1 / 1");
    expect(css).toContain("-webkit-line-clamp: 3");
  });

  it("keeps Home content-first instead of decorating it like an AI dashboard", () => {
    expect(html).not.toContain("featured-wash");
    expect(html).not.toContain("featured-orbit");
    expect(html).toContain("Choose something to watch");
    expect(html).toContain('id="continue-manage"');
    expect(html).toContain('<h2 id="services-title">Apps</h2>');
    expect(css).toContain(".featured-icon.has-artwork");
    expect(css).toContain(".home-view .service-tile[data-service-id]");
  });

  it("makes Apps the consumer destination and keeps Add apps out of primary navigation", () => {
    const primaryNavigation = html.slice(
      html.indexOf('<nav class="primary-nav"'),
      html.indexOf("</nav>", html.indexOf('<nav class="primary-nav"'))
    );

    expect(primaryNavigation).toContain('data-view-target="home"');
    expect(primaryNavigation).toContain('data-view-target="apps"');
    expect(primaryNavigation).not.toContain('data-view-target="store"');
    expect(primaryNavigation).not.toContain(">Store<");
    expect(html).toContain('<h1>Your apps</h1>');
    expect(html).toContain('<h2 id="apps-title">Installed</h2>');
    expect(html).toContain('id="apps-add-button" data-view-target="store"');
    expect(html).toContain('<h1>Add apps</h1>');
    expect(renderer).toContain(
      '(view === "store" && navButton.dataset.viewTarget === "apps")'
    );
    expect(renderer).toContain("function returnToApps(remote = false)");
    expect(renderer).toContain("focusAddAppsCandidate()");
  });

  it("keeps custom services and diagnostics available as secondary advanced tools", () => {
    expect(html).toContain('class="advanced-tools" id="store-advanced-tools"');
    expect(html).toContain("Custom services & diagnostics");
    expect(html).toContain('id="utility-store-actions"');
    expect(html).toContain('id="custom-service-form"');
    expect(css).toContain(".advanced-tools > summary");
    expect(css).toContain(".catalog-view .catalog-card[data-service-id]");
    expect(css).toContain("background: #141518");
  });

  it("keeps destructive Continue Watching controls behind Manage mode", () => {
    expect(renderer).toContain("remove.hidden = !continueManaging");
    expect(renderer).toContain("continueManaging = !continueManaging");
    expect(renderer).toContain("item.id !== featuredContinueItemId");
  });

  it("wraps experimental apps into a spatial grid instead of a clipped rail", () => {
    expect(html).toContain('class="catalog-grid" id="experimental-store-actions"');
    expect(html).not.toContain(
      'class="catalog-row horizontal-row" id="experimental-store-actions"'
    );
    expect(css).toContain("grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr))");
    expect(css).toContain(".catalog-grid .catalog-card-shell");
  });

  it("provides a complete Spotify visual treatment", () => {
    const branding = readFileSync(
      new URL("../src/renderer/service-branding.ts", import.meta.url),
      "utf8"
    );

    expect(branding).toContain("siSpotify");
    expect(branding).toContain("spotify: {");
    expect(css).toContain('.featured[data-service-id="spotify"]');
    expect(css).toContain('.catalog-card[data-service-id="spotify"]');
    expect(css).toContain('.service-logo[data-brand="spotify"]');
    expect(css).toContain('.search-result-card[data-service-id="spotify"]');
    expect(html).toContain('class="spotify-home-player"');
    expect(css).toContain(".spotify-home-copy");
    expect(css).toContain(".spotify-home-transport");
  });

  it("loads Spotify's dedicated TV Mode extension", () => {
    const host = readFileSync(
      new URL("../src/main/service-host.ts", import.meta.url),
      "utf8"
    );

    expect(host).toContain("ensureSpotifyTvExtension");
    expect(host).toContain('"extensions", "spotify-tv"');
    expect(host).toContain('extension.name === "NHD Spotify TV Mode"');
  });

  it("keeps the frozen service preview available behind the quit dialog", () => {
    expect(html).toContain('id="quit-service-preview"');
    expect(css).toContain(".quit-service-preview");
    expect(css).toContain(".quit-dialog::backdrop");
  });

  it("exposes couch-accessible YouTube TV and controller diagnostics settings", () => {
    expect(html).toContain('id="youtube-tv-toggle"');
    expect(html).toContain('id="youtube-tv-scale"');
    expect(html).toContain('id="gamepad-dialog"');
    expect(html).toContain('id="gamepad-last-action"');
    expect(css).toContain(".controller-readout");
  });

  it("provides couch-accessible voice control and private key settings", () => {
    expect(html).toContain('id="voice-settings-button"');
    expect(html).toContain('id="voice-control-toggle"');
    expect(html).toContain('id="voice-playback-mode"');
    expect(html).toContain('id="voice-region-button"');
    expect(html).toContain('id="voice-dialog"');
    expect(html).toContain('id="voice-key-input"');
    expect(html).toContain('type="password"');
    expect(css).toContain(".voice-dialog-shell");
    expect(css).toContain(".voice-settings-form");
  });

  it("offers multiple ambient clock styles with a burn-in-conscious full-screen surface", () => {
    expect(html).toContain('id="ambient-display-toggle"');
    expect(html).toContain('id="ambient-clock-style"');
    expect(html).toContain('id="ambient-display-delay"');
    expect(html).toContain('id="ambient-display-preview"');
    expect(html).toContain('class="ambient-clock ambient-clock-digital"');
    expect(html).toContain('class="ambient-clock ambient-clock-analog"');
    expect(html).toContain('class="ambient-clock ambient-clock-minimal"');
    expect(html).toContain('class="ambient-clock ambient-clock-flip"');
    expect(html).toContain('class="ambient-clock ambient-clock-neon"');
    expect(html).toContain('class="ambient-clock ambient-clock-orbit"');
    expect(css).toContain('.ambient-stage[data-anchor="bottom-right"]');
    expect(css).toContain('.ambient-stage[data-clock-style="analog"]');
    expect(css).toContain('.ambient-stage[data-clock-style="flip"]');
    expect(css).toContain('.ambient-stage[data-clock-style="neon"]');
    expect(css).toContain('.ambient-stage[data-clock-style="orbit"]');
  });
});
