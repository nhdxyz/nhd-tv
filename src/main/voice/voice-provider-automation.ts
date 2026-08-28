import type { VoiceMediaIntent } from "./voice-intent";

export type VoiceProviderAutomationResult =
  | "complete"
  | "fullscreen-requested"
  | "idle"
  | "navigated"
  | "play-clicked"
  | "playing"
  | "profile-selected";

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
    const playButton = (root) => [...root.querySelectorAll(
      '[data-testid="play-button"],button[aria-label^="Play "],button[aria-label="Play"]'
    )].find((button) => visible(button) && !/^pause(?:\\s|$)/i.test(
      button.getAttribute("aria-label") ?? button.textContent ?? ""
    ));
    const pauseButton = (root) => [...root.querySelectorAll(
      '[data-testid="control-button-playpause"],button[aria-label^="Pause"]'
    )].find((button) => visible(button) && /^pause(?:\\s|$)/i.test(
      button.getAttribute("aria-label") ?? button.textContent ?? ""
    ));
    const nowPlaying = document.querySelector(
      '[data-testid="now-playing-widget"],[data-testid="now-playing-bar"],[data-testid="now-playing-view"]'
    );
    const nowPlayingTitle = identity(nowPlaying?.querySelector(
      '[data-testid="context-item-info-title"],a[href^="/track/"]'
    )?.textContent);
    const nowPlayingCreator = identity(nowPlaying?.querySelector(
      '[data-testid="context-item-info-subtitles"],a[href^="/artist/"]'
    )?.textContent);
    const nowPlayingMatches = intent.mediaType === "song" && nowPlayingTitle === titleIdentity &&
      (!creatorIdentity || nowPlayingCreator === creatorIdentity);
    if (intent.action === "play" && nowPlaying && (nowPlayingMatches || candidateMatches(nowPlaying))) {
      const pause = [...document.querySelectorAll(
        '[data-testid="control-button-playpause"],button[aria-label^="Pause"]'
      )].find(visible);
      if (pause instanceof HTMLElement) return "complete";
    }
    const roots = [...document.querySelectorAll(
      '[data-testid="tracklist-row"],[data-testid="search-track-list"] [role="row"],'
      + '[role="row"][aria-rowindex],[data-testid="card-container"],[data-encore-id="card"]'
    )].filter((root) => visible(root) && candidateMatches(root));
    for (const root of roots) {
      if (intent.action === "play") {
        if (playbackRequested && pauseButton(root) instanceof HTMLElement) return "playing";
        const button = playButton(root);
        if (button instanceof HTMLElement) {
          button.click();
          return "play-clicked";
        }
      }
      const destination = exactLink(root, routePrefix,
        intent.mediaType === "artist" ? titleIdentity || creatorIdentity : titleIdentity);
      if (destination instanceof HTMLElement && visible(destination)) {
        destination.click();
        return intent.action === "play" ? "navigated" : "complete";
      }
    }
    if (/^\\/(?:album|artist|playlist|track)\\//.test(location.pathname)) {
      const headingIdentity = identity(document.querySelector(
        'h1,[data-testid="entityTitle"],[data-testid="context-item-info-title"]'
      )?.textContent);
      const requestedIdentity = intent.mediaType === "artist"
        ? titleIdentity || creatorIdentity
        : titleIdentity;
      if (headingIdentity === requestedIdentity) {
        if (intent.action !== "play") return "complete";
        if (playbackRequested && pauseButton(document) instanceof HTMLElement) return "playing";
        const button = playButton(document);
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
        return intent.action === "play" ? "navigated" : "complete";
      }
    }
    return "idle";
  })()`;
}

export function buildYouTubeVoiceAutomationScript(intent: VoiceMediaIntent): string {
  return `(() => {
    const intent = ${serializedIntent(intent)};
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim().toLocaleLowerCase("en-US");
    const identity = (value) => normalize(value).replace(/[^a-z0-9]+/g, "");
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
    if (intent.action === "play" && location.pathname === "/watch") {
      const video = document.querySelector("video");
      if (video && !video.paused && !video.ended && video.readyState >= 2) {
        const fullscreenElement = document.fullscreenElement;
        if ((fullscreenElement !== null && (
          fullscreenElement === video || fullscreenElement.contains(video)
        )) ||
          document.querySelector(".html5-video-player.ytp-fullscreen") !== null) return "complete";
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
        const partial = channelIdentity && (nameIdentity.includes(channelIdentity) || channelIdentity.includes(nameIdentity));
        const near = channelIdentity && nearIdentity(nameIdentity, channelIdentity);
        if (exact || partial || near) candidates.push({ anchor, score: exact ? 200 : near ? 110 : 100 });
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
        let score = 0;
        if (creatorIdentity) {
          const bylineIdentity = identity(byline);
          if (bylineIdentity === creatorIdentity) score += 200;
          else if (bylineIdentity && (bylineIdentity.includes(creatorIdentity) || creatorIdentity.includes(bylineIdentity))) score += 120;
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
    const anchor = candidates[0]?.anchor;
    if (anchor instanceof HTMLElement) {
      anchor.click();
      return intent.action === "play" && intent.mediaType !== "channel"
        ? "navigated"
        : "complete";
    }
    return "idle";
  })()`;
}

export function buildNetflixVoiceAutomationScript(
  intent: VoiceMediaIntent,
  profileNameHint: string | null = null
): string {
  return `(() => {
    const intent = ${serializedIntent(intent)};
    const profileNameHint = ${serializedProfileHint(profileNameHint)};
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim().toLocaleLowerCase("en-US");
    const identity = (value) => normalize(value).replace(/[^a-z0-9]+/g, "");
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
        style.visibility !== "hidden" && Number(style.opacity || 1) > 0.05;
    };
    const controlLabel = (element) => normalize([
      element.getAttribute("aria-label"),
      element.getAttribute("data-uia"),
      element.getAttribute("title"),
      element.textContent
    ].filter(Boolean).join(" "));
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
      const selected = (hintIdentity
        ? profileCandidates.find((element) => {
          const name = element.querySelector('.profile-name,[data-uia="profile-name"]')?.textContent ??
            element.getAttribute("aria-label") ?? element.textContent;
          return identity(name) === hintIdentity;
        })
        : null) ?? profileCandidates[0];
      if (selected instanceof HTMLElement) {
        selected.click();
        return "profile-selected";
      }
      return "idle";
    }
    if (intent.action === "play") {
      const video = document.querySelector("video");
      if (video && !video.paused && !video.ended && video.readyState >= 2) {
        const fullscreenElement = document.fullscreenElement;
        if (fullscreenElement !== null && (
          fullscreenElement === video || fullscreenElement.contains(video)
        )) return "complete";
        const fullscreen = [...document.querySelectorAll(
          '[data-uia="control-fullscreen-enter"],button[aria-label*="Full screen" i],button[aria-label*="fullscreen" i]'
        )].find(visible);
        if (fullscreen instanceof HTMLElement) {
          fullscreen.click();
          return "fullscreen-requested";
        }
        return "playing";
      }
      const detailRoot = document.querySelector(
        '[role="dialog"],.previewModal--wrapper,[data-uia="modal"]'
      ) ?? (/^\\/(?:title|watch)\\//.test(location.pathname) ? document : null);
      const detailSignals = detailRoot === null ? [] : [
        ...detailRoot.querySelectorAll('h1,h2,h3,[aria-label],[title],img[alt]')
      ].flatMap((element) => [
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.getAttribute("alt"),
        element.textContent
      ]).filter(Boolean);
      const detailMatches = /^\\/(?:title|watch)\\//.test(location.pathname) ||
        detailSignals.some((signal) => identity(signal) === identity(intent.title));
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
        const seasonControls = [...document.querySelectorAll(
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
        const episodeRows = [...document.querySelectorAll(
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
      const destination = intent.mediaType === "episode" || intent.action === "open"
        ? destinations.find((element) => element.getAttribute("href")?.startsWith("/title/"))
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
  url.searchParams.set("sp", "CAI%3D");
  return url.toString();
}
