import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/main/index.ts", import.meta.url), "utf8");
const rendererSource = readFileSync(
  new URL("../src/renderer/index.ts", import.meta.url),
  "utf8"
);
const coordinatorSource = readFileSync(
  new URL("../src/main/voice/voice-profile-preference-coordinator.ts", import.meta.url),
  "utf8"
);
const handler = source.slice(
  source.indexOf("IPC_CHANNELS.updateProfilePreferences"),
  source.indexOf("IPC_CHANNELS.updateDevicePreferences")
);
const deviceHandler = source.slice(
  source.indexOf("IPC_CHANNELS.updateDevicePreferences"),
  source.indexOf("IPC_CHANNELS.cycleDisplay")
);
const credentialHandlers = source.slice(
  source.indexOf("IPC_CHANNELS.saveOpenAiApiKey"),
  source.indexOf("IPC_CHANNELS.addCustomService")
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
    expect(initialization).toContain("phoneRemote?.cancelPendingVoiceConfirmations()");
    expect(initialization).toContain("phoneRemote?.cancelPendingVoiceCapture()");
  });

  it("serializes profile changes and custom-service removal through the same boundary", () => {
    expect(source).toContain("coordinator.changeProfile(async () =>");
    expect(source).toContain("voiceProfilePreferenceCoordinator.removeService(");
  });

  it("binds confirmation cards to profile generation and enabled-service authority", () => {
    expect(source).toContain("getAuthorityKey: () => {");
    expect(source).toContain("if (voiceAuthorityUpdateInProgress) return null");
    expect(source).toContain("state.profileRevision");
    expect(source).toContain("[...new Set(state.enabledServiceIds)].sort()");
    expect(source).toContain("voiceAuthorityRevision");
    expect(source).toContain("!appState.devicePreferences.voiceControlEnabled");
    expect(source).toContain('openAiCredentialStore?.status().state !== "configured"');
  });

  it("revokes authority before disabling voice or clearing the credential", () => {
    expect(deviceHandler).toContain("updateDevicePreferencesWithVoiceAuthority(preferences)");
    expect(source).toContain("voiceProfilePreferenceCoordinator.updateDevicePreferences(value)");
    expect(initialization).toContain("getCurrentDevicePreferences:");
    expect(initialization).toContain("previewDevicePreferencePatch:");
    expect(coordinatorSource).toContain("current.voiceControlEnabled");
    expect(coordinatorSource).toContain("!next.voiceControlEnabled");
    expect(rendererSource).toContain("window.nhd.updateDevicePreferences(changes)");
    expect(rendererSource).not.toContain("...localAppState.devicePreferences,\n    ...changes");
    expect(credentialHandlers).toContain("coordinateAuthorityChange(");
    expect(credentialHandlers).toContain("() => true");
    expect(initialization).toContain("voiceAuthorityRevision += 1");
  });
});
