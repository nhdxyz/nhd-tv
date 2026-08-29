import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const contracts = readFileSync(new URL("../src/main/contracts.ts", import.meta.url), "utf8");
const host = readFileSync(new URL("../src/main/service-host.ts", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main/index.ts", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../src/renderer/index.ts", import.meta.url), "utf8");
const html = readFileSync(new URL("../src/renderer/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/renderer/style.css", import.meta.url), "utf8");

describe("Spotify playback on NHD-TV Home", () => {
  it("keeps only Spotify alive when the normal Home action is used", () => {
    expect(host).toContain("returnHomeInBackground(): boolean");
    expect(host).toContain('definition?.id !== "spotify"');
    expect(host).toContain('backgroundThrottling: definition.id !== "spotify"');
    expect(host).toContain("this.#window.contentView.removeChildView(view)");
    expect(host).toContain("restoreFromHome(): boolean");
    expect(main).toContain("if (!serviceHost.returnHomeInBackground())");
    expect(main).toContain("await serviceHost.closeWithCheckpoint(signal, operation)");
    expect(main).toContain("await serviceHost.forceReturnHome(signal, operation)");
  });

  it("treats Back at Spotify's root as a background return instead of a quit", () => {
    expect(host).toContain('definition.id === "spotify" && this.returnHomeInBackground()');
    expect(host.indexOf('definition.id === "spotify" && this.returnHomeInBackground()'))
      .toBeLessThan(host.indexOf("await this.#requestQuit(operation)"));
  });

  it("routes hidden Spotify media controls to the player and navigation to Home", () => {
    expect(main).toContain("if (serviceHost.isBackgrounded)");
    expect(main).toContain(
      "const handled = await serviceHost.sendRemoteAction(action, signal, operation)"
    );
    expect(main).toContain("mainWindow.webContents.send(IPC_CHANNELS.remoteAction, action)");
    expect(host).toContain("if (this.#backgrounded && !isMediaAction(action))");
    expect(host).toContain("if (!this.#backgrounded)");
    expect(main).toContain('serviceHost?.isBackgrounded === true ||');
    expect(main).toContain('? "Search NHD-TV"');
  });

  it("executes semantic Spotify controls in the retained background view", () => {
    const start = host.indexOf("async executeVoiceSemanticControl(");
    const end = host.indexOf("\n  async ", start + 1);
    const execution = host.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(execution).toContain("view.webContents.executeJavaScript(script, true)");
    expect(execution).not.toContain("this.#backgrounded");
    expect(execution).not.toContain("restoreFromHome");
    expect(execution).not.toContain("navigate(");
  });

  it("publishes renderer-safe playback state for the home controls", () => {
    expect(contracts).toContain("playback: {");
    expect(contracts).toContain("backgrounded: boolean");
    expect(contracts).toContain("interface SpotifyPlaybackPresentation");
    expect(contracts).toContain('getSpotifyPlayback: "nhd:spotify:playback:get"');
    expect(contracts).toContain('spotifyPlaybackChanged: "nhd:spotify:playback:changed"');
    expect(main).toContain("backgrounded: serviceHost?.isBackgrounded ?? false");
    expect(main).toContain("active: serviceHost?.isPlaybackActive ?? false");
  });

  it("renders remote-sized previous, play-pause, next, and return controls", () => {
    expect(html).toContain('id="spotify-home-player"');
    expect(html).toContain('id="spotify-home-previous"');
    expect(html).toContain('id="spotify-home-play"');
    expect(html).toContain('id="spotify-home-next"');
    expect(html).toContain('id="spotify-home-open"');
    expect(html).toContain('id="spotify-home-fullscreen"');
    expect(html).toContain('id="spotify-now-playing"');
    expect(html).toContain('id="spotify-now-playing-progress"');
    expect(html).toContain("Spotify · Big Screen");
    expect(html).toContain("Big Screen");
    expect(html).not.toContain('id="spotify-now-playing-close"');
    expect(renderer).not.toContain("Playing in the background");
    expect(renderer).not.toContain("press Play to resume");
    expect(renderer).toContain("elements.spotifyHomePlayer.hidden = !backgrounded");
    expect(renderer).toContain('elements.ambientDisplay.addEventListener("click"');
    expect(renderer).toContain('.closest(".spotify-now-playing-transport button")');
    expect(renderer).toContain('sendSpotifyHomeAction("rewind"');
    expect(renderer).toContain('sendSpotifyHomeAction("play-pause"');
    expect(renderer).toContain('sendSpotifyHomeAction("fast-forward"');
    expect(renderer).toContain('void openService("spotify", "Spotify")');
    expect(css).toContain(".spotify-home-player");
    expect(css).toContain(".spotify-home-transport .spotify-home-play");
    expect(css).toContain('.ambient-display[data-mode="spotify"]');
    expect(css).toContain(".spotify-now-playing");
    expect(css).not.toContain(".spotify-now-playing-close");
  });
});
