import { describe, expect, it } from "vitest";
import {
  captureVoiceExecutionScope,
  revalidateVoiceCandidateServiceIds,
  type VoiceExecutionProfileState
} from "../src/main/voice/voice-execution-scope";

function state(
  overrides: Partial<VoiceExecutionProfileState> = {}
): VoiceExecutionProfileState {
  return {
    activeProfileId: "profile-a",
    enabledServiceIds: ["netflix", "youtube"],
    profileRevision: 7,
    ...overrides
  };
}

describe("voice execution profile scope", () => {
  it("removes services disabled while discovery is in flight", () => {
    const scope = captureVoiceExecutionScope(state());

    expect(revalidateVoiceCandidateServiceIds(
      scope,
      state({ enabledServiceIds: ["netflix"] }),
      ["youtube", "netflix"]
    )).toEqual(["netflix"]);
  });

  it("never adds a service enabled after the command began", () => {
    const scope = captureVoiceExecutionScope(state({
      enabledServiceIds: ["netflix"]
    }));

    expect(revalidateVoiceCandidateServiceIds(
      scope,
      state({ enabledServiceIds: ["netflix", "youtube"] }),
      ["netflix"]
    )).toEqual(["netflix"]);
  });

  it("rejects results after switching to another profile", () => {
    const scope = captureVoiceExecutionScope(state());

    expect(revalidateVoiceCandidateServiceIds(
      scope,
      state({ activeProfileId: "profile-b", profileRevision: 8 }),
      ["netflix", "youtube"]
    )).toBeNull();
  });

  it("rejects an away-and-back profile race even when the id matches again", () => {
    const scope = captureVoiceExecutionScope(state());

    expect(revalidateVoiceCandidateServiceIds(
      scope,
      state({ profileRevision: 9 }),
      ["netflix", "youtube"]
    )).toBeNull();
  });

  it("preserves original order and removes duplicate candidates", () => {
    const scope = captureVoiceExecutionScope(state());

    expect(revalidateVoiceCandidateServiceIds(
      scope,
      state(),
      ["youtube", "netflix", "youtube"]
    )).toEqual(["youtube", "netflix"]);
  });
});
