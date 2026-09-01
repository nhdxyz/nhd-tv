import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(new URL("../src/main/index.ts", import.meta.url), "utf8");

describe("voice recommendation UX", () => {
  it("turns recommendations into bounded contextual choices instead of executing a model title", () => {
    const binding = mainSource.slice(
      mainSource.indexOf("function bindVoiceRecommendationChoices"),
      mainSource.indexOf("async function executeVoiceRecommendationPlan")
    );
    expect(binding).toContain("recommendations.length !== 3");
    expect(binding).toContain("store.setCandidates(candidates, revisions)");
    expect(binding).toContain('kind: "candidate-selection"');
    expect(binding).toContain("ordinal: (index + 1) as 1 | 2 | 3");
    expect(binding).toContain("provider: { id: providerId, name: providerName }");
  });

  it("falls back to the provider search when structured recommendations fail", () => {
    expect(mainSource).toContain("executeVoiceRecommendationPlan(");
    expect(mainSource).toContain("The provider search below remains a useful fallback");
    expect(mainSource).toContain("Choose one to check and play on");
  });
});
