import { describe, expect, it, vi } from "vitest";
import type {
  DevicePreferences,
  LocalAppState,
  ProfilePreferences
} from "../src/main/contracts";
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

function devicePreferences(
  overrides: Partial<DevicePreferences> = {}
): DevicePreferences {
  return {
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
    youtubeTvScale: "standard",
    ...overrides
  };
}

function state(
  value: ProfilePreferences,
  device = devicePreferences()
): LocalAppState {
  return {
    activeProfileId: "default",
    customServices: [],
    devicePreferences: device,
    preferences: value,
    profiles: [{ id: "default", name: "Living Room" }],
    recentServiceIds: []
  };
}

function coordinatorOptions(overrides: Partial<VoiceProfilePreferenceCoordinatorOptions> = {}) {
  let current = preferences(["netflix", "youtube"]);
  let currentDevice = devicePreferences();
  const options: VoiceProfilePreferenceCoordinatorOptions = {
    beginServiceBarrier: vi.fn(() => ({ generation: 2 })),
    cancelConfirmations: vi.fn(async () => undefined),
    cancelDiscovery: vi.fn(),
    cancelPendingCapture: vi.fn(async () => undefined),
    cancelVoice: vi.fn(),
    closeActiveService: vi.fn(async () => undefined),
    getActiveServiceId: vi.fn(() => null),
    getCurrentDevicePreferences: vi.fn(() => currentDevice),
    getCurrentPreferences: vi.fn(() => current),
    previewDevicePreferencePatch: vi.fn((value) => ({
      ...currentDevice,
      ...(value as Partial<DevicePreferences>)
    })),
    previewPreferences: vi.fn((value) => value as ProfilePreferences),
    resumeVoiceAuthority: vi.fn(),
    setAuthorityUpdateInProgress: vi.fn(),
    suspendVoiceAuthority: vi.fn(() => ({ generation: 1 })),
    updateDevicePreferences: vi.fn(async (next) => {
      currentDevice = next;
      return state(current, next);
    }),
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
      cancelPendingCapture: async () => {
        events.push("cancel-capture");
      },
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
      "cancel-capture",
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
    expect(options.cancelPendingCapture).not.toHaveBeenCalled();
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
      cancelPendingCapture: async () => {
        events.push("cancel-capture");
      },
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
      "cancel-capture",
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

  it("coordinates non-profile authority reductions through the same barrier", async () => {
    const events: string[] = [];
    const options = coordinatorOptions({
      beginServiceBarrier: () => {
        events.push("barrier");
        return { generation: events.length };
      },
      cancelConfirmations: async () => {
        events.push("cancel-confirmations");
      },
      cancelDiscovery: () => events.push("cancel-discovery"),
      cancelPendingCapture: async () => {
        events.push("cancel-capture");
      },
      cancelVoice: () => events.push("cancel-voice"),
      resumeVoiceAuthority: () => events.push("resume"),
      setAuthorityUpdateInProgress: (active) => events.push(active ? "lock" : "unlock"),
      suspendVoiceAuthority: () => {
        events.push("suspend");
        return { generation: 3 };
      }
    });
    const coordinator = new VoiceProfilePreferenceCoordinator(options);

    await expect(coordinator.coordinateAuthorityChange(
      () => true,
      async () => {
        events.push("commit");
        return "done";
      }
    )).resolves.toBe("done");

    expect(events).toEqual([
      "lock",
      "suspend",
      "cancel-capture",
      "barrier",
      "cancel-discovery",
      "cancel-voice",
      "cancel-confirmations",
      "barrier",
      "commit",
      "resume",
      "unlock"
    ]);
  });

  it("merges queued device patches against the latest committed voice state", async () => {
    let currentDevice = devicePreferences({ voiceControlEnabled: true });
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstPersistence = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    let updateCount = 0;
    const options = coordinatorOptions({
      getCurrentDevicePreferences: () => currentDevice,
      previewDevicePreferencePatch: (value) => ({
        ...currentDevice,
        ...(value as Partial<DevicePreferences>)
      }),
      updateDevicePreferences: async (next) => {
        updateCount += 1;
        currentDevice = next;
        if (updateCount === 1) {
          markFirstStarted();
          await firstPersistence;
        }
        return state(preferences(["netflix", "youtube"]), currentDevice);
      }
    });
    const coordinator = new VoiceProfilePreferenceCoordinator(options);

    const disable = coordinator.updateDevicePreferences({ voiceControlEnabled: false });
    await firstStarted;
    const unrelated = coordinator.updateDevicePreferences({ reducedMotion: true });
    releaseFirst();
    await Promise.all([disable, unrelated]);

    expect(currentDevice.voiceControlEnabled).toBe(false);
    expect(currentDevice.reducedMotion).toBe(true);
    expect(options.suspendVoiceAuthority).toHaveBeenCalledTimes(1);
    expect(options.cancelPendingCapture).toHaveBeenCalledTimes(1);
    expect(options.cancelVoice).toHaveBeenCalledTimes(1);
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
