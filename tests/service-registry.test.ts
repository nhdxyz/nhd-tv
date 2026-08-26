import { describe, expect, it } from "vitest";
import {
  getServiceDefinition,
  getServiceDefinitions,
  getServiceSummaries
} from "../src/main/service-registry";

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
    expect(youtube?.mediaKeySystemOrigins).toEqual(["https://www.youtube.com"]);
  });

  it("surfaces Google sign-in recovery without exposing service URLs", () => {
    const youtube = getServiceSummaries().find((service) => service.id === "youtube");

    expect(youtube?.authenticationNote).toContain("Try another way");
    expect(youtube?.authenticationNote).toContain("Enter your password");
    expect(youtube).not.toHaveProperty("startUrl");
    expect(youtube).not.toHaveProperty("allowedOrigins");
  });
});
