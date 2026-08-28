import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/main/index.ts", import.meta.url), "utf8");
const execution = source.slice(
  source.indexOf("async function executeVoiceCommandPlanCore("),
  source.indexOf("async function executeVoiceCommandPlan(")
);
const contextualUnderstanding = source.slice(
  source.indexOf("async function understandVoiceCommandWithContext("),
  source.indexOf("function usesGoogleWatchDiscovery(")
);

describe("voice use-case execution wiring", () => {
  it("sets mute explicitly without superseding provider navigation", () => {
    const setMuted = execution.indexOf('plan.kind === "set-system-muted"');
    const operation = execution.indexOf("serviceHost?.beginOperation()");
    expect(setMuted).toBeGreaterThan(-1);
    expect(execution).toContain("systemVolumeController.setMuted(plan.muted)");
    expect(operation).toBeGreaterThan(setMuted);
  });

  it("revalidates and opens only the planned enabled app", () => {
    expect(execution).toContain('plan.kind === "launch-service"');
    expect(execution).toContain("enabledServiceIds.includes(plan.serviceId)");
    expect(execution).toContain("getServiceDefinition(plan.serviceId)");
    expect(execution).toContain("await openTrackedService(definition, definition.startUrl");
  });

  it("keeps search non-playing and reports failed availability checks honestly", () => {
    expect(execution).toContain('plan.intent.action === "search"');
    expect(execution).toContain("Searched ${definition.name} for ${destination.query}.");
    expect(execution).toContain("I couldn't verify where ${plan.intent.title} is available");
  });

  it("stores and presents numbered choices only for safe enabled watch providers", () => {
    expect(source).toContain("buildVoiceWatchClarification(");
    expect(source).toContain("voiceContextStore.setCandidates(");
    expect(source).toContain('kind: "provider-selection"');
    expect(source).toContain('hasChoices ? "clarification" : "success"');
    expect(source).toContain("{ choices: result.choices, detail: voiceResultDetail(result) }");
  });

  it("answers current-media questions from the shared live context without navigation", () => {
    const query = execution.indexOf('plan.kind === "query-current-media"');
    const operation = execution.indexOf("serviceHost?.beginOperation()");
    expect(query).toBeGreaterThan(-1);
    expect(execution).toContain("syncVoiceContextFromServiceHost()");
    expect(execution).toContain("answerCurrentMediaQuestion(");
    expect(query).toBeLessThan(operation);
  });

  it("resolves follow-up references from fresh TV-wide context before recording the target", () => {
    const sync = contextualUnderstanding.indexOf("syncVoiceContextFromServiceHost()");
    const resolve = contextualUnderstanding.indexOf("resolveVoiceContextIntent(");
    const record = contextualUnderstanding.indexOf("recordVoiceMediaIntentContext(");
    expect(sync).toBeGreaterThan(-1);
    expect(resolve).toBeGreaterThan(sync);
    expect(record).toBeGreaterThan(resolve);
    expect(source).toContain(
      "understandVoiceCommandWithContext(openAiVoiceClient, clip, signal, onTranscript)"
    );
  });
});
