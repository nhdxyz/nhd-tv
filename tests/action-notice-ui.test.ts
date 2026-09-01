import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../src/renderer/index.html", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../src/renderer/index.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/renderer/style.css", import.meta.url), "utf8");

describe("persistent action notice", () => {
  it("provides an accessible persistent progress and error surface", () => {
    expect(html).toContain('id="action-notice"');
    expect(html).toContain('id="action-notice-retry"');
    expect(html).toContain('id="action-notice-dismiss"');
    expect(html).toContain('aria-atomic="true"');
    expect(renderer).toContain("function showActionNotice(");
    expect(renderer).toContain('options.state === "error" ? "alert" : "status"');
    expect(css).toContain(".action-notice[data-state=\"error\"]");
  });

  it("keeps launch, resume, search, and playback failures retryable", () => {
    expect(renderer).toContain("async function resumeContinueWatchingItem(");
    expect(renderer).toContain('title: `${presentation.title} didn’t resume`');
    expect(renderer).toContain('title: `${serviceName} didn’t open`');
    expect(renderer).toContain('title: `${service.name} search didn’t open`');
    expect(renderer).toContain('title: "Spotify control didn’t work"');
    expect(renderer).toContain("async function sendShellInputAction(");
    expect(renderer).toContain('title: "Control didn’t work"');
  });

  it("bounds long-running app actions and suppresses stale completions", () => {
    expect(renderer).toContain("const APP_ACTION_TIMEOUT_MS = 30_000");
    expect(renderer).toContain("const PLAYBACK_ACTION_TIMEOUT_MS = 10_000");
    expect(renderer).toContain("if (expectedVersion !== undefined && expectedVersion !== actionNoticeVersion) return");
    expect(renderer).toContain("if (version !== actionNoticeVersion) return");
  });
});
