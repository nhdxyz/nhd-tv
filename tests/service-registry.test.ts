import { describe, expect, it } from "vitest";
import { getServiceDefinition, getServiceDefinitions } from "../src/main/service-registry";

describe("service registry", () => {
  it("returns configured services by stable id", () => {
    expect(getServiceDefinition("shaka-demo")?.name).toBe("Shaka Player DRM Demo");
    expect(getServiceDefinition("missing")).toBeNull();
  });

  it("uses a unique persistent partition for every service", () => {
    const partitions = getServiceDefinitions().map((service) => service.partition);

    expect(new Set(partitions).size).toBe(partitions.length);
    expect(partitions.every((partition) => partition.startsWith("persist:service-"))).toBe(true);
  });
});
