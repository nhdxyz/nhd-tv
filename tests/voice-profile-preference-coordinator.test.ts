import { describe, expect, it, vi } from "vitest";
import type { LocalAppState, ProfilePreferences } from "../src/main/contracts";
import { ServiceOperationOwner } from "../src/main/service-operation-owner";
import {
  VoiceProfilePreferenceCoordinator,
  type VoiceProfilePreferenceCoordinatorOptions
} from "../src/main/voice/voice-profile-preference-coordinator";

function preferences(enabledServiceIds: string[]): ProfilePreferences {
  return {
    enabledServiceIds,
    favoriteServiceIds: [],
    serviceOrder: [...enabledServiceIds],
    voicePlaybackMode: "automatic"
  };
}

function state(value: ProfilePreferences): LocalAppState {
  return {
    activeProfileId: "default",
    customServices: [],
    devicePreferences: {
      ambientClockStyle: "digital",
      ambientDisplayDelayMinutes: 10,
      ambientDisplayEnabled: true,
      autoApproveFirstRemote: true,
      fullscreen: true,
      reducedMotion: false,
      safeArea: "standard",
      selectedDisplayId: null,
      voiceControlEnabled: true,
      voiceRegion: "US",
      youtubeTvModeEnabled: true,
      youtubeTvScale: "standard"
    },
    preferences: value,
    profiles: [{ id: "default", name: "Living Room" }],
    recentServiceIds: []
  };
}

function coordinatorOptions(overrides: Partial<VoiceProfilePreferenceCoordinatorOptions> = {}) {
  let current = preferences(["netflix", "youtube"]);
  const options: VoiceProfilePreferenceCoordinatorOptions = {
    beginServiceBarrier: vi.fn(() => ({ generation: 2 })),
    cancelDiscovery: vi.fn(),
    cancelVoice: vi.fn(),
    closeActiveService: vi.fn(async () => undefined),
    getActiveServiceId: vi.fn(() => null),
    getCurrentPreferences: vi.fn(() => current),
    previewPreferences: vi.fn((value) => value as ProfilePreferences),
    setAuthorityUpdateInProgress: vi.fn(),
    updatePreferences: vi.fn(async (next) => {
      current = next;
      return state(next);
    }),
    ...overrides
  };
  return options;
}

describe("voice profile preference coordinator", () => {
  it("closes a removed active provider before committing the new lineup", async () => {
    const events: string[] = [];
    let activeServiceId: string | null = "youtube";
    const options = coordinatorOptions({
      beginServiceBarrier: () => {
        events.push("barrier");
        return { generation: 4 };
      },
      cancelDiscovery: () => events.push("cancel-discovery"),
      cancelVoice: () => events.push("cancel-voice"),
      closeActiveService: async () => {
        events.push("close");
        activeServiceId = null;
      },
      getActiveServiceId: () => activeServiceId,
      setAuthorityUpdateInProgress: (inProgress) => events.push(inProgress ? "lock" : "unlock"),
      updatePreferences: async (next) => {
        events.push("update");
        return state(next);
      }
    });
    const coordinator = new VoiceProfilePreferenceCoordinator(options);

    await coordinator.update(preferences(["netflix"]));

    expect(events).toEqual([
      "lock",
      "barrier",
      "cancel-discovery",
      "cancel-voice",
      "close",
      "update",
      "unlock"
    ]);
  });

  it("does not revoke work for additions, ordering, favorites, or playback mode", async () => {
    const options = coordinatorOptions();
    const coordinator = new VoiceProfilePreferenceCoordinator(options);
    const next = {
      ...preferences(["youtube", "netflix", "spotify"]),
      favoriteServiceIds: ["spotify"],
      voicePlaybackMode: "confirm" as const
    };

    await coordinator.update(next);

    expect(options.beginServiceBarrier).not.toHaveBeenCalled();
    expect(options.cancelDiscovery).not.toHaveBeenCalled();
    expect(options.cancelVoice).not.toHaveBeenCalled();
    expect(options.updatePreferences).toHaveBeenCalledWith(next);
  });

  it("supersedes a command paused before its provider side effect", async () => {
    const owner = new ServiceOperationOwner();
    const command = owner.begin();
    const controller = new AbortController();
    let opened = false;
    let activeServiceId: string | null = null;
    const options = coordinatorOptions({
      beginServiceBarrier: () => owner.begin(),
      cancelVoice: () => controller.abort(),
      closeActiveService: async () => undefined,
      getActiveServiceId: () => activeServiceId
    });
    const coordinator = new VoiceProfilePreferenceCoordinator(options);

    await coordinator.update(preferences(["netflix"]));
    if (owner.owns(command) && !controller.signal.aborted) {
      activeServiceId = "youtube";
      opened = true;
    }

    expect(opened).toBe(false);
    expect(controller.signal.aborted).toBe(true);
  });

  it("serializes overlapping remove and re-add updates in invocation order", async () => {
    let current = preferences(["netflix", "youtube"]);
    let releaseFirst!: () => void;
    const firstPersistence = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const updates: string[][] = [];
    const options = coordinatorOptions({
      getCurrentPreferences: () => current,
      updatePreferences: async (next) => {
        updates.push([...next.enabledServiceIds]);
        if (updates.length === 1) await firstPersistence;
        current = next;
        return state(next);
      }
    });
    const coordinator = new VoiceProfilePreferenceCoordinator(options);

    const remove = coordinator.update(preferences(["netflix"]));
    const reAdd = coordinator.update(preferences(["netflix", "youtube"]));
    await Promise.resolve();
    expect(updates).toEqual([["netflix"]]);

    releaseFirst();
    await Promise.all([remove, reAdd]);
    expect(updates).toEqual([["netflix"], ["netflix", "youtube"]]);
  });

  it("does not commit removed authority when the active view cannot close", async () => {
    const options = coordinatorOptions({
      closeActiveService: vi.fn(async () => undefined),
      getActiveServiceId: () => "youtube"
    });
    const coordinator = new VoiceProfilePreferenceCoordinator(options);

    await expect(coordinator.update(preferences(["netflix"]))).rejects.toThrow(
      "could not be closed safely"
    );
    expect(options.updatePreferences).not.toHaveBeenCalled();
    expect(options.setAuthorityUpdateInProgress).toHaveBeenLastCalledWith(false);
  });
});
