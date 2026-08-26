import { describe, expect, it } from "vitest";
import {
  assertValidServiceDefinition,
  isAllowedServiceUrl,
  normalizeOrigin
} from "../src/main/security/navigation-policy";

describe("service navigation policy", () => {
  it("accepts only HTTPS origins", () => {
    expect(normalizeOrigin("https://example.com/path")).toBe("https://example.com");
    expect(normalizeOrigin("http://example.com")).toBeNull();
    expect(normalizeOrigin("not-a-url")).toBeNull();
  });

  it("matches exact allowed origins instead of hostname suffixes", () => {
    const allowed = ["https://example.com"];

    expect(isAllowedServiceUrl("https://example.com/watch/1", allowed)).toBe(true);
    expect(isAllowedServiceUrl("https://example.com.evil.test/watch/1", allowed)).toBe(false);
    expect(isAllowedServiceUrl("https://cdn.example.com/watch/1", allowed)).toBe(false);
  });

  it("rejects invalid service definitions", () => {
    expect(() =>
      assertValidServiceDefinition({
        allowedOrigins: ["https://example.com"],
        id: "Example Service",
        name: "Example",
        partition: "persist:service-example",
        startUrl: "https://example.com"
      })
    ).toThrow(/Invalid service id/);

    expect(() =>
      assertValidServiceDefinition({
        allowedOrigins: ["https://example.com"],
        id: "example",
        name: "Example",
        partition: "default",
        startUrl: "https://example.com"
      })
    ).toThrow(/persistent and isolated/);
  });
});
