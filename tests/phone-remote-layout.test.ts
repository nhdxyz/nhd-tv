import { describe, expect, it } from "vitest";
import { REMOTE_CSS } from "../src/main/remote/remote-assets";

describe("phone remote responsive layout", () => {
  it("keeps the navigation surface in flow instead of painting over later controls", () => {
    expect(REMOTE_CSS).toMatch(
      /\.control-surface\s*\{[^}]*flex:\s*0 0 auto;/s
    );
    expect(REMOTE_CSS.match(/width:\s*var\(--navigation-size\);/g)).toHaveLength(2);
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
});
