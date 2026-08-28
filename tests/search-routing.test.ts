import { describe, expect, it } from "vitest";
import { resolveRemoteSearchDestination } from "../src/main/search-routing";

describe("remote search routing", () => {
  it("sends a query directly into an active Netflix session", () => {
    expect(resolveRemoteSearchDestination("netflix", "  better   call saul ")).toEqual({
      kind: "active-service",
      query: "better call saul",
      serviceId: "netflix",
      url: "https://www.netflix.com/search?q=better+call+saul"
    });
  });

  it("sends a query directly into active YouTube search", () => {
    expect(resolveRemoteSearchDestination("youtube", "lofi & jazz")).toEqual({
      kind: "active-service",
      query: "lofi & jazz",
      serviceId: "youtube",
      url: "https://www.youtube.com/results?search_query=lofi+%26+jazz"
    });
  });

  it("opens a browse-only search route for an active service", () => {
    expect(resolveRemoteSearchDestination("disney-plus", "star wars")).toEqual({
      kind: "active-service",
      query: "star wars",
      serviceId: "disney-plus",
      url: "https://www.disneyplus.com/search"
    });
  });

  it("encodes Spotify queries into its allowlisted search path", () => {
    expect(resolveRemoteSearchDestination("spotify", "lofi & jazz")).toEqual({
      kind: "active-service",
      query: "lofi & jazz",
      serviceId: "spotify",
      url: "https://open.spotify.com/search/lofi%20%26%20jazz"
    });
  });

  it("falls back to the shell for no service or a service without search", () => {
    expect(resolveRemoteSearchDestination(null, "severance")).toEqual({
      kind: "shell",
      query: "severance"
    });
    expect(resolveRemoteSearchDestination("shaka-demo", "demo")).toEqual({
      kind: "shell",
      query: "demo"
    });
    expect(resolveRemoteSearchDestination("netflix", " ")).toBeNull();
  });
});
