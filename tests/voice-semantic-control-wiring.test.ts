import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getServiceDefinition } from "../src/main/service-registry";
import { isPlaybackUrl } from "../src/main/security/navigation-policy";

const source = readFileSync(
  new URL("../src/main/service-host.ts", import.meta.url),
  "utf8"
);
const method = source.slice(
  source.indexOf("async executeVoiceSemanticControl("),
  source.indexOf("async sendRemotePointer(")
);
const indexSource = readFileSync(
  new URL("../src/main/index.ts", import.meta.url),
  "utf8"
);
const execution = indexSource.slice(
  indexSource.indexOf("async function executeVoiceCommandPlanCore("),
  indexSource.indexOf("async function executeVoiceCommandPlan(")
);

describe("semantic voice control host wiring", () => {
  it("executes only the closed script in the active provider view", () => {
    expect(method).toContain("buildVoiceSemanticControlScript(definition.id, request)");
    expect(method).toContain("view.webContents.executeJavaScript(script, true)");
    expect(method).toContain("parseVoiceSemanticControlResult(rawResult)");
    expect(method).toContain('result !== "needs-follow-up"');
    expect(method).toContain("attempt < 3");
    expect(method).toContain("this.#operationOwner.throwIfSuperseded(operation)");
    expect(method).not.toContain("loadURL(");
    expect(method).not.toContain("#closeVoiceOperationView");
  });

  it("rejects video controls on provider preview pages before page execution", () => {
    const gate = method.indexOf('definition.id !== "spotify"');
    const build = method.indexOf("buildVoiceSemanticControlScript(definition.id, request)");
    const execute = method.indexOf("view.webContents.executeJavaScript(script, true)");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(build);
    expect(gate).toBeLessThan(execute);
    expect(method.slice(gate, build)).toContain("isPlaybackUrl(view.webContents.getURL(), definition)");
    expect(method.slice(gate, build)).toContain('return "unavailable"');
    expect(method.slice(gate, build)).not.toContain("request.action");

    const netflix = getServiceDefinition("netflix");
    const youtube = getServiceDefinition("youtube");
    expect(netflix).not.toBeNull();
    expect(youtube).not.toBeNull();
    if (netflix === null || youtube === null) throw new Error("Expected provider definitions");
    expect(isPlaybackUrl("https://www.netflix.com/browse", netflix)).toBe(false);
    expect(isPlaybackUrl("https://www.netflix.com/watch/80018499", netflix)).toBe(true);
    expect(isPlaybackUrl("https://www.youtube.com/", youtube)).toBe(false);
    expect(isPlaybackUrl("https://www.youtube.com/feed/subscriptions", youtube)).toBe(false);
    expect(isPlaybackUrl("https://www.youtube.com/watch?v=abc", youtube)).toBe(true);
    expect(isPlaybackUrl("https://www.youtube.com/shorts/abc", youtube)).toBe(true);
  });

  it("routes semantic controls before any media discovery and records verified actions", () => {
    const semantic = execution.indexOf('plan.kind === "semantic-control"');
    const google = execution.indexOf("executeGoogleWatchPlan(plan");
    expect(semantic).toBeGreaterThan(-1);
    expect(google).toBeGreaterThan(semantic);
    expect(execution).toContain("serviceHost.executeVoiceSemanticControl(");
    expect(execution).toContain("voiceSemanticControlOutcome(plan.request, result");
    expect(execution).toContain('result === "complete" || result === "verified"');
    expect(execution).toContain("voiceContextStore.recordVerifiedAction({");
    expect(execution).toContain("verifiedActionForSemanticControl(plan.request)");
  });
});
