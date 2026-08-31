import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../src/renderer/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/renderer/style.css", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../src/renderer/index.ts", import.meta.url), "utf8");

const searchMarkup = html.slice(
  html.indexOf('<dialog class="search-dialog"'),
  html.indexOf('<img class="quit-service-preview"')
);

describe("TV search layout", () => {
  it("keeps text fields in the phone and gamepad focus graph", () => {
    expect(renderer).toContain(
      '"button:not(:disabled), input:not(:disabled), summary"'
    );
  });

  it("uses a full-screen route with a fixed query header and ordered results", () => {
    expect(searchMarkup).toContain('class="search-dialog-titlebar"');
    expect(searchMarkup).toContain('class="search-dialog-results"');
    expect(searchMarkup.indexOf('id="search-history-section"'))
      .toBeLessThan(searchMarkup.indexOf('id="catalog-search-section"'));
    expect(searchMarkup.indexOf('id="catalog-search-section"'))
      .toBeLessThan(searchMarkup.indexOf('id="search-provider-section"'));
    expect(css).toContain("width: 100vw");
    expect(css).toContain("grid-template-rows: auto minmax(0, 1fr)");
    expect(css).toContain(".search-dialog-results {");
    expect(css).toContain(".dialog-close.search-close {");
  });

  it("keeps the privacy boundary visible without interrupting the result flow", () => {
    expect(searchMarkup).toContain("Private search");
    expect(searchMarkup).toContain("go to TVmaze");
    expect(searchMarkup).toContain("are not saved by NHD-TV");
    expect(searchMarkup).toContain("only after you choose it");
  });

  it("makes provider selection a secondary step behind one primary result action", () => {
    expect(renderer).toContain('search.className = "catalog-result-primary"');
    expect(renderer).toContain('choose.className = "catalog-result-primary"');
    expect(renderer).toContain('providers.className = "catalog-result-providers"');
    expect(renderer).toContain("providers.hidden = true");
    expect(renderer).toContain('choose.setAttribute("aria-expanded", String(opening))');
    expect(css).toContain(".catalog-result-primary {");
    expect(css).toContain(".catalog-result-providers {");
  });

  it("retains keyboard, remote-result focus, and Back dismissal behavior", () => {
    expect(renderer).toContain("elements.searchInput.focus()");
    expect(renderer).toContain("firstResult?.focus({ preventScroll: true })");
    expect(renderer).toContain('elements.searchDialog.addEventListener("cancel"');
    expect(renderer).toContain("elements.searchDialog.close()");
  });
});
