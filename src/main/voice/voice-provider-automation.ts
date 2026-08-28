import type { VoiceMediaIntent } from "./voice-intent";

export type VoiceProviderAutomationState =
  | "age-gate-required"
  | "complete"
  | "consent-required"
  | "content-private"
  | "content-unavailable"
  | "fullscreen-requested"
  | "idle"
  | "navigated"
  | "play-clicked"
  | "playing"
  | "profile-required"
  | "profile-selected"
  | "sign-in-required";

export interface YouTubeVoiceNavigationResult {
  state: "navigated";
  youtubeContentId: string;
}

export interface YouTubeChannelNavigationResult {
  state: "channel-navigated";
  youtubeChannelIdentity: string;
  youtubeChannelPath: string;
}

export type VoiceProviderAutomationResult =
  | VoiceProviderAutomationState
  | YouTubeChannelNavigationResult
  | YouTubeVoiceNavigationResult;

export type VoiceProviderTerminalResult =
  | "age-gate-required"
  | "consent-required"
  | "content-private"
  | "content-unavailable"
  | "sign-in-required";

export type VoiceMediaExecutionResult =
  | VoiceProviderTerminalResult
  | "complete"
  | "failed"
  | "playing-windowed"
  | "profile-required";

const VOICE_PROVIDER_AUTOMATION_STATES: readonly VoiceProviderAutomationState[] = [
  "age-gate-required",
  "complete",
  "consent-required",
  "content-private",
  "content-unavailable",
  "fullscreen-requested",
  "idle",
  "navigated",
  "play-clicked",
  "playing",
  "profile-required",
  "profile-selected",
  "sign-in-required"
];
const VOICE_PROVIDER_TERMINAL_RESULTS: readonly VoiceProviderTerminalResult[] = [
  "age-gate-required",
  "consent-required",
  "content-private",
  "content-unavailable",
  "sign-in-required"
];
const YOUTUBE_CONTENT_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_CHANNEL_IDENTITY_PATTERN = /^[a-z0-9]{1,160}$/;
const YOUTUBE_CHANNEL_PATH_PATTERN =
  /^\/(?:@[A-Za-z0-9._%~-]{1,180}|channel\/[A-Za-z0-9_-]{1,128})\/?$/;

export function isVoiceProviderTerminalResult(
  value: unknown
): value is VoiceProviderTerminalResult {
  return typeof value === "string" &&
    VOICE_PROVIDER_TERMINAL_RESULTS.includes(value as VoiceProviderTerminalResult);
}

export function parseVoiceProviderAutomationResult(
  value: unknown
): VoiceProviderAutomationResult {
  if (
    typeof value === "string" &&
    VOICE_PROVIDER_AUTOMATION_STATES.includes(value as VoiceProviderAutomationState)
  ) {
    return value as VoiceProviderAutomationState;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "idle";
  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).length === 2 &&
    candidate.state === "navigated" &&
    typeof candidate.youtubeContentId === "string" &&
    YOUTUBE_CONTENT_ID_PATTERN.test(candidate.youtubeContentId)
  ) {
    return {
      state: "navigated",
      youtubeContentId: candidate.youtubeContentId
    };
  }
  if (
    Object.keys(candidate).length === 3 &&
    candidate.state === "channel-navigated" &&
    typeof candidate.youtubeChannelIdentity === "string" &&
    YOUTUBE_CHANNEL_IDENTITY_PATTERN.test(candidate.youtubeChannelIdentity) &&
    typeof candidate.youtubeChannelPath === "string" &&
    YOUTUBE_CHANNEL_PATH_PATTERN.test(candidate.youtubeChannelPath)
  ) {
    return {
      state: "channel-navigated",
      youtubeChannelIdentity: candidate.youtubeChannelIdentity,
      youtubeChannelPath: candidate.youtubeChannelPath.replace(/\/$/, "")
    };
  }
  return "idle";
}

export function voiceProviderCommandHandled(
  intent: VoiceMediaIntent,
  executionResult: VoiceMediaExecutionResult
): boolean {
  if (isVoiceProviderTerminalResult(executionResult)) return false;
  return intent.action !== "play" ||
    executionResult === "complete" ||
    executionResult === "playing-windowed";
}

export function voiceProviderTerminalDetail(
  executionResult: VoiceMediaExecutionResult,
  providerName: string,
  title: string
): string | null {
  switch (executionResult) {
    case "age-gate-required":
      return `Complete the age check on ${providerName}, then try again.`;
    case "consent-required":
      return `Finish the ${providerName} consent prompt on the TV, then try again.`;
    case "content-private":
      return `${title} is private on ${providerName}.`;
    case "content-unavailable":
      return `${title} is unavailable on ${providerName}.`;
    case "sign-in-required":
      return `Sign in to ${providerName} on the TV, then try again.`;
    default:
      return null;
  }
}

