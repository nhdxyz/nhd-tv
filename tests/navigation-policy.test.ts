import { describe, expect, it } from "vitest";
import {
  assertValidServiceDefinition,
  buildServiceSearchUrl,
  isAllowedArtworkUrl,
  isAllowedServiceUrl,
  isExpectedAllowedNavigationAbort,
  isServiceRootUrl,
  isPlaybackUrl,
  normalizeOrigin,
  normalizeSearchQuery,
  originForDiagnostics,
  sanitizePlaybackUrl,
  type ServiceDefinition
} from "../src/main/security/navigation-policy";

const validDefinition: ServiceDefinition = {
  allowedOrigins: ["https://example.com"],
  artworkHosts: ["images.example.com"],
  id: "example",
  kind: "test",
  mediaKeySystemOrigins: ["https://example.com"],
  name: "Example",
  partition: "persist:service-example",
  playback: {
    pathPrefixes: ["/watch/"],
    queryParameters: ["id"]
  },
  rootUrls: ["https://example.com"],
  search: {
    baseUrl: "https://example.com/search",
    queryParameter: "q"
  },
  spatialNavigation: "native",
  startUrl: "https://example.com"
};

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

  it("allows only HTTPS artwork on an exact host or subdomain", () => {
    const hosts = ["images.example.com"];

    expect(isAllowedArtworkUrl("https://images.example.com/poster.jpg", hosts)).toBe(true);
    expect(isAllowedArtworkUrl("https://cdn.images.example.com/poster.jpg", hosts)).toBe(true);
    expect(isAllowedArtworkUrl("https://images.example.com.evil.test/poster.jpg", hosts)).toBe(false);
    expect(isAllowedArtworkUrl("http://images.example.com/poster.jpg", hosts)).toBe(false);
  });

  it("recognizes and strips sensitive playback URL state", () => {
    const candidate = "https://example.com/watch/42?id=episode-2&token=secret#time";

    expect(isPlaybackUrl(candidate, validDefinition)).toBe(true);
    expect(sanitizePlaybackUrl(candidate, validDefinition)).toBe(
      "https://example.com/watch/42?id=episode-2"
    );
    expect(sanitizePlaybackUrl("https://example.com/browse", validDefinition)).toBeNull();
  });

  it("normalizes bounded search text and encodes it into declared service URLs", () => {
    expect(normalizeSearchQuery("  better   call saul  ")).toBe("better call saul");
    expect(normalizeSearchQuery(" ")).toBeNull();
    expect(normalizeSearchQuery("x".repeat(121))).toBeNull();
    expect(buildServiceSearchUrl(validDefinition, "A&B / test")).toBe(
      "https://example.com/search?q=A%26B+%2F+test"
    );

    expect(buildServiceSearchUrl({
      ...validDefinition,
      search: { baseUrl: "https://example.com/search", queryParameter: null }
    }, "show name")).toBe("https://example.com/search");
  });

  it("matches service roots without treating nested pages as roots", () => {
    const roots = ["https://example.com/browse"];

    expect(isServiceRootUrl("https://example.com/browse?source=tv#top", roots)).toBe(true);
    expect(isServiceRootUrl("https://example.com/browse/", roots)).toBe(true);
    expect(isServiceRootUrl("https://example.com/browse/genre/42", roots)).toBe(false);
    expect(isServiceRootUrl("https://evil.test/browse", roots)).toBe(false);
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
        ...validDefinition,
        id: "Example Service",
      })
    ).toThrow(/Invalid service id/);

    expect(() =>
      assertValidServiceDefinition({
        ...validDefinition,
        partition: "default",
      })
    ).toThrow(/persistent and isolated/);
  });

  it("limits media-key-system permission to declared navigation origins", () => {
    expect(() =>
      assertValidServiceDefinition({
        ...validDefinition,
        mediaKeySystemOrigins: ["https://login.example.com"],
      })
    ).toThrow(/media-key-system origins/);
  });
});
