import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hostSource = readFileSync(new URL("../src/main/service-host.ts", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../src/main/index.ts", import.meta.url), "utf8");

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  return source.slice(startIndex, source.indexOf(end, startIndex));
}

describe("voice provider destination navigation wiring", () => {
  it("forwards cancellation and operation ownership through in-place provider navigation", () => {
    const navigation = sourceBetween(
      hostSource,
      "async navigate(\n",
      "async executeVoiceMediaIntent("
    );

    expect(navigation).toContain("signal?: AbortSignal");
    expect(navigation).toContain("operationToken?: ServiceOperationToken");
    expect(navigation).toContain("operationToken ?? this.beginOperation()");
    expect(navigation).toContain("waitWithSignal(this.#checkpointPlayback(operation), signal)");
    expect(navigation).toContain("waitWithSignal(view.webContents.loadURL(url), signal)");
    expect(navigation).toContain("this.#operationOwner.owns(operation)");
    expect(navigation).toContain("view.webContents.stop()");
    expect(navigation).toContain('removeEventListener("abort", cancelNavigation)');
    expect(navigation).not.toContain("#closeVoiceOperationView");
    expect(navigation).not.toContain("this.close()");
    expect(hostSource).toContain("get activeUrl(): string | null");
    expect(hostSource).toContain("view.webContents.getURL()");
  });

  it("executes destination plans through the bounded executor with the active operation", () => {
    const execution = sourceBetween(
      indexSource,
      "async function executeVoiceCommandPlanCore(",
      "async function executeVoiceCommandPlan("
    );

    expect(execution).toContain('plan.kind === "open-provider-destination"');
    expect(execution).toContain("executeVoiceProviderDestination(plan");
    expect(execution).toContain("enabledServiceIds:");
    expect(execution).toContain("getServiceDefinition");
    expect(execution).toContain("host: serviceHost");
    expect(execution).toContain("openService: openTrackedService");
    expect(execution).toContain("operationToken: operation");
    expect(execution).toContain("signal");
  });
});
