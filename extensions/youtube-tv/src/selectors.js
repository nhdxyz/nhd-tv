(() => {
  "use strict";

  const namespace = globalThis.NHDYouTubeTV ??= {};

  const selectors = Object.freeze({
    cards: [
      "ytd-rich-item-renderer",
      "ytd-video-renderer",
      "ytd-grid-video-renderer",
      "ytd-compact-video-renderer",
      "ytd-playlist-video-renderer",
      "ytd-grid-playlist-renderer",
      "ytd-channel-renderer",
      "ytd-grid-channel-renderer",
      "yt-lockup-view-model",
      "ytd-reel-item-renderer"
    ].join(","),
    candidates: [
      "a[href]",
      "button",
      "input",
      "textarea",
      "select",
      "summary",
      "[role='button']",
      "[role='link']",
      "[role='menuitem']",
      "[role='option']",
      "[role='tab']",
      "[role='textbox']",
      "[tabindex]:not([tabindex='-1'])"
    ].join(","),
    categoryBars: [
      "ytd-feed-filter-chip-bar-renderer",
      "yt-chip-cloud-renderer",
      "[role='tablist']"
    ].join(","),
    categoryTabs: [
      "ytd-feed-filter-chip-bar-renderer [role='tab']",
      "yt-chip-cloud-renderer [role='tab']",
      "[role='tablist'] [role='tab']"
    ].join(","),
    categoryScrollers: [
      "ytd-feed-filter-chip-bar-renderer #scroll-container",
      "yt-chip-cloud-renderer #scroll-container",
      "[role='tablist']"
    ].join(","),
    dialogs: [
      "dialog[open]",
      "[role='dialog']",
      "[aria-modal='true']",
      "tp-yt-paper-dialog",
      "ytd-menu-popup-renderer",
      "ytd-multi-page-menu-renderer",
      "yt-sheet-view-model"
    ].join(","),
    editable: [
      "input",
      "textarea",
      "select",
      "[contenteditable='true']",
      "[role='textbox']"
    ].join(","),
    guideEntries: [
      "#nhdtv-tv-rail .nhdtv-tv-rail-item",
      "ytd-mini-guide-entry-renderer",
      "ytd-guide-entry-renderer",
      "ytd-guide-section-renderer"
    ].join(","),
    guideRoots: [
      "#nhdtv-tv-rail",
      "ytd-mini-guide-renderer",
      "ytd-guide-renderer",
      "#guide-content"
    ].join(","),
    player: [
      "#movie_player",
      ".html5-video-player",
      "ytd-player",
      "video",
      "iframe[src*='youtube.com/embed']"
    ].join(","),
    primaryCardLinks: [
      "a[href^='/watch']",
      "a[href*='youtube.com/watch']",
      "a[href^='/shorts/']",
      "a[href*='youtube.com/shorts/']",
      "a[href^='/playlist']",
      "a[href*='youtube.com/playlist']",
      "a#thumbnail",
      "a#video-title",
      "a#video-title-link"
    ].join(","),
    searchFields: [
      "textarea[name='search_query']",
      "input[name='search_query']",
      "ytd-searchbox input",
      "yt-searchbox input",
      "[role='search'] [role='textbox']"
    ].join(","),
    searchLaunchers: [
      "ytd-masthead button[aria-label='Search']",
      "ytd-masthead [role='button'][aria-label='Search']",
      "button[aria-label='Search']"
    ].join(","),
    shelves: [
      "ytd-rich-section-renderer",
      "ytd-rich-shelf-renderer",
      "ytd-reel-shelf-renderer",
      "ytd-horizontal-card-list-renderer",
      "yt-horizontal-list-renderer",
      "ytd-item-section-renderer",
      "ytd-playlist-panel-renderer"
    ].join(",")
  });

  const routeKind = (url = location.href) => {
    try {
      const parsed = new URL(url, location.origin);
      const path = parsed.pathname;
      if (path === "/") return "home";
      if (path === "/results") return "results";
      if (path.startsWith("/feed/subscriptions")) return "subscriptions";
      if (path.startsWith("/feed/you")) return "you";
      if (path === "/watch") return "watch";
      if (path.startsWith("/shorts/")) return "shorts";
      if (path.startsWith("/playlist")) return "playlist";
      if (path.startsWith("/channel/") || /^\/@[^/]+/.test(path)) return "channel";
      return "browse";
    } catch {
      return "browse";
    }
  };

  const isEditable = (element) =>
    element instanceof Element && element.closest(selectors.editable) !== null;

  const isPlayerTarget = (element) =>
    element instanceof Element && element.closest(selectors.player) !== null;

  const isPlaybackRoute = (url = location.href) => {
    const route = routeKind(url);
    return route === "watch" || route === "shorts";
  };

  const isDisabled = (element) =>
    element.matches(":disabled,[aria-disabled='true'],[aria-hidden='true'],[inert]") ||
    element.closest("[aria-hidden='true'],[inert]") !== null;

  const isRendered = (element) => {
    if (!(element instanceof HTMLElement) || !element.isConnected || isDisabled(element)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width >= 10 &&
      rect.height >= 10 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) > 0.05
    );
  };

  const normalizedHref = (element) => {
    if (!(element instanceof HTMLAnchorElement) || !element.href) return null;
    try {
      const url = new URL(element.href, location.origin);
      if (url.origin !== location.origin) return url.href;
      return `${url.pathname}${url.search}`;
    } catch {
      return null;
    }
  };

  const visibleDialog = () => {
    const dialogs = [...document.querySelectorAll(selectors.dialogs)].filter(isRendered);
    return dialogs.filter((candidate) =>
      !dialogs.some((other) => other !== candidate && other.contains(candidate))
    ).at(-1) ?? null;
  };

  namespace.dom = Object.freeze({
    isEditable,
    isPlaybackRoute,
    isPlayerTarget,
    isRendered,
    normalizedHref,
    routeKind,
    visibleDialog
  });
  namespace.selectors = selectors;
})();
