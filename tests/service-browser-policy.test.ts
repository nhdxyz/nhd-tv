import { describe, expect, it } from "vitest";
import {
  serviceUserAgent,
  serviceWindowDisposition
} from "../src/main/service-browser-policy";
import { getServiceDefinition } from "../src/main/service-registry";

describe("service browser policy", () => {
  it("keeps Spotify-owned popup navigation in the persistent player view", () => {
    const spotify = getServiceDefinition("spotify");
    expect(spotify).not.toBeNull();
    if (spotify === null) return;

    expect(serviceWindowDisposition(
      spotify,
      "https://open.spotify.com/playlist/example"
    )).toBe("current-view");
    expect(serviceWindowDisposition(
      spotify,
      "https://accounts.spotify.com/en/login"
    )).toBe("current-view");
    expect(serviceWindowDisposition(
      spotify,
      "https://spotify.com.evil.test/playlist/example"
    )).toBe("deny");
  });

  it("preserves controlled popup windows for other allowed providers", () => {
    const youtube = getServiceDefinition("youtube");
    expect(youtube).not.toBeNull();
    if (youtube === null) return;

    expect(serviceWindowDisposition(
      youtube,
      "https://accounts.google.com/v3/signin"
    )).toBe("popup");
  });

  it("presents Spotify as a supported Chromium browser without changing other services", () => {
    const spotify = getServiceDefinition("spotify");
    const youtube = getServiceDefinition("youtube");
    expect(spotify).not.toBeNull();
    expect(youtube).not.toBeNull();
    if (spotify === null || youtube === null) return;

    const electronUserAgent =
      "Mozilla/5.0 AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36 Electron/43.2.0";
    expect(serviceUserAgent(spotify, electronUserAgent)).toBe(
      "Mozilla/5.0 AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36"
    );
    expect(serviceUserAgent(youtube, electronUserAgent)).toBe(electronUserAgent);
  });
});
