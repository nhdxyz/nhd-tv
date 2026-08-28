import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/main/index.ts", import.meta.url), "utf8");
const handler = source.slice(
  source.indexOf("IPC_CHANNELS.updateProfilePreferences"),
  source.indexOf("IPC_CHANNELS.updateDevicePreferences")
);
const initializationStart = source.indexOf(
  "voiceProfilePreferenceCoordinator = new VoiceProfilePreferenceCoordinator"
);
const initialization = source.slice(
  initializationStart,
  source.indexOf("setCustomServiceManifests(", initializationStart)
);

describe("voice profile-preference revocation", () => {
  it("routes every settings save through the serialized authority coordinator", () => {
    expect(handler).toContain("voiceProfilePreferenceCoordinator.update(preferences)");
    expect(initialization).toContain("beginServiceBarrier: () => serviceHost?.beginOperation()");
    expect(initialization).toContain("cancelDiscovery: () => googleWatchResolver?.cancelActive()");
    expect(initialization).toContain("phoneRemote?.cancelActiveVoiceOperation()");
  });

  it("blocks new voice uploads while removed authority is being committed", () => {
    expect(source).toContain("if (voiceAuthorityUpdateInProgress)");
    expect(initialization).toContain("voiceAuthorityUpdateInProgress = inProgress");
    expect(initialization).toContain("closeWithCheckpoint(undefined, operation)");
    expect(initialization).toContain("phoneRemote.suspendVoiceAuthority()");
    expect(initialization).toContain("phoneRemote?.resumeVoiceAuthority(token)");
  });

  it("serializes profile changes and custom-service removal through the same boundary", () => {
    expect(source).toContain("coordinator.changeProfile(async () =>");
    expect(source).toContain("voiceProfilePreferenceCoordinator.removeService(");
  });
});