function providerTerminalPageDetectorScript(
  providerId: "netflix" | "spotify" | "youtube"
): string {
  return `
    const providerTerminalState = (() => {
      const providerId = ${JSON.stringify(providerId)};
      const hostname = normalize(location.hostname);
      const pathname = normalize(location.pathname);
      const pageText = normalize(document.body?.innerText);
      const visibleText = (selector) => [...document.querySelectorAll(selector)]
        .filter(visible)
        .map((element) => normalize([
          element.getAttribute("aria-label"),
          element.getAttribute("title"),
          element.textContent
        ].filter(Boolean).join(" ")))
        .join(" ");
      const includesAny = (value, phrases) => phrases.some((phrase) => value.includes(phrase));
      if (providerId === "youtube") {
        const consentText = visibleText(
          'form[action*="consent" i],[role="dialog"][aria-modal="true"],#consent-bump'
        );
        if (hostname === "consent.youtube.com" || pathname.startsWith("/consent") ||
          includesAny(consentText, ["before you continue to youtube", "accept all", "reject all"])) {
          return "consent-required";
        }
        const playerErrorText = visibleText(
          'ytd-player-error-message-renderer,.ytp-error,.ytp-error-content-wrap,'
          + '[class*="player-error-message"],[role="alert"]'
        );
        const playerTerminalText = pathname === "/watch" || pathname.startsWith("/shorts/")
          ? playerErrorText + " " + pageText
          : playerErrorText;
        if (includesAny(playerTerminalText, [
          "sign in to confirm your age", "age-restricted", "age restricted",
          "verify your age", "confirm your age"
        ])) return "age-gate-required";
        if (includesAny(playerTerminalText, ["private video", "this video is private"])) {
          return "content-private";
        }
        if (includesAny(playerTerminalText, [
          "video unavailable", "this video is unavailable", "this video isn't available",
          "this content isn't available", "this content is not available"
        ])) return "content-unavailable";
        const signInText = visibleText(
          'form[action*="signin" i],form[action*="login" i],#identifierId,'
          + 'input[type="email"],input[type="password"]'
        );
        if (hostname === "accounts.youtube.com" || pathname.startsWith("/signin") ||
          (signInText && includesAny(pageText, [
            "sign in to continue to youtube", "sign in to youtube"
          ]))) return "sign-in-required";
        return null;
      }
      if (providerId === "spotify") {
        const gateText = visibleText(
          '[role="dialog"][aria-modal="true"],[role="alert"],main form,main [data-testid*="error"]'
        );
        const spotifyContentText = [
          "/album/", "/artist/", "/episode/", "/playlist/", "/show/", "/track/"
        ].some((prefix) => pathname.startsWith(prefix))
          ? gateText + " " + pageText
          : gateText;
        if (pathname.startsWith("/authorize") || pathname.startsWith("/consent") ||
          includesAny(gateText, ["allow spotify to", "authorize spotify", "grant permission"])) {
          return "consent-required";
        }
        if (includesAny(spotifyContentText, [
          "verify your age", "confirm your age", "age-restricted", "age restricted"
        ])) return "age-gate-required";
        if (includesAny(spotifyContentText, [
          "this playlist is private", "this content is private"
        ])) {
          return "content-private";
        }
        if (includesAny(spotifyContentText, [
          "spotify can't play this right now", "spotify can’t play this right now",
          "this content is not available", "this content isn't available"
        ])) return "content-unavailable";
        const hasSignInForm = document.querySelector(
          'form[action*="login" i],input[type="email"],input[name="username"],input[type="password"]'
        ) !== null;
        if ((hostname === "accounts.spotify.com" && !pathname.startsWith("/authorize")) ||
          pathname.startsWith("/login") || (hasSignInForm && includesAny(pageText, [
            "log in to spotify", "sign in to spotify"
          ]))) return "sign-in-required";
        return null;
      }
      const gateText = visibleText(
        '[role="dialog"][aria-modal="true"],[role="alert"],main form,'
        + '[data-uia*="error"],[data-uia*="pin"],[data-uia*="consent"]'
      );
      const netflixContentText = ["/title/", "/watch/"].some((prefix) =>
        pathname.startsWith(prefix)
      ) ? gateText + " " + pageText : gateText;
      if (pathname.startsWith("/consent") || includesAny(gateText, [
        "privacy preferences", "review your privacy", "accept cookies to continue"
      ])) return "consent-required";
      if (includesAny(netflixContentText, [
        "enter your pin", "profile lock", "verify your age", "maturity pin"
      ])) return "age-gate-required";
      if (includesAny(netflixContentText, [
        "this title is private", "this content is private"
      ])) {
        return "content-private";
      }
      if (includesAny(netflixContentText, [
        "this title is not available", "this title isn't available",
        "this title isn’t available", "not available in your country",
        "we're having trouble with your request"
      ])) return "content-unavailable";
      const hasSignInForm = document.querySelector(
        'form[action*="login" i],[data-uia="login-form"],input[data-uia="login-field"],'
        + 'input[data-uia="password-field"]'
      ) !== null;
      if (pathname.startsWith("/login") || pathname.startsWith("/signin") ||
        (hasSignInForm && includesAny(pageText, ["sign in", "email or mobile number"]))) {
        return "sign-in-required";
      }
      return null;
    })();
    if (providerTerminalState !== null) return providerTerminalState;
  `;
}

