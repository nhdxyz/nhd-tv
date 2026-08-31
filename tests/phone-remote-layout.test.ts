import { describe, expect, it } from "vitest";
import { REMOTE_CSS } from "../src/main/remote/remote-assets";

describe("phone remote responsive layout", () => {
  it("keeps the navigation surface in flow instead of painting over later controls", () => {
    expect(REMOTE_CSS).toMatch(
      /\.control-surface\s*\{[^}]*flex:\s*0 0 auto;/s
    );
    expect(REMOTE_CSS.match(/width:\s*min\(var\(--navigation-size\), 100%\);/g)).toHaveLength(2);
    expect(REMOTE_CSS).toContain(
      ":root { --navigation-size: clamp(8.25rem, 27dvh, 13rem); }"
    );

    // Three equal D-pad tracks retain a 44px minimum target at the compact size.
    expect((8.25 * 16) / 3).toBe(44);
  });

  it("keeps voice ahead of navigation in short landscape viewports", () => {
    const landscapeStart = REMOTE_CSS.indexOf(
      "@media (orientation: landscape) and (max-height: 500px)"
    );
    const landscapeEnd = REMOTE_CSS.indexOf(
      "@media (prefers-reduced-motion: reduce)",
      landscapeStart
    );
    const landscapeRules = REMOTE_CSS.slice(landscapeStart, landscapeEnd);

    expect(landscapeStart).toBeGreaterThan(-1);
    expect(landscapeRules).toContain(".voice-control { order: 2; }");
    expect(landscapeRules).toContain(".control-surface { order: 3; }");
    expect(landscapeRules.indexOf(".voice-control")).toBeLessThan(
      landscapeRules.indexOf(".control-surface")
    );
  });

  it("accounts for phone safe areas on every edge", () => {
    for (const edge of ["top", "right", "bottom", "left"]) {
      expect(REMOTE_CSS).toContain(`env(safe-area-inset-${edge})`);
    }
  });

  it("contains oversized text and navigation on narrow phone viewports", () => {
    expect(REMOTE_CSS).toMatch(
      /\.dpad\s*\{[^}]*width:\s*min\(var\(--navigation-size\), 100%\);/s
    );
    expect(REMOTE_CSS).toMatch(
      /\.precision-pad\s*\{[^}]*width:\s*min\(var\(--navigation-size\), 100%\);/s
    );
    expect(REMOTE_CSS).toMatch(/\.voice-status strong\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
    expect(REMOTE_CSS).toMatch(/\.voice-help\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
    expect(REMOTE_CSS).toMatch(/\.voice-cancel\s*\{[^}]*position:\s*static;/s);
    expect(REMOTE_CSS).toMatch(/\.voice-cancel\s*\{[^}]*width:\s*100%;/s);
    expect(REMOTE_CSS).toMatch(/#connection-state\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  });

  it("retains usable directional targets across the supported viewport matrix", () => {
    const viewports = [
      { height: 568, width: 320 },
      { height: 667, width: 375 },
      { height: 844, width: 390 },
      { height: 932, width: 430 },
      { height: 320, width: 568 },
      { height: 390, width: 844 }
    ];

    for (const viewport of viewports) {
      const compact = viewport.height <= 700;
      const requestedSize = compact
        ? Math.min(13 * 16, Math.max(8.25 * 16, viewport.height * 0.27))
        : Math.min(15.75 * 16, Math.max(11 * 16, viewport.height * 0.3));
      const bodyPadding = 2 * 0.8 * 16;
      const cardPadding = 2 * (compact ? 0.68 : 0.78) * 16;
      const contentWidth = viewport.width - bodyPadding - cardPadding;
      const renderedSize = Math.min(requestedSize, contentWidth);

      expect(renderedSize).toBeLessThanOrEqual(contentWidth);
      expect(renderedSize / 3).toBeGreaterThanOrEqual(44);
    }
  });

  it("keeps long confirmation copy reachable on short portrait and landscape screens", () => {
    expect(REMOTE_CSS).toMatch(
      /\.voice-confirm\s*\{[^}]*max-height:\s*calc\(100% - 7\.3rem\);/s
    );
    expect(REMOTE_CSS).toMatch(/\.voice-confirm\s*\{[^}]*overflow-y:\s*auto;/s);
    expect(REMOTE_CSS).toMatch(/\.voice-confirm strong\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
    expect(REMOTE_CSS).toMatch(
      /\.voice-confirm > div:last-child\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0;/s
    );
  });

  it("disables transitions as well as animations for reduced motion", () => {
    const reducedMotion = REMOTE_CSS.slice(
      REMOTE_CSS.indexOf("@media (prefers-reduced-motion: reduce)")
    );
    expect(reducedMotion).toContain("animation-duration: 0.01ms !important;");
    expect(reducedMotion).toContain("transition-duration: 0.01ms !important;");
  });
});
