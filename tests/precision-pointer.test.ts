import { describe, expect, it } from "vitest";
import {
  buildPrecisionPointerHideScript,
  buildPrecisionPointerTargetScript,
  precisionScrollDelta
} from "../src/main/precision-pointer";

describe("precision pointer page boundary", () => {
  it("uses normalized coordinates and snaps only to visible interactive targets", () => {
    const script = buildPrecisionPointerTargetScript(0.25, 0.75);

    expect(script).toContain("Math.max(0, Math.min(1, 0.25)) * innerWidth");
    expect(script).toContain("Math.max(0, Math.min(1, 0.75)) * innerHeight");
    expect(script).toContain("distance <= snapRadius");
    expect(script).toContain('a[href^="/watch"]');
    expect(script).toContain("candidate.closest('[aria-hidden=\"true\"],[inert]') === null");
    expect(script).toContain("element.dataset.remoteFocused = 'true'");
    expect(script).toContain("element.removeAttribute('data-remote-focused')");
    expect(script).toContain("nhd-tv-precision-cursor");
    expect(script).toContain("document.fullscreenElement instanceof HTMLElement");
    expect(script).not.toContain(".click()");
  });

  it("keeps small tap drift on the prior safe target and reverses native macOS wheel deltas", () => {
    const script = buildPrecisionPointerTargetScript(0.5, 0.5, "tap");

    expect(script).toContain("phase === 'tap'");
    expect(script).toContain("distance <= snapRadius * 1.4");
    expect(precisionScrollDelta(1)).toBe(-90);
    expect(precisionScrollDelta(-1)).toBe(90);
  });

  it("removes the owned free cursor and focus markers when precision mode exits", () => {
    const script = buildPrecisionPointerHideScript();

    expect(script).toContain("nhd-tv-precision-cursor");
    expect(script).toContain("?.remove()");
    expect(script).toContain("removeAttribute('data-nhd-tv-has-focus')");
  });

  it("excludes editable, credential, and payment surfaces", () => {
    const script = buildPrecisionPointerTargetScript(0.5, 0.5);

    expect(script).toContain("input,textarea,select");
    expect(script).toContain("password|payment|checkout|billing");
    expect(script).not.toContain("ipcRenderer");
    expect(script).not.toContain("fetch(");
  });
});
