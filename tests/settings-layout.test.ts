import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../src/renderer/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/renderer/style.css", import.meta.url), "utf8");

const settingsMarkup = html.slice(
  html.indexOf('<section class="app-view settings-view"'),
  html.indexOf('<p class="feedback"')
);

describe("TV settings layout", () => {
  it("organizes settings into calm, labeled categories instead of horizontal rails", () => {
    expect(settingsMarkup).toContain('class="settings-categories"');
    expect(settingsMarkup).toContain('id="settings-remote-title">Remote & profiles');
    expect(settingsMarkup).toContain('id="settings-voice-title">Voice');
    expect(settingsMarkup).toContain('id="settings-display-title">Display & playback');
    expect(settingsMarkup).toContain('id="settings-ambient-title">Ambient display');
    expect(settingsMarkup).not.toContain("settings-row horizontal-row");
    expect(settingsMarkup).not.toContain("settings-row-secondary horizontal-row");
  });

  it("keeps every existing settings control available", () => {
    const ids = [
      "settings-remote-button",
      "remote-auto-connect-toggle",
      "sound-toggle",
      "gamepad-card",
      "profile-card",
      "voice-settings-button",
      "voice-control-toggle",
      "voice-playback-mode",
      "voice-region-button",
      "display-card",
      "fullscreen-toggle",
      "safe-area-toggle",
      "motion-toggle",
      "youtube-tv-toggle",
      "youtube-tv-scale",
      "ambient-display-toggle",
      "ambient-clock-style",
      "ambient-display-delay",
      "ambient-display-preview"
    ];

    for (const id of ids) {
      expect(settingsMarkup).toContain(`id="${id}"`);
    }
  });

  it("uses readable list rows with explicit switch semantics", () => {
    expect(css).toContain(".settings-category {");
    expect(css).toContain(".settings-list {");
    expect(css).toContain('.settings-card[aria-pressed]::before');
    expect(css).toContain('.settings-card[aria-pressed="true"]::after');
    expect(css).toContain("font-size: 0.94rem");
    expect(settingsMarkup).not.toContain("settings-icon-text");
    expect(settingsMarkup).not.toContain('<p class="eyebrow">01</p>');
  });
});
