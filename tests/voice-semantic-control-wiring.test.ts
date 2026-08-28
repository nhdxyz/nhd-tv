import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
