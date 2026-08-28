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
const googleExecution = source.slice(
  source.indexOf("async function executeGoogleWatchPlan("),
  source.indexOf("async function executeVoiceCommandPlanCore(")
);
const planWrapper = source.slice(
  source.indexOf("async function executeVoiceCommandPlan("),
  source.indexOf("function voiceFailure(")
);

describe("voice use-case execution wiring", () => {
  it("sets mute explicitly without superseding provider navigation", () => {
    const setMuted = execution.indexOf('plan.kind === "set-system-muted"');
    const operation = execution.indexOf("serviceHost?.beginOperation()");
    expect(setMuted).toBeGreaterThan(-1);
    expect(execution).toContain("systemVolumeController.setMuted(plan.muted)");
    expect(operation).toBeGreaterThan(setMuted);
  });

  it("sets absolute volume before acquiring a provider operation", () => {
    const setVolume = execution.indexOf('plan.kind === "set-system-volume"');
    const operation = execution.indexOf("serviceHost?.beginOperation()");
    expect(setVolume).toBeGreaterThan(-1);
    expect(execution).toContain("systemVolumeController.setVolume(plan.volumePercent)");
    expect(operation).toBeGreaterThan(setVolume);
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
    expect(source).toContain("store.setCandidates(");
    expect(source).toContain('kind: "provider-selection"');
    expect(source).toContain("Choose where to play ${title}: ${providerNames}.");
    expect(source).toContain('hasChoices ? "clarification" : "success"');
    expect(source).toContain("{ choices: result.choices, detail: voiceResultDetail(result) }");
  });

  it("binds media execution to one profile generation", () => {
    const capture = planWrapper.indexOf("captureVoiceExecutionScope(profileState)");
    const execute = planWrapper.indexOf("executeVoiceCommandPlanCore(");
    expect(planWrapper).toContain('plan.kind === "resolve-media"');
    expect(planWrapper).toContain("syncVoiceContextFromServiceHost()");
    expect(capture).toBeGreaterThan(-1);
    expect(execute).toBeGreaterThan(capture);
    expect(execution).toContain("error instanceof VoiceExecutionProfileChangedError");
    expect(execution).toContain("voiceExecutionProfileChangedResult()");
  });

  it("revalidates the live lineup at every media side-effect boundary", () => {
    const bind = googleExecution.indexOf("bindVoiceWatchClarification(");
    const select = googleExecution.indexOf("selectEnabledWatchOffer(");
    const expand = googleExecution.indexOf("watchOffersShouldExpand(");
    const googleOpen = googleExecution.indexOf("await openTrackedService(");
    const fallbackResolve = execution.indexOf("resolveVoiceMediaDestination(");
    const fallbackOpen = execution.indexOf("await openTrackedService(definition, searchUrl");

    expect(googleExecution).toContain("currentVoiceCandidateServiceIds(");
    expect(googleExecution.slice(0, bind)).toContain("currentVoiceCandidateServiceIds(");
    expect(googleExecution.slice(0, select)).toContain("currentVoiceCandidateServiceIds(");
    expect(googleExecution.slice(select, expand)).toContain("currentVoiceCandidateServiceIds(");
    expect(googleExecution.slice(expand, googleOpen)).toContain("currentVoiceCandidateServiceIds(");
    expect(execution.slice(0, fallbackResolve)).toContain("currentVoiceCandidateServiceIds(");
    expect(execution.slice(fallbackResolve, fallbackOpen)).toContain(
      "currentVoiceCandidateServiceIds("
    );
  });

  it("answers current-media questions from the shared live context without navigation", () => {
    const query = execution.indexOf('plan.kind === "query-current-media"');
    const operation = execution.indexOf("serviceHost?.beginOperation()");
    expect(query).toBeGreaterThan(-1);
    expect(execution).toContain("syncVoiceContextFromServiceHost()");
    expect(execution).toContain("answerCurrentMediaQuestion(");
    expect(source).toContain("parseVoiceEpisodeCoordinates(current.subtitle)");
    expect(source).toContain("episodeNumber: episodeCoordinates?.episodeNumber ?? null");
    expect(query).toBeLessThan(operation);
  });

  it("preserves the qualified playback rate through shared current-media context", () => {
    expect(source).toContain("playbackRate: current.playbackRate");
    expect(source).toContain("playbackRate: snapshot.playbackRate");
  });

  it("resolves follow-up references without committing an unexecuted target", () => {
    const sync = contextualUnderstanding.indexOf("syncVoiceContextFromServiceHost()");
    const resolve = contextualUnderstanding.indexOf("resolveVoiceContextIntent(");
    expect(sync).toBeGreaterThan(-1);
    expect(resolve).toBeGreaterThan(sync);
    expect(contextualUnderstanding).not.toContain("recordVoiceMediaIntentContext(");
    expect(source).toContain(
      "understandVoiceCommandWithContext(openAiVoiceClient, clip, signal, onTranscript)"
    );
  });

  it("commits universal media context only after a handled, non-cancelled result", () => {
    const execute = planWrapper.indexOf("await executeVoiceCommandPlanCore(");
    const abort = planWrapper.indexOf("signal?.throwIfAborted()", execute);
    const handled = planWrapper.indexOf("result.handled", execute);
    const record = planWrapper.indexOf("recordVoiceMediaIntentContext(", execute);
    expect(execute).toBeGreaterThan(-1);
    expect(abort).toBeGreaterThan(execute);
    expect(handled).toBeGreaterThan(abort);
    expect(record).toBeGreaterThan(handled);
    expect(planWrapper).toContain("preserveCandidates:");
    expect(planWrapper).toContain("result.choices?.length");
  });
});
