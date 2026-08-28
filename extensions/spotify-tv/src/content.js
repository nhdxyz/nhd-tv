(() => {
  "use strict";

  const ROOT_CLASS = "nhdtv-spotify-tv";
  const NAV_ID = "nhdtv-spotify-tv-nav";
  const SIGNIN_ID = "nhdtv-spotify-tv-signin";
  const SEARCH_ID = "nhdtv-spotify-tv-search";
  const FOCUS_ATTRIBUTE = "data-nhdtv-spotify-focused";
  const TARGET_ATTRIBUTE = "data-nhdtv-spotify-target";
  const CARD_ATTRIBUTE = "data-nhdtv-spotify-card";
  const QUICK_ATTRIBUTE = "data-nhdtv-spotify-quick";
  const TRACK_ATTRIBUTE = "data-nhdtv-spotify-track";
  const root = document.documentElement;
  let mutationFrame = null;

  root.classList.add(ROOT_CLASS);
  root.setAttribute("data-nhdtv-extension-active", "true");
  root.setAttribute("data-nhdtv-input-owner", "host");

  const isRendered = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };

  const routeKind = () => {
    if (location.pathname === "/") return "home";
    if (location.pathname.startsWith("/search")) return "search";
    if (location.pathname.startsWith("/collection")) return "library";
    if (/^\/(?:album|artist|playlist|show|episode|track)\//.test(location.pathname)) return "detail";
    return "browse";
  };

  const isSignedOut = () => {
    const login = document.querySelector('[data-testid="login-button"]');
    // The native global navigation is visually replaced by the TV navigation,
    // so its login control is intentionally hidden after the extension mounts.
    // Presence is the reliable authentication signal; layout visibility is not.
    return login instanceof HTMLElement;
  };

  const authenticationUrl = () => {
    const url = new URL("https://accounts.spotify.com/en/login");
    url.searchParams.set("continue", location.href.startsWith("https://open.spotify.com/")
      ? location.href
      : "https://open.spotify.com/");
    return url.href;
  };

  const icon = (path) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("viewBox", "0 0 24 24");
    const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
    shape.setAttribute("d", path);
    svg.append(shape);
    return svg;
  };

  const link = (label, href, iconPath) => {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.dataset.nhdtvSpotifyNav = label.toLocaleLowerCase().replace(/\s+/g, "-");
    anchor.setAttribute(TARGET_ATTRIBUTE, "true");
    anchor.append(icon(iconPath));
    const text = document.createElement("span");
    text.textContent = label;
    anchor.append(text);
    return anchor;
  };

  const ensureNavigation = () => {
    let navigation = document.querySelector(`#${NAV_ID}`);
    if (navigation instanceof HTMLElement) return navigation;

    const globalNavigation = document.querySelector('[data-testid="global-nav-bar"]');
    if (!(globalNavigation instanceof HTMLElement)) return null;

    navigation = document.createElement("nav");
    navigation.id = NAV_ID;
    navigation.setAttribute("aria-label", "Spotify TV navigation");

    const brand = document.createElement("a");
    brand.className = "nhdtv-spotify-brand";
    brand.href = "/";
    brand.setAttribute("aria-label", "Spotify Home");
    brand.setAttribute(TARGET_ATTRIBUTE, "true");
    brand.append(icon("M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0Zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02Zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-1.02-.12-1.14-.6-.12-.48.12-1.02.6-1.14C9.6 9.9 15 10.56 18.72 12.84c.36.18.54.78.24 1.2Zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.72 1.02.42 1.56-.3.42-1.02.6-1.56.3Z"));
    const brandText = document.createElement("strong");
    brandText.textContent = "Spotify";
    brand.append(brandText);

    const destinations = document.createElement("div");
    destinations.className = "nhdtv-spotify-destinations";
    destinations.append(
      link("Home", "/", "M12 3.1 21 10v11h-6.2v-6.4H9.2V21H3V10l9-6.9Zm0 2.5-7 5.3V19h2.2v-6.4h9.6V19H19v-8.1l-7-5.3Z"),
      link("Search", "/search", "M10.8 3.5a7.3 7.3 0 1 0 4.5 13.05L20.75 22l1.25-1.25-5.45-5.45A7.3 7.3 0 0 0 10.8 3.5Zm0 1.8a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z"),
      link("Your Library", "/collection/playlists", "M4 3h2v18H4V3Zm4 0h2v18H8V3Zm4.2 1.5 1.8-.8 6.8 15.8-1.8.8-6.8-15.8Z")
    );

    const searchForm = document.createElement("form");
    searchForm.className = "nhdtv-spotify-search-form";
    searchForm.setAttribute("role", "search");
    const searchInput = document.createElement("input");
    searchInput.id = SEARCH_ID;
    searchInput.autocomplete = "off";
    searchInput.maxLength = 120;
    searchInput.placeholder = "Search Spotify";
    searchInput.type = "search";
    searchInput.setAttribute("aria-label", "Search Spotify");
    searchInput.setAttribute(TARGET_ATTRIBUTE, "true");
    searchForm.append(searchInput);
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = searchInput.value.trim();
      location.assign(query.length === 0 ? "/search" : `/search/${encodeURIComponent(query)}`);
    });
    destinations.append(searchForm);

    const account = document.createElement("button");
    account.className = "nhdtv-spotify-account";
    account.type = "button";
    account.setAttribute(TARGET_ATTRIBUTE, "true");
    account.addEventListener("click", () => {
      if (isSignedOut()) {
        location.assign(authenticationUrl());
        return;
      }
      const nativeAccount = document.querySelector(
        '[data-testid="user-widget-link"],button[aria-label*="profile" i],button[aria-label*="account" i]'
      );
      if (nativeAccount instanceof HTMLElement) nativeAccount.click();
    });

    navigation.append(brand, destinations, account);
    globalNavigation.append(navigation);
    return navigation;
  };

  const ensureSignIn = () => {
    let signIn = document.querySelector(`#${SIGNIN_ID}`);
    if (signIn instanceof HTMLElement) return signIn;

    const layout = document.querySelector('[data-testid="root"] > :first-child');
    if (!(layout instanceof HTMLElement)) return null;

    signIn = document.createElement("section");
    signIn.id = SIGNIN_ID;
    signIn.setAttribute("aria-label", "Sign in to Spotify");

    const glow = document.createElement("div");
    glow.className = "nhdtv-spotify-signin-glow";
    glow.setAttribute("aria-hidden", "true");

    const panel = document.createElement("div");
    panel.className = "nhdtv-spotify-signin-panel";

    const mark = document.createElement("div");
    mark.className = "nhdtv-spotify-signin-mark";
    mark.append(icon("M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0Zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02Zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-1.02-.12-1.14-.6-.12-.48.12-1.02.6-1.14C9.6 9.9 15 10.56 18.72 12.84c.36.18.54.78.24 1.2Zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.72 1.02.42 1.56-.3.42-1.02.6-1.56.3Z"));

    const eyebrow = document.createElement("p");
    eyebrow.className = "nhdtv-spotify-signin-eyebrow";
    eyebrow.textContent = "SPOTIFY ON NHD-TV";

    const heading = document.createElement("h1");
    heading.textContent = "Your music, made for the big screen.";

    const description = document.createElement("p");
    description.className = "nhdtv-spotify-signin-description";
    description.textContent = "Sign in once to keep your library, recommendations, and playback ready whenever you come back.";

    const button = document.createElement("button");
    button.className = "nhdtv-spotify-signin-button";
    button.type = "button";
    button.setAttribute(TARGET_ATTRIBUTE, "true");
    button.setAttribute("data-nhdtv-spotify-default", "true");
    button.textContent = "Sign in to Spotify";
    button.addEventListener("click", () => location.assign(authenticationUrl()));

    const hint = document.createElement("p");
    hint.className = "nhdtv-spotify-signin-hint";
    hint.textContent = "Press Select on your remote to continue";

    panel.append(mark, eyebrow, heading, description, button, hint);
    signIn.append(glow, panel);
    layout.append(signIn);
    return signIn;
  };

  const syncAttribute = (attribute, desiredElements) => {
    const desired = new Set(desiredElements);
    document.querySelectorAll(`[${attribute}]`).forEach((element) => {
      if (!desired.has(element)) element.removeAttribute(attribute);
    });
    desired.forEach((element) => {
      if (element.getAttribute(attribute) !== "true") {
        element.setAttribute(attribute, "true");
      }
    });
  };

  const markPrimaryTargets = () => {
    const cards = [];
    const quickCards = [];
    const tracks = [];
    const targets = [...document.querySelectorAll(`#${NAV_ID} [${TARGET_ATTRIBUTE}="true"]`)]
      .filter((element) => element instanceof HTMLElement && isRendered(element));

    for (const card of document.querySelectorAll('[data-encore-id="card"]')) {
      if (!(card instanceof HTMLElement) || !isRendered(card)) continue;
      cards.push(card);
      const rect = card.getBoundingClientRect();
      if (routeKind() === "home" && rect.height <= 160 && rect.width >= rect.height * 1.8) {
        quickCards.push(card);
      }
      const primary = [...card.querySelectorAll("button,a[href]")].find((candidate) =>
        candidate instanceof HTMLElement &&
        candidate.getAttribute("data-testid") !== "play-button" &&
        isRendered(candidate)
      ) ?? card.querySelector('[data-testid="play-button"]');
      if (primary instanceof HTMLElement) targets.push(primary);
    }

    for (const track of document.querySelectorAll('[data-testid="tracklist-row"]')) {
      if (!(track instanceof HTMLElement) || !isRendered(track)) continue;
      tracks.push(track);
      const primary = track.querySelector(
        '[data-testid="internal-track-link"],button[aria-label^="Play"],button[aria-label^="Pause"]'
      );
      if (primary instanceof HTMLElement && isRendered(primary)) {
        targets.push(primary);
      }
    }

    document.querySelectorAll([
      '[data-testid="action-bar"] button',
      '[data-testid="player-controls"] button:not([disabled])',
      '[data-testid="general-controls"] button:not([disabled])',
      '[data-encore-id="chip"]',
      '[data-testid="login-button"]',
      `#${SIGNIN_ID} button`
    ].join(",")).forEach((element) => {
      if (element instanceof HTMLElement && isRendered(element)) {
        targets.push(element);
      }
    });

    document.querySelectorAll('[data-testid="rich-title-row-shelf-header"]').forEach((header) => {
      const links = [...header.querySelectorAll("a[href]")];
      const showAll = links.length > 1 ? links.at(-1) : null;
      if (showAll instanceof HTMLElement && isRendered(showAll)) targets.push(showAll);
    });

    syncAttribute(CARD_ATTRIBUTE, cards);
    syncAttribute(QUICK_ATTRIBUTE, quickCards);
    syncAttribute(TRACK_ATTRIBUTE, tracks);
    syncAttribute(TARGET_ATTRIBUTE, targets);
  };

  const update = () => {
    mutationFrame = null;
    const navigation = ensureNavigation();
    if (!(navigation instanceof HTMLElement)) return;

    const route = routeKind();
    const auth = isSignedOut() ? "signed-out" : "signed-in";
    if (root.getAttribute("data-nhdtv-spotify-route") !== route) {
      root.setAttribute("data-nhdtv-spotify-route", route);
    }
    if (root.getAttribute("data-nhdtv-spotify-auth") !== auth) {
      root.setAttribute("data-nhdtv-spotify-auth", auth);
    }
    const signIn = ensureSignIn();
    if (signIn instanceof HTMLElement && signIn.hidden !== (auth !== "signed-out")) {
      signIn.hidden = auth !== "signed-out";
    }

    navigation.querySelectorAll("[data-nhdtv-spotify-nav]").forEach((destination) => {
      const active = destination.getAttribute("data-nhdtv-spotify-nav") === route;
      if (active && destination.getAttribute("aria-current") !== "page") {
        destination.setAttribute("aria-current", "page");
      } else if (!active && destination.hasAttribute("aria-current")) {
        destination.removeAttribute("aria-current");
      }
    });
    const account = navigation.querySelector(".nhdtv-spotify-account");
    if (account instanceof HTMLButtonElement) {
      const label = auth === "signed-out" ? "Log in" : "Account";
      const accessibleLabel = auth === "signed-out" ? "Log in to Spotify" : "Open Spotify account menu";
      if (account.textContent !== label) account.textContent = label;
      if (account.getAttribute("aria-label") !== accessibleLabel) {
        account.setAttribute("aria-label", accessibleLabel);
      }
    }
    const search = navigation.querySelector(`#${SEARCH_ID}`);
    if (search instanceof HTMLInputElement && route === "search" && search.value.length === 0) {
      const encoded = location.pathname.replace(/^\/search\/?/, "");
      if (encoded.length > 0) {
        try {
          search.value = decodeURIComponent(encoded);
        } catch {
          search.value = "";
        }
      }
    }
    markPrimaryTargets();
  };

  const scheduleUpdate = () => {
    if (mutationFrame !== null) return;
    mutationFrame = requestAnimationFrame(update);
  };

  document.addEventListener("click", (event) => {
    if (!isSignedOut() || !(event.target instanceof Element)) return;
    const play = event.target.closest(
      '[data-testid="play-button"],button[aria-label^="Play "]'
    );
    if (!(play instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(authenticationUrl());
  }, true);

  addEventListener("popstate", scheduleUpdate);
  addEventListener("hashchange", scheduleUpdate);
  const observer = new MutationObserver(scheduleUpdate);
  observer.observe(root, { childList: true, subtree: true });
  scheduleUpdate();
})();
