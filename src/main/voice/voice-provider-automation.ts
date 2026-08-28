import type { VoiceMediaIntent } from "./voice-intent";

function serializedIntent(intent: VoiceMediaIntent): string {
  return JSON.stringify({
    action: intent.action,
    creator: intent.creator,
    mediaType: intent.mediaType,
    title: intent.title
  });
}

export function buildSpotifyVoiceAutomationScript(intent: VoiceMediaIntent): string {
  return `(() => {
    const intent = ${serializedIntent(intent)};
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim().toLocaleLowerCase("en-US");
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const title = normalize(intent.title);
    const creator = normalize(intent.creator);
    const matches = (element) => {
      const text = normalize(element.textContent);
      return text.includes(title) && (!creator || text.includes(creator));
    };
    const playButton = (root) => [...root.querySelectorAll(
      '[data-testid="play-button"],button[aria-label^="Play "],button[aria-label="Play"]'
    )].find(visible);
    const rows = [...document.querySelectorAll(
      '[data-testid="tracklist-row"],[role="row"],[data-testid="card-container"],section'
    )].filter((element) => visible(element) && matches(element));
    for (const row of rows) {
      const button = playButton(row);
      if (button instanceof HTMLElement && intent.action === "play") {
        button.click();
        return true;
      }
    }
    const hrefPrefix = intent.mediaType === "artist" ? "/artist/"
      : intent.mediaType === "album" ? "/album/"
        : intent.mediaType === "playlist" ? "/playlist/"
          : intent.mediaType === "song" ? "/track/" : "/";
    const anchor = [...document.querySelectorAll('a[href]')]
      .find((candidate) => visible(candidate) &&
        candidate.getAttribute("href")?.startsWith(hrefPrefix) &&
        matches(candidate.closest('[data-testid="card-container"],[role="row"],section') ?? candidate));
    if (intent.action !== "play" && anchor instanceof HTMLElement) {
      anchor.click();
      return true;
    }
    if (intent.action === "play" && /^\\/(?:album|artist|playlist|track)\\//.test(location.pathname)) {
      const detailPlay = playButton(document);
      if (detailPlay instanceof HTMLElement) {
        detailPlay.click();
        return true;
      }
    }
    if (intent.action === "play" && anchor instanceof HTMLElement) anchor.click();
    return false;
  })()`;
}

export function buildYouTubeVoiceAutomationScript(intent: VoiceMediaIntent): string {
  return `(() => {
    const intent = ${serializedIntent(intent)};
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim().toLocaleLowerCase("en-US");
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const title = normalize(intent.title);
    const creator = normalize(intent.creator);
    const cardMatches = (anchor) => {
      const card = anchor.closest('ytd-video-renderer,ytd-rich-item-renderer,ytd-channel-renderer,yt-lockup-view-model') ?? anchor;
      const text = normalize(card.textContent);
      const titleMatches = title === "latest video" || text.includes(title);
      return titleMatches && (!creator || text.includes(creator));
    };
    const selectors = intent.mediaType === "channel"
      ? 'ytd-channel-renderer a#main-link,a[href^="/@"],a[href^="/channel/"]'
      : 'ytd-video-renderer a#video-title,ytd-rich-item-renderer a#video-title,a[href^="/watch?"]';
    const anchor = [...document.querySelectorAll(selectors)]
      .find((candidate) => visible(candidate) && cardMatches(candidate));
    if (anchor instanceof HTMLElement) {
      anchor.click();
      return true;
    }
    return false;
  })()`;
}

export function applyYouTubeLatestSort(urlValue: string, intent: VoiceMediaIntent): string {
  if (intent.recency !== "latest") return urlValue;
  const url = new URL(urlValue);
  if (url.hostname !== "www.youtube.com" || url.pathname !== "/results") return urlValue;
  // YouTube's provider-owned upload-date filter uses this opaque search token.
  // Keeping it here prevents the model from supplying query parameters.
  url.searchParams.set("sp", "CAI%3D");
  return url.toString();
}