function serializedIntent(intent: VoiceMediaIntent): string {
  return JSON.stringify({
    action: intent.action,
    creator: intent.creator,
    episode: intent.episode,
    mediaType: intent.mediaType,
    recency: intent.recency,
    season: intent.season,
    title: intent.title
  });
}

function serializedProfileHint(profileNameHint: string | null): string {
  return JSON.stringify(profileNameHint?.replace(/\s+/g, " ").trim().slice(0, 80) || null);
}

function serializedNetflixContentId(contentId: string | null): string {
  return JSON.stringify(
    typeof contentId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(contentId)
      ? contentId
      : null
  );
}

function serializedYouTubeContentId(contentId: string | null): string {
  return JSON.stringify(
    typeof contentId === "string" && YOUTUBE_CONTENT_ID_PATTERN.test(contentId)
      ? contentId
      : null
  );
}

export function netflixContentIdFromUrl(urlValue: string | null): string | null {
  if (urlValue === null) return null;
  try {
    const url = new URL(urlValue);
    if (url.protocol !== "https:" || !/(?:^|\.)netflix\.com$/i.test(url.hostname)) return null;
    return /^\/(?:title|watch)\/([A-Za-z0-9_-]{1,64})(?:\/|$)/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function youtubeContentIdFromUrl(urlValue: string | null): string | null {
  if (urlValue === null) return null;
  try {
    const url = new URL(urlValue);
    if (url.protocol !== "https:" || !/(?:^|\.)youtube\.com$/i.test(url.hostname)) return null;
    const contentId = /^\/watch\/?$/.test(url.pathname)
      ? url.searchParams.get("v")
      : /^\/shorts\/([A-Za-z0-9_-]{11})(?:\/|$)/.exec(url.pathname)?.[1] ?? null;
    return contentId !== null && YOUTUBE_CONTENT_ID_PATTERN.test(contentId)
      ? contentId
      : null;
  } catch {
    return null;
  }
}

export function buildSpotifyVoiceAutomationScript(
  intent: VoiceMediaIntent,
  playbackRequested = false
): string {
  return `(() => {
    const intent = ${serializedIntent(intent)};
    const playbackRequested = ${JSON.stringify(playbackRequested)};
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim().toLocaleLowerCase("en-US");
    const identity = (value) => normalize(value).replace(/[^a-z0-9]+/g, "");
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
        style.visibility !== "hidden" && Number(style.opacity || 1) > 0.05;
    };
    ${providerTerminalPageDetectorScript("spotify")}
    const titleIdentity = identity(intent.title);
    const creatorIdentity = identity(intent.creator);
    const routePrefix = intent.mediaType === "artist" ? "/artist/"
      : intent.mediaType === "album" ? "/album/"
        : intent.mediaType === "playlist" ? "/playlist/"
          : intent.mediaType === "song" ? "/track/" : "/";
    const links = (root, prefix) => [...root.querySelectorAll('a[href]')]
      .filter((anchor) => anchor.getAttribute("href")?.startsWith(prefix));
    const exactLink = (root, prefix, expected) => links(root, prefix)
      .find((anchor) => identity(anchor.textContent || anchor.getAttribute("aria-label")) === expected);
    const creatorMatches = (root) => !creatorIdentity || Boolean(exactLink(root, "/artist/", creatorIdentity));
    const candidateMatches = (root) => {
      if (intent.mediaType === "song") {
        return Boolean(exactLink(root, "/track/", titleIdentity)) && creatorMatches(root);
      }
      if (intent.mediaType === "artist") {
        return Boolean(exactLink(root, "/artist/", titleIdentity || creatorIdentity));
      }
      return Boolean(exactLink(root, routePrefix, titleIdentity)) && creatorMatches(root);
    };
    const controlLabel = (button) => normalize(
      button.getAttribute("aria-label") ?? button.getAttribute("title") ?? button.textContent
    );
    const playButton = (root) => [...root.querySelectorAll(
      '[data-testid="play-button"],button[aria-label^="Play " i],button[aria-label="Play" i],'
      + 'button[title^="Play " i],button[title="Play" i]'
    )].find((button) => visible(button) && !/^pause(?:\\s|$)/i.test(controlLabel(button)));
    const pauseButton = (root) => [...root.querySelectorAll(
      '[data-testid="play-button"],button[aria-label^="Pause" i],button[title^="Pause" i]'
    )].find((button) => visible(button) && /^pause(?:\\s|$)/i.test(controlLabel(button)));
    const artistActionButton = (root, expected, paused) => {
      const actionRoots = [...root.querySelectorAll(
        '[data-testid="action-bar"],[data-testid="action-bar-row"]'
      )].filter(visible);
      return actionRoots.flatMap((actionRoot) => [...actionRoot.querySelectorAll(
        '[data-testid="play-button"],button[aria-label],button[title]'
      )]).find((button) => {
        if (!visible(button)) return false;
        const label = controlLabel(button);
        if (paused) return /^pause(?:\\s|$)/i.test(label);
        if (!/^(?:play|shuffle)(?:\\s|$)/i.test(label) &&
          button.getAttribute("data-testid") !== "play-button") return false;
        const labelIdentity = identity(label.replace(/^(?:play|shuffle)\\s*/i, ""));
        return labelIdentity.length === 0 || labelIdentity === expected;
      });
    };
    const globalPauseButton = () => [...document.querySelectorAll(
      '[data-testid="control-button-playpause"],'
      + '[data-testid="now-playing-bar"] button[aria-label^="Pause"]'
    )].find((button) => visible(button) && /^pause(?:\\s|$)/i.test(
      button.getAttribute("aria-label") ?? button.textContent ?? ""
    ));
    const nowPlaying = document.querySelector(
      '[data-testid="now-playing-widget"],[data-testid="now-playing-bar"],[data-testid="now-playing-view"]'
    );
    const nowPlayingTrack = nowPlaying === null
      ? null
      : exactLink(nowPlaying, "/track/", titleIdentity);
    const nowPlayingCreatorMatches = nowPlaying !== null && (
      !creatorIdentity || Boolean(exactLink(nowPlaying, "/artist/", creatorIdentity))
    );
    const nowPlayingMatches = intent.mediaType === "song" &&
      nowPlayingTrack instanceof HTMLElement && nowPlayingCreatorMatches;
    if (intent.action === "play" && nowPlaying && nowPlayingMatches) {
      const pause = globalPauseButton();
      if (pause instanceof HTMLElement) return "complete";
    }
    const roots = [...document.querySelectorAll(
      '[data-testid="tracklist-row"],[data-testid="search-track-list"] [role="row"],'
      + '[role="row"][aria-rowindex],[data-testid="card-container"],[data-encore-id="card"]'
    )].filter((root) => visible(root) && candidateMatches(root));
    for (const root of roots) {
      const destination = exactLink(root, routePrefix,
        intent.mediaType === "artist" ? titleIdentity || creatorIdentity : titleIdentity);
      if (
        intent.mediaType === "artist" &&
        destination instanceof HTMLElement &&
        visible(destination)
      ) {
        destination.click();
        return "navigated";
      }
      if (intent.action === "play") {
        if (
          playbackRequested &&
          pauseButton(root) instanceof HTMLElement &&
          globalPauseButton() instanceof HTMLElement
        ) return "playing";
        const button = playButton(root);
        if (button instanceof HTMLElement) {
          button.click();
          return "play-clicked";
        }
      }
      if (destination instanceof HTMLElement && visible(destination)) {
        destination.click();
        return intent.mediaType === "artist" ? "navigated"
          : intent.action === "play" ? "navigated" : "complete";
      }
    }
    const exactEntityRoute = intent.mediaType === "artist"
      ? /^\\/artist\\/[A-Za-z0-9]+\\/?$/.test(location.pathname)
      : routePrefix !== "/" && location.pathname.startsWith(routePrefix);
    if (exactEntityRoute) {
      const requestedIdentity = intent.mediaType === "artist"
        ? titleIdentity || creatorIdentity
        : titleIdentity;
      const exactHeading = [...document.querySelectorAll(
        'h1,[data-testid="entityTitle"],[data-testid="context-item-info-title"]'
      )].find((heading) => visible(heading) && identity(heading.textContent) === requestedIdentity);
      const entityRoot = exactHeading?.closest(
        '[data-testid="album-page"],[data-testid="artist-page"],'
        + '[data-testid="playlist-page"],[data-testid="track-page"],main,[role="main"]'
      ) ?? null;
      if (exactHeading && entityRoot) {
        if (intent.action !== "play") return "complete";
        const profilePause = intent.mediaType === "artist"
          ? artistActionButton(entityRoot, requestedIdentity, true)
          : pauseButton(entityRoot);
        if (
          playbackRequested &&
          profilePause instanceof HTMLElement &&
          globalPauseButton() instanceof HTMLElement
        ) return "playing";
        const button = intent.mediaType === "artist"
          ? artistActionButton(entityRoot, requestedIdentity, false)
          : playButton(entityRoot);
        if (button instanceof HTMLElement) {
          button.click();
          return "play-clicked";
        }
      }
    }
    const direct = [...document.querySelectorAll('a[href]')].find((anchor) =>
      visible(anchor) && anchor.getAttribute("href")?.startsWith(routePrefix) &&
      identity(anchor.textContent || anchor.getAttribute("aria-label")) ===
        (intent.mediaType === "artist" ? titleIdentity || creatorIdentity : titleIdentity)
    );
    if (direct instanceof HTMLElement) {
      const root = direct.closest(
        '[data-testid="tracklist-row"],[role="row"],[data-testid="card-container"],[data-encore-id="card"]'
      ) ?? direct;
      if (creatorMatches(root)) {
        direct.click();
        return intent.mediaType === "artist" ? "navigated"
          : intent.action === "play" ? "navigated" : "complete";
      }
    }
    return "idle";
  })()`;
}

export function buildYouTubeVoiceAutomationScript(
  intent: VoiceMediaIntent,
  fullscreenRequested = false,
  expectedContentId: string | null = null,
  expectedChannelPath: string | null = null,
  expectedChannelIdentity: string | null = null
): string {
  return `(() => {
    const intent = ${serializedIntent(intent)};
    const fullscreenRequested = ${JSON.stringify(fullscreenRequested)};
    const expectedContentId = ${serializedYouTubeContentId(expectedContentId)};
    const expectedChannelPath = ${JSON.stringify(
      typeof expectedChannelPath === "string" && YOUTUBE_CHANNEL_PATH_PATTERN.test(expectedChannelPath)
        ? expectedChannelPath.replace(/\/$/, "")
        : null
    )};
    const expectedChannelIdentity = ${JSON.stringify(
      typeof expectedChannelIdentity === "string" &&
        YOUTUBE_CHANNEL_IDENTITY_PATTERN.test(expectedChannelIdentity)
        ? expectedChannelIdentity
        : null
    )};
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim().toLocaleLowerCase("en-US");
    const identity = (value) => normalize(value).replace(/[^a-z0-9]+/g, "");
    const contentIdFromUrl = (value) => {
      try {
        const url = new URL(value, location.href);
        if (url.origin !== location.origin) return null;
        const contentId = /^\\/watch\\/?$/.test(url.pathname)
          ? url.searchParams.get("v")
          : /^\\/shorts\\/([A-Za-z0-9_-]{11})(?:\\/|$)/.exec(url.pathname)?.[1] ?? null;
        return typeof contentId === "string" && /^[A-Za-z0-9_-]{11}$/.test(contentId)
          ? contentId
          : null;
      } catch { return null; }
    };
    const channelPathFromUrl = (value) => {
      try {
        const url = new URL(value, location.href);
        if (url.origin !== location.origin ||
          !/^\\/(?:@[A-Za-z0-9._%~-]{1,180}|channel\\/[A-Za-z0-9_-]{1,128})\\/?$/.test(url.pathname)) {
          return null;
        }
        return url.pathname.replace(/\\/$/, "");
      } catch { return null; }
    };
    const nearIdentity = (left, right) => {
      if (!left || !right || left.length !== right.length) return false;
      let differences = 0;
      for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index] && ++differences > 1) return false;
      }
      return differences === 1;
    };
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
        style.visibility !== "hidden" && Number(style.opacity || 1) > 0.05;
    };
    ${providerTerminalPageDetectorScript("youtube")}
    if (intent.mediaType === "channel" && expectedChannelPath !== null &&
      expectedChannelIdentity !== null && channelPathFromUrl(location.href) === expectedChannelPath) {
      const exactChannelHeading = [...document.querySelectorAll(
        'ytd-channel-name yt-formatted-string,#channel-name yt-formatted-string,'
        + 'yt-page-header-renderer h1,yt-dynamic-text-view-model h1,h1'
      )].find((heading) => visible(heading) &&
        identity(heading.textContent) === expectedChannelIdentity);
      if (exactChannelHeading instanceof HTMLElement) return "complete";
    }
    if (
      intent.action === "play" &&
      (location.pathname === "/watch" || location.pathname.startsWith("/shorts/"))
    ) {
      const currentContentId = contentIdFromUrl(location.href);
      if (expectedContentId === null || currentContentId !== expectedContentId) return "idle";
      const video = document.querySelector("video");
      if (video && !video.paused && !video.ended && video.readyState >= 2) {
        const fullscreenElement = document.fullscreenElement;
        if ((fullscreenElement !== null && (
          fullscreenElement === video || fullscreenElement.contains(video)
        )) ||
          document.querySelector(".html5-video-player.ytp-fullscreen") !== null) return "complete";
        if (fullscreenRequested) return "playing";
        const fullscreen = [...document.querySelectorAll(
          'button.ytp-fullscreen-button,button[aria-label^="Full screen"],button[title^="Full screen"]'
        )].find(visible);
        if (fullscreen instanceof HTMLElement) {
          fullscreen.click();
          return "fullscreen-requested";
        }
        return "playing";
      }
      const play = [...document.querySelectorAll(
        'button.ytp-play-button,button[aria-label^="Play"]'
      )].find((button) => visible(button) && !/^pause/i.test(button.getAttribute("aria-label") ?? ""));
      if (play instanceof HTMLElement) {
        play.click();
        return "play-clicked";
      }
    }
    const title = normalize(intent.title);
    const creatorIdentity = identity(intent.creator);
    const channelIdentity = creatorIdentity || identity(intent.title);
    const candidates = [];
    if (intent.mediaType === "channel") {
      const anchors = [...document.querySelectorAll(
        'ytd-channel-renderer a#main-link,ytd-channel-renderer a[href^="/@"],ytd-channel-renderer a[href^="/channel/"],yt-lockup-view-model a[href^="/@"],yt-lockup-view-model a[href^="/channel/"]'
      )];
      for (const anchor of anchors) {
        if (!visible(anchor)) continue;
        const card = anchor.closest('ytd-channel-renderer,yt-lockup-view-model') ?? anchor;
        const name = normalize(
          card.querySelector('#channel-title,#text-container yt-formatted-string,h3')?.textContent ??
          anchor.textContent
        );
        const hrefIdentity = identity(anchor.getAttribute("href")?.replace(/^\\/@?/, "") ?? "");
        const nameIdentity = identity(name);
        const exact = channelIdentity && (nameIdentity === channelIdentity || hrefIdentity === channelIdentity);
        const near = channelIdentity && nearIdentity(nameIdentity, channelIdentity);
        const channelPath = channelPathFromUrl(anchor.getAttribute("href"));
        if ((exact || near) && channelPath !== null && nameIdentity) {
          candidates.push({
            anchor,
            channelIdentity: nameIdentity,
            channelPath,
            score: exact ? 200 : 110
          });
        }
      }
    } else {
      const genericTitles = new Set(["video", "a video", "something", "latest video"]);
      const anchors = [...document.querySelectorAll(
        'ytd-video-renderer a#video-title,ytd-rich-item-renderer a#video-title,'
        + 'yt-lockup-view-model a[href^="/watch?"],yt-lockup-view-model a[href^="/shorts/"]'
      )];
      for (const anchor of anchors) {
        const href = anchor.getAttribute("href") ?? "";
        if (!visible(anchor) || (!href.startsWith("/watch?") && !href.startsWith("/shorts/"))) continue;
        if (intent.recency === "latest" && href.startsWith("/shorts/")) continue;
        const card = anchor.closest('ytd-video-renderer,ytd-rich-item-renderer,yt-lockup-view-model') ?? anchor;
        const videoTitle = normalize(anchor.getAttribute("title") ?? anchor.textContent);
        const byline = normalize(card.querySelector(
          'ytd-channel-name a,#channel-name a,a.yt-simple-endpoint.yt-formatted-string[href^="/@"],a[href^="/channel/"]'
        )?.textContent);
        let score = 0;
        if (creatorIdentity) {
          const bylineIdentity = identity(byline);
          if (bylineIdentity === creatorIdentity) score += 200;
          else if (nearIdentity(bylineIdentity, creatorIdentity)) score += 110;
          else continue;
        }
        if (intent.recency === "latest" || genericTitles.has(title)) score += 30;
        else if (videoTitle === title) score += 100;
        else if (videoTitle.startsWith(title)) score += 70;
        else if (videoTitle.includes(title)) score += 50;
        else continue;
        candidates.push({ anchor, score });
      }
    }
    candidates.sort((left, right) => right.score - left.score);
    const candidate = candidates[0];
    const anchor = candidate?.anchor;
    if (anchor instanceof HTMLElement) {
      if (intent.mediaType === "channel") {
        if (!candidate.channelPath || !candidate.channelIdentity) return "idle";
        anchor.click();
        return {
          state: "channel-navigated",
          youtubeChannelIdentity: candidate.channelIdentity,
          youtubeChannelPath: candidate.channelPath
        };
      }
      const targetContentId = contentIdFromUrl(anchor.getAttribute("href"));
      if (
        intent.action === "play" &&
        targetContentId === null
      ) return "idle";
      anchor.click();
      return intent.action === "play"
        ? { state: "navigated", youtubeContentId: targetContentId }
        : "complete";
    }
    return "idle";
  })()`;
}

export function buildNetflixVoiceAutomationScript(
  intent: VoiceMediaIntent,
  profileNameHint: string | null = null,
  expectedContentId: string | null = null,
  fullscreenRequested = false
): string {
  return `(() => {
    const intent = ${serializedIntent(intent)};
    const profileNameHint = ${serializedProfileHint(profileNameHint)};
    const expectedContentId = ${serializedNetflixContentId(expectedContentId)};
    const fullscreenRequested = ${JSON.stringify(fullscreenRequested)};
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim().toLocaleLowerCase("en-US");
    const identity = (value) => normalize(value).replace(/[^a-z0-9]+/g, "");
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
        style.visibility !== "hidden" && Number(style.opacity || 1) > 0.05;
    };
    ${providerTerminalPageDetectorScript("netflix")}
    const controlLabel = (element) => normalize([
      element.getAttribute("aria-label"),
      element.getAttribute("data-uia"),
      element.getAttribute("title"),
      element.textContent
    ].filter(Boolean).join(" "));
    const currentContentId = /^\\/(?:title|watch)\\/([A-Za-z0-9_-]{1,64})(?:\\/|$)/
      .exec(location.pathname)?.[1] ?? null;
    const expectedContentMatches = expectedContentId !== null &&
      currentContentId === expectedContentId;
    const profileCandidates = [...document.querySelectorAll(
      '[data-uia="profile-link"],a.profile-link,a[href*="/SwitchProfile"],button[data-profile-guid]'
    )].filter((element) => visible(element) && !/(?:add|manage|transfer|edit) profile/.test(controlLabel(element)));
    const profileGate = profileCandidates.length > 0 && (
      /who(?:'|’)s watching/.test(normalize(document.body?.innerText)) ||
      /\\/profiles(?:\\/|$)/i.test(location.pathname) ||
      document.querySelector('.choose-profile,[data-uia="profile-gate-label"]') !== null
    );
    if (profileGate) {
      const hintIdentity = identity(profileNameHint);
      const namedProfiles = profileCandidates.flatMap((element) => {
        const name = element.querySelector('.profile-name,[data-uia="profile-name"]')?.textContent ??
          element.getAttribute("aria-label") ?? element.textContent;
        const nameIdentity = identity(name);
        return nameIdentity ? [{ element, nameIdentity }] : [];
      });
      const exactMatches = hintIdentity
        ? namedProfiles.filter(({ nameIdentity }) => nameIdentity === hintIdentity)
        : [];
      const selected = exactMatches[0]?.element ?? profileCandidates[0] ?? null;
      if (selected instanceof HTMLElement) {
        selected.click();
        return "profile-selected";
      }
      return "profile-required";
    }
    if (intent.action === "play") {
      const video = document.querySelector("video");
      if (video && !video.paused && !video.ended && video.readyState >= 2) {
        if (!expectedContentMatches) return "idle";
        const fullscreenElement = document.fullscreenElement;
        if (fullscreenElement !== null && (
          fullscreenElement === video || fullscreenElement.contains(video)
        )) return "complete";
        if (fullscreenRequested) return "playing";
        const fullscreen = [...document.querySelectorAll(
          '[data-uia="control-fullscreen-enter"],button[aria-label*="Full screen" i],button[aria-label*="fullscreen" i]'
        )].find(visible);
        if (fullscreen instanceof HTMLElement) {
          fullscreen.click();
          return "fullscreen-requested";
        }
        return "playing";
      }
      const providerDetailRoot = document.querySelector(
        'dialog[open],[role="dialog"],[aria-modal="true"],[data-uia*="modal"],'
        + '[class*="previewModal"],[class*="detail-modal"],'
        + '[data-uia="title-info-container"],.jawBoneContainer'
      );
      const detailRoot = providerDetailRoot ??
        (expectedContentMatches ? document : null);
      const detailSignals = detailRoot === null ? [] : [
        ...detailRoot.querySelectorAll('h1,h2,h3,[aria-label],[title],img[alt]')
      ].flatMap((element) => [
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.getAttribute("alt"),
        element.textContent
      ]).filter(Boolean);
      const exactTitleSignal = detailSignals.some((signal) =>
        identity(signal) === identity(intent.title)
      );
      const detailMatches = exactTitleSignal ||
        (providerDetailRoot === null && expectedContentMatches);
      if (intent.mediaType === "episode" && detailRoot !== null) {
        if (!detailMatches) return "idle";
        const seasonNumber = Number(intent.season);
        const episodeNumber = Number(intent.episode);
        const matchesSeason = (value) => {
          const label = normalize(value);
          const named = label.match(/(?:^|\\b)season\\s*0*(\\d+)(?:\\b|$)/i);
          if (named) return Number(named[1]) === seasonNumber;
          return /^0*\\d+$/.test(label) && Number(label) === seasonNumber;
        };
        const seasonControls = [...detailRoot.querySelectorAll(
          'select[data-uia*="season"],select[aria-label*="season" i],'
          + '[data-uia*="season-selector"],button[aria-label*="season" i],'
          + '[role="button"][aria-label*="season" i]'
        )].filter(visible);
        const selectedSeason = seasonControls.find((element) => {
          const selectedOptions = [
            ...element.querySelectorAll('option:checked,[aria-selected="true"]')
          ];
          if (selectedOptions.length > 0) {
            return selectedOptions.some((option) => matchesSeason(controlLabel(option)));
          }
          return element.tagName !== 'SELECT' && matchesSeason(controlLabel(element));
        });
        let seasonConfirmed = selectedSeason !== undefined;
        if (!seasonConfirmed) {
          const seasonOptions = [...document.querySelectorAll(
            '[role="option"],[role="menuitem"],[data-uia^="season-option-"]'
          )].filter((element) => visible(element) && matchesSeason(controlLabel(element)));
          const targetSeason = seasonOptions[0];
          if (targetSeason instanceof HTMLElement) {
            targetSeason.click();
            return "navigated";
          }
          const seasonControl = seasonControls[0];
          if (seasonControl instanceof HTMLElement) {
            const options = [...seasonControl.querySelectorAll('option')];
            const targetOption = options.find((option) => matchesSeason(controlLabel(option)));
            if (targetOption instanceof HTMLOptionElement && seasonControl instanceof HTMLSelectElement) {
              seasonControl.value = targetOption.value;
              seasonControl.dispatchEvent(new Event('input', { bubbles: true }));
              seasonControl.dispatchEvent(new Event('change', { bubbles: true }));
              return "navigated";
            }
            seasonControl.click();
            return "navigated";
          }
        }
        const episodeRows = [...detailRoot.querySelectorAll(
          '[data-uia^="episode-item-"],[data-uia="episode-item"],.episode-item'
        )].filter(visible);
        const exactEpisode = episodeRows.find((row) => {
          const signals = [
            row.getAttribute('aria-label'),
            row.getAttribute('data-uia'),
            ...[...row.querySelectorAll(
              '[data-uia*="episode-number"],[aria-label],[title],h3,h4'
            )].flatMap((element) => [
              element.getAttribute('aria-label'),
              element.getAttribute('title'),
              element.textContent
            ])
          ].filter(Boolean).map(normalize);
          const coordinateMatches = signals.some((signal) => {
            const match = signal.match(
              /(?:s|season)\\s*0*(\\d+)\\D+(?:e|episode)\\s*0*(\\d+)(?:\\b|$)/i
            );
            return match !== null && Number(match[1]) === seasonNumber &&
              Number(match[2]) === episodeNumber;
          });
          if (coordinateMatches) {
            seasonConfirmed = true;
            return true;
          }
          return seasonConfirmed && signals.some((signal) => {
            const match = signal.match(
              /(?:^|\\b)(?:episode(?:\\s*item)?[-\\s]*)?0*(\\d+)(?:\\b|[.\\s:—-])/i
            );
            return match !== null && Number(match[1]) === episodeNumber;
          });
        });
        if (exactEpisode instanceof HTMLElement && seasonConfirmed) {
          const episodePlay = [...exactEpisode.querySelectorAll(
            '[data-uia*="play"],button[aria-label*="play" i],a[href^="/watch/"]'
          )].find((element) => visible(element) && !/(?:trailer|preview|teaser)/.test(controlLabel(element)));
          if (episodePlay instanceof HTMLElement) {
            episodePlay.click();
            return "play-clicked";
          }
        }
        return "idle";
      }
      const controls = detailRoot === null || !detailMatches ? [] :
        [...detailRoot.querySelectorAll('button,a,[role="button"]')]
        .filter(visible)
        .map((element) => ({ element, label: controlLabel(element) }))
        .filter(({ label }) => !/(?:trailer|preview|teaser)/.test(label));
      const resume = controls.find(({ label }) =>
        /(?:^|\\s)(?:resume|continue watching|continue)(?:\\s|$)/.test(label) ||
        /(?:resume|continue)-button/.test(label)
      );
      const play = controls.find(({ label }) =>
        /(?:^|\\s)(?:play|watch now)(?:\\s|$)/.test(label) || /play-button/.test(label)
      );
      const control = resume ?? play;
      if (control?.element instanceof HTMLElement) {
        control.element.click();
        return "play-clicked";
      }
    }
    const titleIdentity = identity(intent.title);
    const cards = [...document.querySelectorAll(
      '[data-uia="search-video"],[data-uia^="title-card-"],.title-card-container,.slider-item,.galleryContent'
    )].filter(visible);
    const exactCard = cards.find((card) => {
      const signals = [
        card.getAttribute("aria-label"),
        card.getAttribute("title"),
        ...[...card.querySelectorAll('[aria-label],[title],img[alt],[data-uia="title-card-title"]')]
          .flatMap((element) => [
            element.getAttribute("aria-label"),
            element.getAttribute("title"),
            element.getAttribute("alt"),
            element.textContent
          ])
      ].filter(Boolean);
      return signals.some((signal) => identity(signal) === titleIdentity);
    });
    if (exactCard instanceof HTMLElement) {
      const destinations = [
        ...exactCard.querySelectorAll('a[href^="/title/"],a[href^="/watch/"]')
      ].filter(visible);
      const titleDetails = destinations.find((element) =>
        element.getAttribute("href")?.startsWith("/title/")
      );
      const destination = intent.mediaType === "episode" ||
        intent.mediaType === "show" || intent.mediaType === "title" ||
        intent.action === "open"
        ? titleDetails ?? exactCard
        : destinations[0] ?? exactCard;
      if (destination instanceof HTMLElement) {
        destination.click();
        return intent.action === "play" ? "navigated" : "complete";
      }
    }
    return "idle";
  })()`;
}

export function applyYouTubeLatestSort(urlValue: string, intent: VoiceMediaIntent): string {
  if (intent.recency !== "latest") return urlValue;
  const url = new URL(urlValue);
  if (url.hostname !== "www.youtube.com" || url.pathname !== "/results") return urlValue;
  // YouTube's provider-owned upload-date filter uses this opaque search token.
  // Keeping it here prevents the model from supplying query parameters.
  // URLSearchParams owns percent-encoding. Supplying the already encoded
  // spelling would serialize as CAI%253D and YouTube would not receive CAI=.
  url.searchParams.set("sp", "CAI=");
  return url.toString();
}
