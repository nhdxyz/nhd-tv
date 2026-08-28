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
    cancelConfirmations: vi.fn(async () => undefined),
    cancelDiscovery: vi.fn(),
    cancelVoice: vi.fn(),
    closeActiveService: vi.fn(async () => undefined),
    getActiveServiceId: vi.fn(() => null),
    getCurrentPreferences: vi.fn(() => current),
    previewPreferences: vi.fn((value) => value as ProfilePreferences),
    resumeVoiceAuthority: vi.fn(),
    setAuthorityUpdateInProgress: vi.fn(),
    suspendVoiceAuthority: vi.fn(() => ({ generation: 1 })),
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
      cancelConfirmations: async () => {
        events.push("cancel-confirmations");
      },
      cancelVoice: () => events.push("cancel-voice"),
      closeActiveService: async () => {
        events.push("close");
        activeServiceId = null;
      },
      getActiveServiceId: () => activeServiceId,
      resumeVoiceAuthority: () => events.push("resume"),
      setAuthorityUpdateInProgress: (inProgress) => events.push(inProgress ? "lock" : "unlock"),
      suspendVoiceAuthority: () => {
        events.push("suspend");
        return { generation: 8 };
      },
      updatePreferences: async (next) => {
        events.push("update");
        return state(next);
      }
    });
    const coordinator = new VoiceProfilePreferenceCoordinator(options);

    await coordinator.update(preferences(["netflix"]));

    expect(events).toEqual([
      "lock",
      "suspend",
      "barrier",
      "cancel-discovery",
      "cancel-voice",
      "cancel-confirmations",
      "close",
      "barrier",
      "update",
      "resume",
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
    expect(options.cancelConfirmations).not.toHaveBeenCalled();
    expect(options.cancelVoice).not.toHaveBeenCalled();
    expect(options.suspendVoiceAuthority).not.toHaveBeenCalled();
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
    let markFirstStarted!: () => void;
    const firstPersistence = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const updates: string[][] = [];
    const options = coordinatorOptions({
      getCurrentPreferences: () => current,
      updatePreferences: async (next) => {
        updates.push([...next.enabledServiceIds]);
        if (updates.length === 1) {
          markFirstStarted();
          await firstPersistence;
        }
        current = next;
        return state(next);
      }
    });
    const coordinator = new VoiceProfilePreferenceCoordinator(options);

    const remove = coordinator.update(preferences(["netflix"]));
    const reAdd = coordinator.update(preferences(["netflix", "youtube"]));
    await firstStarted;
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

  it("serializes a profile change through the same closed voice boundary", async () => {
    const events: string[] = [];
    let activeServiceId: string | null = "netflix";
    const options = coordinatorOptions({
      beginServiceBarrier: () => {
        events.push("barrier");
        return { generation: events.length };
      },
      cancelDiscovery: () => events.push("cancel-discovery"),
      cancelConfirmations: async () => {
        events.push("cancel-confirmations");
      },
      cancelVoice: () => events.push("cancel-voice"),
      closeActiveService: async () => {
        events.push("close");
        activeServiceId = null;
      },
      getActiveServiceId: () => activeServiceId,
      resumeVoiceAuthority: () => events.push("resume"),
      setAuthorityUpdateInProgress: () => undefined,
      suspendVoiceAuthority: () => {
        events.push("suspend");
        return { generation: 2 };
      }
    });
    const coordinator = new VoiceProfilePreferenceCoordinator(options);

    await coordinator.changeProfile(async () => {
      events.push("profile");
      return state(preferences(["youtube"]));
    });

    expect(events).toEqual([
      "suspend",
      "barrier",
      "cancel-discovery",
      "cancel-voice",
      "cancel-confirmations",
      "close",
      "barrier",
      "profile",
      "resume"
    ]);
  });

  it("rechecks a custom service after asynchronous partition cleanup", async () => {
    const events: string[] = [];
    let activeServiceId: string | null = null;
    const options = coordinatorOptions({
      beginServiceBarrier: () => {
        events.push("barrier");
        return { generation: events.length };
      },
      closeActiveService: async () => {
        events.push("close");
        activeServiceId = null;
      },
      getActiveServiceId: () => activeServiceId
    });
    const coordinator = new VoiceProfilePreferenceCoordinator(options);

    await coordinator.removeService(
      "custom-one",
      async () => {
        events.push("clear");
        activeServiceId = "custom-one";
      },
      async () => {
        events.push("remove");
        return state(preferences(["netflix", "youtube"]));
      }
    );

    expect(events).toEqual(["barrier", "clear", "barrier", "close", "remove"]);
  });
});
