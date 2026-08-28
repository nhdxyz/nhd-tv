import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/main/index.ts", import.meta.url), "utf8");
const handler = source.slice(
  source.indexOf("IPC_CHANNELS.updateProfilePreferences"),
  source.indexOf("IPC_CHANNELS.updateDevicePreferences")
);

describe("voice profile-preference revocation", () => {
  it("revokes every in-flight authority before mutating the active lineup", () => {
    const supersedeProvider = handler.indexOf("serviceHost?.beginOperation()");
    const cancelDiscovery = handler.indexOf("googleWatchResolver?.cancelActive()");
    const cancelPhone = handler.indexOf("phoneRemote?.cancelActiveVoiceOperation()");
    const update = handler.indexOf("localStateStore.updatePreferences(preferences)");

    expect(supersedeProvider).toBeGreaterThan(-1);
    expect(cancelDiscovery).toBeGreaterThan(supersedeProvider);
    expect(cancelPhone).toBeGreaterThan(cancelDiscovery);
    expect(update).toBeGreaterThan(cancelPhone);
  });

  it("closes an open service that the updated lineup no longer enables", () => {
    const update = handler.indexOf("localStateStore.updatePreferences(preferences)");
    const recheck = handler.indexOf("state.preferences.enabledServiceIds.includes(activeServiceId)");
    const close = handler.indexOf("serviceHost?.closeWithCheckpoint()");

    expect(recheck).toBeGreaterThan(update);
    expect(close).toBeGreaterThan(recheck);
  });
});
