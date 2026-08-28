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

describe("semantic voice control host wiring", () => {
  it("executes only the closed script in the active provider view", () => {
    expect(method).toContain("buildVoiceSemanticControlScript(definition.id, request)");
    expect(method).toContain("view.webContents.executeJavaScript(script, true)");
    expect(method).toContain("parseVoiceSemanticControlResult(rawResult)");
    expect(method).toContain("this.#operationOwner.throwIfSuperseded(operation)");
    expect(method).not.toContain("loadURL(");
    expect(method).not.toContain("#closeVoiceOperationView");
  });
});
