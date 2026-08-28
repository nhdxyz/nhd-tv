import { describe, expect, it } from "vitest";
import {
  persistentSpotifyCookieDetails,
  shouldPersistSpotifySessionCookie
} from "../src/main/service-session-persistence";

describe("Spotify service session persistence", () => {
  it("turns a secure Spotify session cookie into a short-lived persistent cookie", () => {
    const details = persistentSpotifyCookieDetails({
      domain: ".spotify.com",
      hostOnly: false,
      httpOnly: true,
      name: "sp_session",
      path: "/",
      sameSite: "lax",
      secure: true,
      session: true,
      value: "private-value"
    }, 1_000);

    expect(details).toEqual({
      domain: ".spotify.com",
      expirationDate: 2_593_000,
      httpOnly: true,
      name: "sp_session",
      path: "/",
      sameSite: "lax",
      secure: true,
      url: "https://spotify.com/",
      value: "private-value"
    });
  });

  it("preserves host-only scope when making an account cookie persistent", () => {
    const details = persistentSpotifyCookieDetails({
      domain: "accounts.spotify.com",
      hostOnly: true,
      name: "account_session",
      path: "/en",
      sameSite: "strict",
      secure: true,
      session: true,
      value: "private-value"
    }, 2_000);

    expect(details?.url).toBe("https://accounts.spotify.com/en");
    expect(details).not.toHaveProperty("domain");
  });

  it("does not persist transient security cookies or cookies outside Spotify", () => {
    expect(shouldPersistSpotifySessionCookie({
      domain: "accounts.spotify.com",
      name: "__Host-sp_csrf_sid",
      secure: true,
      session: true
    })).toBe(false);
    expect(shouldPersistSpotifySessionCookie({
      domain: "spotify.com.evil.test",
      name: "sp_session",
      secure: true,
      session: true
    })).toBe(false);
    expect(shouldPersistSpotifySessionCookie({
      domain: ".spotify.com",
      name: "sp_session",
      secure: false,
      session: true
    })).toBe(false);
    expect(shouldPersistSpotifySessionCookie({
      domain: ".spotify.com",
      name: "sp_session",
      secure: true,
      session: false
    })).toBe(false);
  });
});
