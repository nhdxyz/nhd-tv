import { describe, expect, it, vi } from "vitest";
import { getServiceDefinition } from "../src/main/service-registry";
import {
  executeVoiceProviderDestination,
  type VoiceProviderDestinationExecutionHost,
  type VoiceProviderDestinationPlan
} from "../src/main/voice/voice-provider-destination-executor";

const operationToken = Object.freeze({ generation: 7 });

function plan(
  overrides: Partial<VoiceProviderDestinationPlan> = {}
): VoiceProviderDestinationPlan {
  return {
    destination: "library",
    kind: "open-provider-destination",
    serviceId: "youtube",
    serviceName: "YouTube",
    ...overrides
  };
}

function host(overrides: Partial<VoiceProviderDestinationExecutionHost> = {}) {
  const providerHost = {
    activeServiceId: null,
    activeUrl: null,
    isBackgrounded: false,
    navigate: vi.fn(async (url: string) => {
      providerHost.activeUrl = url;
    }),
    restoreFromHome: vi.fn(() => true),
    ...overrides
  };
  return providerHost satisfies VoiceProviderDestinationExecutionHost;
}

function options(
  providerHost: VoiceProviderDestinationExecutionHost | null,
  overrides: Partial<Parameters<typeof executeVoiceProviderDestination>[1]> = {}
) {
  return {
    enabledServiceIds: ["spotify", "youtube"],
    getServiceDefinition,
    host: providerHost,
    openService: vi.fn(async (definition, initialUrl) => {
      if (providerHost !== null) {
        providerHost.activeServiceId = definition.id;
        providerHost.activeUrl = initialUrl;
      }
    }),
    operationToken,
    ...overrides
  };
}

