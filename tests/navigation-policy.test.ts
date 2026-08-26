import { describe, expect, it } from "vitest";
import {
  assertValidServiceDefinition,
  isAllowedServiceUrl,
  isExpectedAllowedNavigationAbort,
  normalizeOrigin,
  originForDiagnostics
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

  it("reduces blocked URLs to privacy-safe origins for diagnostics", () => {
    expect(originForDiagnostics("https://accounts.example.com/path?code=secret")).toBe(
      "https://accounts.example.com"
    );
    expect(originForDiagnostics("not a url")).toBe("invalid-url");
  });

  it("accepts only expected aborts that continue on an allowed origin", () => {
    const abort = new Error("ERR_ABORTED (-3) loading 'https://example.com/next'");
    const allowed = ["https://example.com"];

    expect(isExpectedAllowedNavigationAbort(abort, "https://example.com/next", allowed)).toBe(true);
    expect(isExpectedAllowedNavigationAbort(abort, "https://evil.test/next", allowed)).toBe(false);
    expect(isExpectedAllowedNavigationAbort(new Error("ERR_FAILED (-2)"), "https://example.com", allowed)).toBe(false);
  });

  it("rejects invalid service definitions", () => {
    expect(() =>
      assertValidServiceDefinition({
        allowedOrigins: ["https://example.com"],
        id: "Example Service",
        kind: "test",
        mediaKeySystemOrigins: ["https://example.com"],
        name: "Example",
        partition: "persist:service-example",
        startUrl: "https://example.com"
      })
    ).toThrow(/Invalid service id/);

    expect(() =>
      assertValidServiceDefinition({
        allowedOrigins: ["https://example.com"],
        id: "example",
        kind: "test",
        mediaKeySystemOrigins: ["https://example.com"],
        name: "Example",
        partition: "default",
        startUrl: "https://example.com"
      })
    ).toThrow(/persistent and isolated/);
  });

  it("limits media-key-system permission to declared navigation origins", () => {
    expect(() =>
      assertValidServiceDefinition({
        allowedOrigins: ["https://example.com"],
        id: "example",
        kind: "commercial",
        mediaKeySystemOrigins: ["https://login.example.com"],
        name: "Example",
        partition: "persist:service-example",
        startUrl: "https://example.com"
      })
    ).toThrow(/media-key-system origins/);
  });
});
