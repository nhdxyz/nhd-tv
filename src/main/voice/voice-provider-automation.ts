import type { VoiceMediaIntent } from "./voice-intent";

function serializedIntent(intent: VoiceMediaIntent): string {
  return JSON.stringify({
    action: intent.action,
    creator: intent.creator,
    mediaType: intent.mediaType,
    recency: intent.recency,
    title: intent.title
  });
}

export function buildSpotifyVoiceAutomationScript(intent: VoiceMediaIntent): string {
  return `(() => {
    const intent = ${serializedIntent(intent)};
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim().toLocaleLowerCase("en-US");
    const identity = (value) => normalize(value).replace(/[^a-z0-9]+/g, "");
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const title = normalize(intent.title);
    const creator = normalize(intent.creator);
    const titleIdentity = identity(title);
    const creatorIdentity = identity(creator);
    const matches = (element, hrefPrefix) => {
      const text = normalize(element.textContent);
      const textIdentity = identity(text);
      const titleLinks = [...element.querySelectorAll('a[href]')]
        .filter((anchor) => anchor.getAttribute("href")?.startsWith(hrefPrefix));
      const exactTitle = titleLinks.some((anchor) => identity(anchor.textContent) === titleIdentity);
      const titleMatches = exactTitle || titleLinks.length === 0 && textIdentity.includes(titleIdentity);
      return titleMatches && (!creatorIdentity || textIdentity.includes(creatorIdentity));
    };
    const playButton = (root) => [...root.querySelectorAll(
      '[data-testid="play-button"],button[aria-label^="Play "],button[aria-label="Play"]'
    )].find(visible);
    const hrefPrefix = intent.mediaType === "artist" ? "/artist/"
      : intent.mediaType === "album" ? "/album/"
        : intent.mediaType === "playlist" ? "/playlist/"
          : intent.mediaType === "song" ? "/track/" : "/";
    const rows = [...document.querySelectorAll(
      '[data-testid="tracklist-row"],[role="row"],[data-testid="card-container"]'
    )].filter((element) => visible(element) && matches(element, hrefPrefix));
    for (const row of rows) {
      const button = playButton(row);
      if (button instanceof HTMLElement && intent.action === "play") {
        button.click();
        return true;
      }
    }
    const anchor = [...document.querySelectorAll('a[href]')]
      .find((candidate) => visible(candidate) &&
        candidate.getAttribute("href")?.startsWith(hrefPrefix) &&
        identity(candidate.textContent) === titleIdentity &&
        matches(candidate.closest('[data-testid="card-container"],[role="row"]') ?? candidate, hrefPrefix));
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
    const identity = (value) => normalize(value).replace(/[^a-z0-9]+/g, "");
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const title = normalize(intent.title);
    const creator = normalize(intent.creator);
    const creatorIdentity = identity(creator);
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
        const exact = creatorIdentity && (nameIdentity === creatorIdentity || hrefIdentity === creatorIdentity);
        const partial = creatorIdentity && (nameIdentity.includes(creatorIdentity) || creatorIdentity.includes(nameIdentity));
        if (exact || partial) candidates.push({ anchor, score: exact ? 200 : 100 });
      }
    } else {
      const genericTitles = new Set(["video", "a video", "something", "latest video"]);
      const anchors = [...document.querySelectorAll(
        'ytd-video-renderer a#video-title,ytd-rich-item-renderer a#video-title,yt-lockup-view-model a[href^="/watch?"]'
      )];
      for (const anchor of anchors) {
        if (!visible(anchor) || !anchor.getAttribute("href")?.startsWith("/watch?")) continue;
        const card = anchor.closest('ytd-video-renderer,ytd-rich-item-renderer,yt-lockup-view-model') ?? anchor;
        const videoTitle = normalize(anchor.getAttribute("title") ?? anchor.textContent);
        const byline = normalize(card.querySelector(
          'ytd-channel-name a,#channel-name a,a.yt-simple-endpoint.yt-formatted-string[href^="/@"],a[href^="/channel/"]'
        )?.textContent);
        const cardText = normalize(card.textContent);
        let score = 0;
        if (creatorIdentity) {
          const bylineIdentity = identity(byline);
          if (bylineIdentity === creatorIdentity) score += 200;
          else if (bylineIdentity && (bylineIdentity.includes(creatorIdentity) || creatorIdentity.includes(bylineIdentity))) score += 120;
          else if (bylineIdentity) continue;
          else if (identity(cardText).includes(creatorIdentity)) score += 40;
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
    const anchor = candidates[0]?.anchor;
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
