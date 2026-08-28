import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/main/service-host.ts", import.meta.url), "utf8");

function methodSource(start: string, end: string): string {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}

describe("voice provider cancellation", () => {
  it("leaves an opened provider in place when media automation is cancelled", () => {
    const automation = methodSource(
      "async executeVoiceMediaIntent(",
      "cancelQuit(): void"
    );

    expect(automation).toContain("signal?.throwIfAborted()");
    expect(automation).not.toContain("#closeVoiceOperationView");
    expect(automation).not.toContain("this.close()");
  });

  it("does not close the active provider when a remote action times out", () => {
    const remoteAction = methodSource(
      "async sendRemoteAction(",
      "async executeVoiceSemanticControl("
    );

    expect(remoteAction).toContain("signal?.throwIfAborted()");
    expect(remoteAction).not.toContain("#closeVoiceOperationView");
    expect(remoteAction).not.toContain("this.close()");
  });
});
