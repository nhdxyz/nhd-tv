import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { shouldActivateAmbientDisplay } from "../src/main/ambient-display";
import { AMBIENT_CLOCK_STYLES } from "../src/main/contracts";

const preferences = {
  ambientDisplayDelayMinutes: 10 as const,
  ambientDisplayEnabled: true
};

describe("ambient display policy", () => {
  it("keeps every selectable clock theme in one shared registry", () => {
    expect(AMBIENT_CLOCK_STYLES).toEqual([
      "digital",
      "analog",
      "minimal",
      "flip",
      "neon",
      "orbit"
    ]);
  });

  it("requires both host and system inactivity to reach the selected delay", () => {
    expect(shouldActivateAmbientDisplay({
      appIdleMilliseconds: 600_000,
      playbackActive: false,
      preferences,
      presentationBlocked: false,
      systemIdleSeconds: 600,
      windowVisible: true
    })).toBe(true);

    expect(shouldActivateAmbientDisplay({
      appIdleMilliseconds: 600_000,
      playbackActive: false,
      preferences,
      presentationBlocked: false,
      systemIdleSeconds: 2,
      windowVisible: true
    })).toBe(false);
  });

  it("stays hidden during playback, prompts, or when disabled", () => {
    const base = {
      appIdleMilliseconds: 600_000,
      preferences,
      systemIdleSeconds: 600,
      windowVisible: true
    };

    expect(shouldActivateAmbientDisplay({
      ...base,
      playbackActive: true,
      presentationBlocked: false
    })).toBe(false);
    expect(shouldActivateAmbientDisplay({
      ...base,
      playbackActive: false,
      presentationBlocked: true
    })).toBe(false);
    expect(shouldActivateAmbientDisplay({
      ...base,
      playbackActive: false,
      preferences: { ...preferences, ambientDisplayEnabled: false },
      presentationBlocked: false
    })).toBe(false);
  });

  it("connects wake consumption and provider view preservation through owned boundaries", async () => {
    const [main, host, renderer] = await Promise.all([
      readFile(new URL("../src/main/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/main/service-host.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/renderer/index.ts", import.meta.url), "utf8")
    ]);

    expect(main).toContain("powerMonitor.getSystemIdleTime()");
    expect(main).toContain("if (ambientDisplayVisible && action !== \"force-home\")");
    expect(host).toContain("presentAmbientDisplay()");
    expect(host).toContain("restoreFromAmbientDisplay()");
    expect(host).toContain("this.#window.contentView.removeChildView(view)");
    expect(renderer).toContain("event.stopImmediatePropagation()");
    expect(renderer).toContain("onAmbientDisplayChanged(setAmbientDisplayVisible)");
  });
});