describe("voice provider destination execution", () => {
  it("opens an inactive provider at the compiled-in route", async () => {
    const providerHost = host({ activeServiceId: "netflix" });
    const onProgress = vi.fn();
    const execution = options(providerHost, { onProgress });

    await expect(executeVoiceProviderDestination(plan({
      destination: "subscriptions"
    }), execution)).resolves.toEqual({
      detail: "Opened your subscriptions on YouTube.",
      handled: true
    });
    expect(execution.openService).toHaveBeenCalledWith(
      getServiceDefinition("youtube"),
      "https://www.youtube.com/feed/subscriptions",
      undefined,
      operationToken
    );
    expect(providerHost.navigate).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith("Opening YouTube subscriptions…");
  });

  it("does not claim an exact destination after a provider-owned redirect", async () => {
    const providerHost = host({ activeServiceId: "youtube" });
    const execution = options(providerHost, {
      openService: vi.fn(async () => undefined)
    });
    providerHost.navigate = vi.fn(async () => {
      providerHost.activeUrl = "https://accounts.google.com/login";
    });

    await expect(executeVoiceProviderDestination(plan(), execution)).resolves.toEqual({
      detail: "YouTube opened, but I couldn't verify the library destination.",
      handled: false
    });
    expect(execution.openService).not.toHaveBeenCalled();
  });

  it("requires an inactive open to finish on both the requested provider and route", async () => {
    const providerHost = host({ activeServiceId: "netflix" });
    const wrongRoute = options(providerHost, {
      openService: vi.fn(async () => {
        providerHost.activeServiceId = "youtube";
        providerHost.activeUrl = "https://www.youtube.com/";
      })
    });
    await expect(executeVoiceProviderDestination(plan(), wrongRoute)).resolves.toEqual({
      detail: "YouTube opened, but I couldn't verify the library destination.",
      handled: false
    });

    providerHost.activeServiceId = "netflix";
    providerHost.activeUrl = "https://www.netflix.com/browse";
    const wrongProvider = options(providerHost, {
      openService: vi.fn(async () => {
        providerHost.activeServiceId = "netflix";
        providerHost.activeUrl = "https://www.youtube.com/feed/you";
      })
    });
    await expect(executeVoiceProviderDestination(plan(), wrongProvider)).resolves.toEqual({
      detail: "YouTube opened, but I couldn't verify the library destination.",
      handled: false
    });
  });

  it("navigates an active provider in place with the same signal and operation", async () => {
    const providerHost = host({ activeServiceId: "youtube" });
    const controller = new AbortController();
    const execution = options(providerHost, { signal: controller.signal });

    await executeVoiceProviderDestination(plan(), execution);

    expect(providerHost.navigate).toHaveBeenCalledWith(
      "https://www.youtube.com/feed/you",
      controller.signal,
      operationToken
    );
    expect(execution.openService).not.toHaveBeenCalled();
  });

  it("restores background Spotify before navigating its persistent player", async () => {
    const providerHost = host({
      activeServiceId: "spotify",
      isBackgrounded: true
    });
    const execution = options(providerHost);

    await executeVoiceProviderDestination(plan({
      serviceId: "spotify",
      serviceName: "Spotify"
    }), execution);

    expect(providerHost.restoreFromHome).toHaveBeenCalledOnce();
    expect(providerHost.navigate).toHaveBeenCalledWith(
      "https://open.spotify.com/collection/playlists",
      undefined,
      operationToken
    );
    expect(vi.mocked(providerHost.restoreFromHome).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(providerHost.navigate).mock.invocationCallOrder[0] ?? 0);
    expect(execution.openService).not.toHaveBeenCalled();
  });

  it("fails honestly when background restoration does not own a usable view", async () => {
    const providerHost = host({
      activeServiceId: "spotify",
      isBackgrounded: true,
      restoreFromHome: vi.fn(() => false)
    });
    const execution = options(providerHost);

    await expect(executeVoiceProviderDestination(plan({
      serviceId: "spotify",
      serviceName: "Spotify"
    }), execution)).resolves.toEqual({
      detail: "Spotify could not be restored from the background.",
      handled: false
    });
    expect(providerHost.navigate).not.toHaveBeenCalled();
    expect(execution.openService).not.toHaveBeenCalled();
  });

  it("revalidates enabled services and fixed-route support immediately before execution", async () => {
    const providerHost = host();
    const disabled = options(providerHost, { enabledServiceIds: ["netflix"] });
    await expect(executeVoiceProviderDestination(plan(), disabled)).resolves.toEqual({
      detail: "YouTube is not enabled in this profile.",
      handled: false
    });
    expect(disabled.openService).not.toHaveBeenCalled();

    const unsupported = options(providerHost);
    await expect(executeVoiceProviderDestination(plan({
      destination: "subscriptions",
      serviceId: "spotify",
      serviceName: "Spotify"
    }), unsupported)).resolves.toEqual({
      detail: "Spotify cannot open that destination safely.",
      handled: false
    });
    expect(unsupported.openService).not.toHaveBeenCalled();
  });

  it("rejects a fixed route outside the current provider definition boundary", async () => {
    const providerHost = host();
    const youtube = getServiceDefinition("youtube");
    if (youtube === null) throw new Error("YouTube test definition is missing.");
    const execution = options(providerHost, {
      getServiceDefinition: () => ({
        ...youtube,
        allowedOrigins: ["https://example.test"],
        allowedSubdomainHosts: []
      })
    });

    await expect(executeVoiceProviderDestination(plan(), execution)).resolves.toEqual({
      detail: "YouTube cannot open that destination safely.",
      handled: false
    });
    expect(execution.openService).not.toHaveBeenCalled();
  });

  it("honors cancellation before making any navigation change", async () => {
    const controller = new AbortController();
    controller.abort();
    const providerHost = host({ activeServiceId: "youtube" });
    const execution = options(providerHost, { signal: controller.signal });

    await expect(executeVoiceProviderDestination(plan(), execution)).rejects.toMatchObject({
      name: "AbortError"
    });
    expect(providerHost.navigate).not.toHaveBeenCalled();
    expect(execution.openService).not.toHaveBeenCalled();
  });
});
