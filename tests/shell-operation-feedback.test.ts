import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const renderer = readFileSync(new URL("../src/renderer/index.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/renderer/style.css", import.meta.url), "utf8");

describe("shell operation feedback", () => {
  it("bounds search, pairing, and recovery operations", () => {
    expect(renderer).toContain("function withUiDeadline<T>(");
    expect(renderer).toContain("CATALOG_SEARCH_TIMEOUT_MS");
    expect(renderer).toContain("PAIRING_OPERATION_TIMEOUT_MS");
    expect(renderer).toContain("RECOVERY_OPERATION_TIMEOUT_MS");
    expect(renderer).toContain('"Pairing took too long. Try again."');
    expect(renderer).toContain('"That app is taking too long to recover. Try again or return Home."');
  });

  it("keeps show-search failures visible with a retry action", () => {
    expect(renderer).toContain("function renderCatalogSearchFailure(");
    expect(renderer).toContain('retry.textContent = "Try show search again"');
    expect(renderer).toContain('unavailable.className = "catalog-search-empty is-retry"');
    expect(css).toContain(".catalog-search-empty.is-retry");
  });

  it("promotes late catalog results only while remote focus is still waiting", () => {
    expect(renderer).toContain("let promoteRemoteCatalogSearchFocus = false");
    expect(renderer).toContain("if (promoteRemoteCatalogSearchFocus && cards.length > 0");
    expect(renderer).toContain("historyResult === null");
    expect(renderer).toContain(
      "if (elements.searchDialog.open) promoteRemoteCatalogSearchFocus = false"
    );
  });
});
