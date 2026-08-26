import { describe, expect, it } from "vitest";
import { providerArtworkFallbackUrls } from "../src/main/provider-artwork";

describe("provider artwork fallbacks", () => {
  it("derives allowlisted YouTube thumbnails from a sanitized watch URL", () => {
    expect(providerArtworkFallbackUrls(
      "youtube",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    )).toEqual([
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    ]);
  });

  it("rejects other services, origins, routes, and malformed video ids", () => {
    expect(providerArtworkFallbackUrls(
      "netflix",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    )).toEqual([]);
    expect(providerArtworkFallbackUrls(
      "youtube",
      "https://example.com/watch?v=dQw4w9WgXcQ"
    )).toEqual([]);
    expect(providerArtworkFallbackUrls(
      "youtube",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ"
    )).toEqual([]);
    expect(providerArtworkFallbackUrls(
      "youtube",
      "https://www.youtube.com/watch?v=../../secret"
    )).toEqual([]);
  });
});
