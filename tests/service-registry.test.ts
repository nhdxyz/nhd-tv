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
    expect(getServiceDefinition("missing")).toBeNull();
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
      kind: "custom",
      playback: null,
      search: null,
      startUrl: "https://watch.example.test/home"
    });
    expect(custom?.partition).toBe("persist:service-custom-11111111-1111-4111-8111-111111111111");
  });
});
