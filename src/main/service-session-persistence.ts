import type { Cookie, CookiesSetDetails } from "electron";

const SPOTIFY_COOKIE_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
const TRANSIENT_COOKIE_NAME = /(?:captcha|challenge|csrf|flow|nonce|oauth|pkce|state)/i;

function normalizedSpotifyHost(cookie: Pick<Cookie, "domain">): string | null {
  const host = cookie.domain?.replace(/^\./, "").toLocaleLowerCase() ?? "";
  return host === "spotify.com" || host.endsWith(".spotify.com") ? host : null;
}

export function shouldPersistSpotifySessionCookie(
  cookie: Pick<Cookie, "domain" | "name" | "secure" | "session">
): boolean {
  return (
    cookie.session === true &&
    cookie.secure === true &&
    normalizedSpotifyHost(cookie) !== null &&
    !TRANSIENT_COOKIE_NAME.test(cookie.name)
  );
}

export function persistentSpotifyCookieDetails(
  cookie: Cookie,
  nowSeconds = Date.now() / 1_000
): CookiesSetDetails | null {
  const host = normalizedSpotifyHost(cookie);
  if (host === null || !shouldPersistSpotifySessionCookie(cookie)) return null;

  const path = cookie.path?.startsWith("/") ? cookie.path : "/";
  return {
    url: `https://${host}${path}`,
    name: cookie.name,
    value: cookie.value,
    ...(cookie.hostOnly === true ? {} : { domain: cookie.domain }),
    path,
    secure: true,
    httpOnly: cookie.httpOnly,
    expirationDate: Math.floor(nowSeconds) + SPOTIFY_COOKIE_LIFETIME_SECONDS,
    sameSite: cookie.sameSite
  };
}
