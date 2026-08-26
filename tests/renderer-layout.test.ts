import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../src/renderer/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/renderer/style.css", import.meta.url), "utf8");

describe("TV catalog layout", () => {
  it("wraps experimental apps into a spatial grid instead of a clipped rail", () => {
    expect(html).toContain('class="catalog-grid" id="experimental-store-actions"');
    expect(html).not.toContain(
      'class="catalog-row horizontal-row" id="experimental-store-actions"'
    );
    expect(css).toContain("grid-template-columns: repeat(auto-fit, minmax(15.5rem, 1fr))");
    expect(css).toContain(".catalog-grid .catalog-card-shell");
  });

  it("keeps the frozen service preview available behind the quit dialog", () => {
    expect(html).toContain('id="quit-service-preview"');
    expect(css).toContain(".quit-service-preview");
    expect(css).toContain(".quit-dialog::backdrop");
  });
});
