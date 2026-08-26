import { afterEach, describe, expect, it } from "vitest";
import {
  getServiceDefinition,
  getServiceDefinitions,
  getServiceSummaries,
  setCustomServiceManifests
} from "../src/main/service-registry";

afterEach(() => setCustomServiceManifests([]));

describe("service registry", () => {
  it("returns configured services by stable id", () => {
    expect(getServiceDefinition("shaka-demo")?.name).toBe("Shaka Player DRM Demo");
    expect(getServiceDefinition("netflix")?.name).toBe("Netflix");
    expect(getServiceDefinition("youtube")?.name).toBe("YouTube");
    expect(getServiceDefinition("disney-plus")?.name).toBe("Disney+");
    expect(getServiceDefinition("prime-video")?.name).toBe("Prime Video");
    expect(getServiceDefinition("hulu")?.name).toBe("Hulu");
    expect(getServiceDefinition("hbo-max")?.name).toBe("HBO Max");
    expect(getServiceDefinition("peacock")?.name).toBe("Peacock");
    expect(getServiceDefinition("paramount-plus")?.name).toBe("Paramount+");
    expect(getServiceDefinition("apple-tv")?.name).toBe("Apple TV");
    expect(getServiceDefinition("plex")?.name).toBe("Plex");
    expect(getServiceDefinition("twitch")?.name).toBe("Twitch");
    expect(getServiceDefinition("missing")).toBeNull();
  });

  it("keeps unqualified catalog additions experimental and capability-free", () => {
    const experimental = getServiceDefinitions().filter(
      (service) => service.kind === "experimental"
    );

    expect(experimental.map((service) => service.id)).toEqual([
      "prime-video",
      "hulu",
      "hbo-max",
      "peacock",
      "paramount-plus",
      "apple-tv",
      "plex",
      "twitch"
    ]);
    expect(experimental.every((service) => service.playback === null)).toBe(true);
    expect(experimental.every((service) => service.search === null)).toBe(true);
    expect(experimental.every((service) => service.fullscreenOrigins.length === 0)).toBe(true);
    expect(experimental.every((service) => service.authenticationNote?.includes("Experimental"))).toBe(true);
  });

  it("uses a unique persistent partition for every service", () => {
    const partitions = getServiceDefinitions().map((service) => service.partition);

    expect(new Set(partitions).size).toBe(partitions.length);
    expect(partitions.every((partition) => partition.startsWith("persist:service-"))).toBe(true);
  });

  it("restricts DRM permission more narrowly than authentication navigation", () => {
    const youtube = getServiceDefinition("youtube");

    expect(youtube?.allowedOrigins).toContain("https://accounts.google.com");
    expect(youtube?.allowedOrigins).toContain("https://accounts.youtube.com");
    expect(youtube?.mediaKeySystemOrigins).toEqual(["https://www.youtube.com"]);
    expect(youtube?.fullscreenOrigins).toEqual(["https://www.youtube.com"]);
    expect(youtube?.remoteTextEntrySelectors).toEqual([
      'textarea[name="search_query"]',
      "ytd-searchbox input#search",
      "input#search",
      'input[name="search_query"]'
    ]);
    expect(youtube?.remoteTextEntryTriggerSelectors).toContain(
      'button#search-icon-legacy'
    );
    expect(getServiceDefinition("netflix")?.remoteTextEntrySelectors).toEqual([
      'input[data-uia="search-box-input"]',
      'input[data-uia*="search"][data-uia*="input"]',
      'input[name="search"]',
      'input[type="search"]',
      'input[aria-label*="search" i]',
      'input[placeholder*="search" i]'
    ]);
    expect(getServiceDefinition("netflix")?.remoteTextEntryTriggerSelectors).toEqual([
      '[data-uia="search-box-launcher"]',
      'button[aria-label="Search"]'
    ]);
  });

  it("surfaces Google sign-in recovery without exposing service URLs", () => {
    const youtube = getServiceSummaries().find((service) => service.id === "youtube");

    expect(youtube?.authenticationNote).toContain("feasibility-only");
    expect(youtube?.authenticationNote).toContain("TV activation");
    expect(youtube).not.toHaveProperty("startUrl");
    expect(youtube).not.toHaveProperty("allowedOrigins");
  });

  it("builds custom services with an exact same-origin boundary", () => {
    setCustomServiceManifests([{
      id: "custom-11111111-1111-4111-8111-111111111111",
      name: "Example TV",
      startUrl: "https://watch.example.test/home"
    }]);

    const custom = getServiceDefinition("custom-11111111-1111-4111-8111-111111111111");
    expect(custom).toMatchObject({
      allowedOrigins: ["https://watch.example.test"],
      artworkHosts: [],
      fullscreenOrigins: [],
      kind: "custom",
      playback: null,
      remoteTextEntrySelectors: [],
      remoteTextEntryTriggerSelectors: [],
      search: null,
      startUrl: "https://watch.example.test/home"
    });
    expect(custom?.partition).toBe("persist:service-custom-11111111-1111-4111-8111-111111111111");
  });
});
