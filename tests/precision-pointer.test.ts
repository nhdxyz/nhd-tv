import { describe, expect, it } from "vitest";
import {
  buildPrecisionPointerHideScript,
  buildShellPrecisionRailScrollScript,
  buildShellPrecisionScrollScript,
  buildPrecisionPointerTargetScript,
  PRECISION_POINTER_IDLE_MS,
  precisionShellScrollDelta,
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
    expect(script).toContain("transition:left 48ms linear,top 48ms linear");
    expect(script).toContain("retainForMove");
    expect(script).toContain("cursor.parentElement !== cursorHost");
    expect(script).toContain("cursor.style.setProperty('opacity', '1'");
    expect(script).toContain(`}, ${PRECISION_POINTER_IDLE_MS});`);
    expect(script).toContain("clearFocus();");
    expect(script).toContain("distance <= 28 && nearest.distance > 0");
    expect(script).toContain("nearest.distance > 0");
    expect(script).not.toContain("element.focus(");
    expect(script).not.toContain(".click()");
  });

  it("scrolls the app-owned shell directly without changing provider wheel direction", () => {
    const script = buildShellPrecisionScrollScript(0.5);

    expect(precisionShellScrollDelta(1)).toBe(90);
    expect(precisionShellScrollDelta(-1)).toBe(-90);
    expect(script).toContain("const deltaY = 45");
    expect(script).toContain("window.scrollBy");
    expect(script).toContain("top: deltaY");
    expect(precisionScrollDelta(1)).toBe(-90);
  });

  it("scrolls only the horizontal shell rail under the precision cursor", () => {
    const script = buildShellPrecisionRailScrollScript(0.5, 0.9, 0.6);

    expect(script).toContain("const deltaX = 45");
    expect(script).toContain("document.elementsFromPoint");
    expect(script).toContain("element.closest('.horizontal-row')");
    expect(script).toContain("element.scrollWidth > element.clientWidth + 2");
    expect(script).toContain("row.scrollBy");
    expect(script).not.toContain("window.scrollBy");
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
    expect(script).toContain("clearTimeout(pointerState.hideTimer)");
    expect(script).toContain("removeAttribute('data-nhd-tv-has-focus')");
  });

  it("excludes editable, credential, and payment surfaces", () => {
    const script = buildPrecisionPointerTargetScript(0.5, 0.5);

    expect(script).toContain("input,textarea,select");
    expect(script).toContain("password|payment|checkout|billing");
    expect(script).not.toContain("ipcRenderer");
    expect(script).not.toContain("fetch(");
  });

  it("admits only declared service search fields for phone text entry", () => {
    const script = buildPrecisionPointerTargetScript(
      0.5,
      0.5,
      "move",
      ['input[data-uia="search-box-input"]']
    );

    expect(script).toContain("declaredTextEntrySelectors");
    expect(script).toContain("search-box-input");
    expect(script).toContain("textEntry: isDeclaredTextEntry(element)");
    expect(script).toContain("['search', 'text'].includes(editable.type)");
    expect(script).toContain("sensitiveBoundary(editable)");
    expect(script).toContain("password|payment|checkout|billing");
  });
});
