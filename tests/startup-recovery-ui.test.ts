import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const renderer = readFileSync(new URL("../src/renderer/index.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/renderer/style.css", import.meta.url), "utf8");

describe("startup recovery UI", () => {
  it("keeps optional credential loading from blocking the app catalog", () => {
    const initialize = renderer.slice(
      renderer.indexOf("async function initializeServices"),
      renderer.indexOf("elements.storeSearch", renderer.indexOf("async function initializeServices"))
    );
    const requiredLoad = initialize.slice(
      initialize.indexOf("await Promise.all"),
      initialize.indexOf("]);", initialize.indexOf("await Promise.all"))
    );

    expect(requiredLoad).toContain("window.nhd.getServices()");
    expect(requiredLoad).toContain("window.nhd.getLocalAppState()");
    expect(requiredLoad).not.toContain("getOpenAiCredentialStatus");
    expect(initialize).toContain("renderOpenAiCredentialStatus({");
    expect(initialize).toContain('state: "unavailable"');
  });

  it("replaces indefinite loading with persistent retry surfaces", () => {
    expect(renderer).toContain("function renderServicesLoading()");
    expect(renderer).toContain("function renderServiceLoadFailure()");
    expect(renderer).toContain('elements.heroOpenButton.textContent = "Try again"');
    expect(renderer).toContain("if (servicesLoadFailed)");
    expect(renderer).toContain('action.textContent = "Try again"');
    expect(css).toContain(".service-load-state");
  });

  it("makes Continue Watching failures distinguishable and retryable", () => {
    expect(renderer).toContain("let continueWatchingLoadFailed = false");
    expect(renderer).toContain('title.textContent = continueWatchingLoadFailed');
    expect(renderer).toContain("continueWatchingLoadFailed = true");
    expect(renderer).toContain("void initializeContinueWatching()");
  });
});
