(() => {
  "use strict";

  const namespace = globalThis.NHDYouTubeTV;
  if (!namespace?.SpatialNavigator || !namespace?.dom || !namespace?.selectors) return;
  if (namespace.controller) return;

  const STYLE_ID = "nhdtv-youtube-tv-styles";
  const RAIL_ID = "nhdtv-tv-rail";
  const PAGE_HEADING_ID = "nhdtv-tv-page-heading";
  const ROOT_CLASS = "nhdtv-tv-mode";
  const HOST_CONFIG_EVENT = "nhdtv-tv-mode-config";
  const VALID_SCALES = new Set(["compact", "standard", "large"]);
  const VALID_SAFE_AREAS = new Set(["compact", "standard", "wide"]);
  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  const RAIL_ITEMS = Object.freeze([
    {
      action: "search",
      icon: "M11 4a7 7 0 1 0 4.9 12l4.55 4.55 1.4-1.4-4.5-4.5A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z",
      label: "Search"
    },
    {
      href: "/",
      icon: "M3 11.2 12 4l9 7.2V21h-6v-6H9v6H3v-9.8Zm2 1V19h2v-6h10v6h2v-6.8l-7-5.6-7 5.6Z",
      label: "Home",
      route: "home"
    },
    {
      href: "/shorts/",
      icon: "m10.5 3.2 5.8-1.1a3 3 0 0 1 2.2 5.5l-2.2 1.2 1.2.2a3 3 0 0 1 .6 5.7l-6.6 3.9a3 3 0 0 1-4-1l-1.1-1.7 3.2-1.9 1 1.6 6.5-3.8a1 1 0 0 0-.2-1.9l-6.2-1.1a3 3 0 0 1-.2-5.9Zm1.2 1.7a1 1 0 0 0 .1 1.9L16 7.5l1.5-.8a1 1 0 0 0-.7-1.8l-5.1 1Z",
      label: "Shorts",
      route: "shorts"
    },
    {
      href: "/feed/subscriptions",
      icon: "M5 5h14v12H5V5Zm2 2v8h10V7H7Zm2 12h6v2H9v-2Z",
      label: "Subscriptions",
      route: "subscriptions"
    },
    {
      href: "/feed/you",
      icon: "M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 8c4.4 0 8 2.2 8 5v3H4v-3c0-2.8 3.6-5 8-5Zm0 2c-3.7 0-6 1.8-6 3v1h12v-1c0-1.2-2.3-3-6-3Z",
      label: "You",
      route: "you"
    }
  ]);
  const PAGE_COPY = Object.freeze({
    home: { eyebrow: "Home", title: "Recommended for you" },
    subscriptions: { eyebrow: "Subscriptions", title: "Latest from channels you follow" },
    you: { eyebrow: "You", title: "Your library" }
  });
  const EXTENSION_ATTRIBUTES = [
    "data-nhdtv-card",
    "data-nhdtv-card-format",
    "data-nhdtv-category",
    "data-nhdtv-extension-active",
    "data-nhdtv-editing",
    "data-nhdtv-focused",
    "data-nhdtv-focus-target",
    "data-nhdtv-fullscreen",
    "data-nhdtv-input-owner",
    "data-nhdtv-managed",
    "data-nhdtv-route",
    "data-nhdtv-safe-area",
    "data-nhdtv-scale",
    "data-nhdtv-shelf",
    "data-nhdtv-shelf-row"
  ];

  class TvModeController {
    #enabled = false;
    #lastUrl = location.href;
    #hostManaged = false;
    #mutationFrame = null;
    #observer = null;
    #rail = null;
    #railTimers = new Set();
    #style = null;
    #preferences = {
      enabled: true,
      safeArea: "standard",
      scale: "standard"
    };

    constructor() {
      this.navigator = new namespace.SpatialNavigator({
        onNeedsMoreContent: () => this.scheduleRefresh()
      });
      this.onMutation = this.onMutation.bind(this);
      this.onRailClick = this.onRailClick.bind(this);
      this.onHostConfig = this.onHostConfig.bind(this);
      this.onFullscreenChanged = this.onFullscreenChanged.bind(this);
      this.onRouteChanged = this.onRouteChanged.bind(this);
      this.onRuntimeMessage = this.onRuntimeMessage.bind(this);
      this.onStorageChanged = this.onStorageChanged.bind(this);
      chrome.storage.onChanged.addListener(this.onStorageChanged);
      chrome.runtime.onMessage.addListener(this.onRuntimeMessage);
      document.addEventListener(HOST_CONFIG_EVENT, this.onHostConfig, true);
    }

    async initialize() {
      // TV Mode defaults on, so install its critical shell before YouTube paints.
      // A persisted disabled preference is reconciled as soon as storage answers.
      this.applyPreferences(this.#preferences);
      const stored = await chrome.storage.local.get({
        tvModeEnabled: true,
        tvModeSafeArea: "standard",
        tvModeScale: "standard"
      });
      if (this.#hostManaged) return;
      this.applyPreferences({
        enabled: stored.tvModeEnabled !== false,
        safeArea: stored.tvModeSafeArea,
        scale: stored.tvModeScale
      });
    }

    applyPreferences(preferences) {
      const enabled = preferences.enabled !== false;
      const safeArea = VALID_SAFE_AREAS.has(preferences.safeArea)
        ? preferences.safeArea
        : "standard";
      const scale = VALID_SCALES.has(preferences.scale)
        ? preferences.scale
        : "standard";
      this.#preferences = { enabled, safeArea, scale };
      this.setEnabled(enabled);
      if (this.#enabled) this.applyRootPreferences();
    }

    applyRootPreferences() {
      const root = document.documentElement;
      root.setAttribute("data-nhdtv-input-owner", this.#hostManaged ? "host" : "browser");
      root.setAttribute("data-nhdtv-managed", String(this.#hostManaged));
      root.setAttribute("data-nhdtv-safe-area", this.#preferences.safeArea);
      root.setAttribute("data-nhdtv-scale", this.#preferences.scale);
    }

    setEnabled(enabled) {
      if (enabled === this.#enabled) return;
      this.#enabled = enabled;
      if (enabled) this.enable();
      else this.disable();
    }

    enable() {
      const root = document.documentElement;
      this.#lastUrl = location.href;
      document.querySelector(`#${STYLE_ID}`)?.remove();
      this.#style = document.createElement("link");
      this.#style.id = STYLE_ID;
      this.#style.rel = "stylesheet";
      this.#style.href = chrome.runtime.getURL("styles/tv.css");
      (document.head ?? root).append(this.#style);

      root.classList.add(ROOT_CLASS);
      root.setAttribute("data-nhdtv-extension-active", "true");
      root.setAttribute("data-nhdtv-route", namespace.dom.routeKind());
      this.applyRootPreferences();

      document.addEventListener("yt-navigate-start", this.onRouteChanged, true);
      document.addEventListener("yt-navigate-finish", this.onRouteChanged, true);
      document.addEventListener("fullscreenchange", this.onFullscreenChanged, true);
      window.addEventListener("popstate", this.onRouteChanged);
      window.addEventListener("hashchange", this.onRouteChanged);

      this.#observer = new MutationObserver(this.onMutation);
      this.#observer.observe(document.documentElement, { childList: true, subtree: true });
      this.navigator.start();
      this.onFullscreenChanged();
      this.refreshAnnotations();
    }

    disable() {
      document.removeEventListener("yt-navigate-start", this.onRouteChanged, true);
      document.removeEventListener("yt-navigate-finish", this.onRouteChanged, true);
      document.removeEventListener("fullscreenchange", this.onFullscreenChanged, true);
      window.removeEventListener("popstate", this.onRouteChanged);
      window.removeEventListener("hashchange", this.onRouteChanged);
      this.#observer?.disconnect();
      this.#observer = null;
      if (this.#mutationFrame !== null) cancelAnimationFrame(this.#mutationFrame);
      this.#mutationFrame = null;
      this.navigator.stop();

      for (const timer of this.#railTimers) clearTimeout(timer);
      this.#railTimers.clear();
      this.#rail?.removeEventListener("click", this.onRailClick);
      this.#rail?.remove();
      document.querySelector(`#${RAIL_ID}`)?.remove();
      this.#rail = null;
      document.querySelector(`#${PAGE_HEADING_ID}`)?.remove();

      this.#style?.remove();
      document.querySelector(`#${STYLE_ID}`)?.remove();
      this.#style = null;

      const root = document.documentElement;
      root.classList.remove(ROOT_CLASS);
      for (const attribute of EXTENSION_ATTRIBUTES) {
        root.removeAttribute(attribute);
        document.querySelectorAll(`[${attribute}]`).forEach((element) => element.removeAttribute(attribute));
      }
    }

    onStorageChanged(changes, areaName) {
      if (areaName !== "local" || this.#hostManaged) return;
      if (!["tvModeEnabled", "tvModeSafeArea", "tvModeScale"].some((key) => key in changes)) return;
      this.applyPreferences({
        enabled: changes.tvModeEnabled?.newValue ?? this.#preferences.enabled,
        safeArea: changes.tvModeSafeArea?.newValue ?? this.#preferences.safeArea,
        scale: changes.tvModeScale?.newValue ?? this.#preferences.scale
      });
    }

    onHostConfig(event) {
      if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== "object") return;
      this.#hostManaged = true;
      this.navigator.setInputOwner("host");
      this.applyPreferences(event.detail);
      event.preventDefault();
    }

    onRuntimeMessage(message, _sender, sendResponse) {
      if (message?.type !== "nhdtv:get-diagnostics") return false;
      sendResponse(this.diagnostics());
      return false;
    }

    onRouteChanged() {
      if (!this.#enabled) return;
      const changed = this.#lastUrl !== location.href;
      this.#lastUrl = location.href;
      document.documentElement.setAttribute("data-nhdtv-route", namespace.dom.routeKind());
      if (changed) this.navigator.routeChanged();
      this.scheduleRefresh();
    }

    onFullscreenChanged() {
      if (!this.#enabled) return;
      document.documentElement.setAttribute(
        "data-nhdtv-fullscreen",
        String(document.fullscreenElement !== null)
      );
    }

    onMutation() {
      if (!this.#enabled) return;
      if (this.#lastUrl !== location.href) this.onRouteChanged();
      else this.scheduleRefresh();
    }

    scheduleRefresh() {
      if (this.#mutationFrame !== null || !this.#enabled) return;
      this.#mutationFrame = requestAnimationFrame(() => {
        this.#mutationFrame = null;
        this.refreshAnnotations();
        this.navigator.domChanged();
      });
    }

    refreshAnnotations() {
      const { selectors } = namespace;
      this.ensureRail();
      this.updateRailState();
      this.ensurePageHeading();
      for (const card of document.querySelectorAll(selectors.cards)) {
        if (!(card instanceof HTMLElement)) continue;
        card.setAttribute("data-nhdtv-card", "true");
        const href = card.querySelector("a[href^='/shorts/']")?.getAttribute("href") ?? "";
        card.setAttribute("data-nhdtv-card-format", href.startsWith("/shorts/") ? "portrait" : "landscape");
      }

      for (const shelf of document.querySelectorAll(selectors.shelves)) {
        if (shelf instanceof HTMLElement) shelf.setAttribute("data-nhdtv-shelf", "true");
      }

      for (const category of document.querySelectorAll(selectors.categoryTabs)) {
        if (category instanceof HTMLElement) category.setAttribute("data-nhdtv-category", "true");
      }

      const directCards = [...document.querySelectorAll(
        "ytd-rich-grid-renderer > #contents > ytd-rich-item-renderer"
      )].filter((element) => element instanceof HTMLElement && namespace.dom.isRendered(element));
      const rows = [];
      for (const card of directCards) {
        const top = card.getBoundingClientRect().top;
        let row = rows.findIndex((rowTop) => Math.abs(rowTop - top) <= 36);
        if (row < 0) {
          rows.push(top);
          row = rows.length - 1;
        }
        card.setAttribute("data-nhdtv-shelf-row", String(row));
      }
    }

    createRailIcon(pathData) {
      const svg = document.createElementNS(SVG_NAMESPACE, "svg");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.classList.add("nhdtv-tv-rail-icon");
      const path = document.createElementNS(SVG_NAMESPACE, "path");
      path.setAttribute("d", pathData);
      svg.append(path);
      return svg;
    }

    createRailItem(item) {
      const control = item.href
        ? document.createElement("a")
        : document.createElement("button");
      control.className = "nhdtv-tv-rail-item";
      control.setAttribute("aria-label", item.label);
      control.dataset.nhdtvRailLabel = item.label;
      if (item.href) control.setAttribute("href", item.href);
      if (item.route) control.dataset.nhdtvRailRoute = item.route;
      if (item.action) {
        control.dataset.nhdtvRailAction = item.action;
        control.type = "button";
      }
      control.append(this.createRailIcon(item.icon));
      const label = document.createElement("span");
      label.className = "nhdtv-tv-rail-label";
      label.textContent = item.label;
      control.append(label);
      return control;
    }

    ensureRail() {
      if (!this.#enabled || !document.body) return;
      const existing = document.querySelector(`#${RAIL_ID}`);
      if (existing instanceof HTMLElement) {
        this.#rail = existing;
        return;
      }

      const rail = document.createElement("nav");
      rail.id = RAIL_ID;
      rail.setAttribute("aria-label", "YouTube TV navigation");
      rail.setAttribute("data-nhdtv-extension-ui", "true");

      const brand = document.createElement("div");
      brand.className = "nhdtv-tv-rail-brand";
      brand.setAttribute("aria-hidden", "true");
      const brandMark = document.createElement("span");
      brandMark.className = "nhdtv-tv-rail-brand-mark";
      brandMark.textContent = "TV";
      const brandLabel = document.createElement("span");
      brandLabel.className = "nhdtv-tv-rail-brand-label";
      brandLabel.textContent = "TV Mode";
      brand.append(brandMark, brandLabel);

      const items = document.createElement("div");
      items.className = "nhdtv-tv-rail-items";
      for (const item of RAIL_ITEMS) items.append(this.createRailItem(item));

      const hint = document.createElement("div");
      hint.className = "nhdtv-tv-rail-hint";
      hint.setAttribute("aria-hidden", "true");
      hint.textContent = "Arrows · Enter · Back";

      rail.append(brand, items, hint);
      rail.addEventListener("click", this.onRailClick);
      document.body.prepend(rail);
      this.#rail = rail;
    }

    updateRailState() {
      if (!(this.#rail instanceof HTMLElement)) return;
      const route = namespace.dom.routeKind();
      const path = location.pathname;
      for (const item of this.#rail.querySelectorAll("[data-nhdtv-rail-route]")) {
        const itemRoute = item.getAttribute("data-nhdtv-rail-route");
        const active = itemRoute === route || (itemRoute === "you" && path.startsWith("/feed/you"));
        if (active) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      }
      const search = this.#rail.querySelector("[data-nhdtv-rail-action='search']");
      if (route === "results") search?.setAttribute("aria-current", "page");
      else search?.removeAttribute("aria-current");
    }

    ensurePageHeading() {
      const route = namespace.dom.routeKind();
      const query = new URL(location.href).searchParams.get("search_query")?.replace(/\s+/g, " ").trim();
      const copy = route === "results"
        ? { eyebrow: "Search", title: query ? `Results for “${query.slice(0, 72)}”` : "Search results" }
        : PAGE_COPY[route];
      const existing = document.querySelector(`#${PAGE_HEADING_ID}`);
      if (!copy) {
        existing?.remove();
        return;
      }

      const pageSurfaceSelector = route === "results" ? "ytd-search" : "ytd-browse";
      const pageSurface = [...document.querySelectorAll(pageSurfaceSelector)].find((element) =>
        element instanceof HTMLElement && namespace.dom.isRendered(element)
      );
      if (!(pageSurface instanceof HTMLElement)) return;
      const gridHeader = pageSurface.querySelector("ytd-rich-grid-renderer > #header");
      const resultsPrimary = route === "results" ? pageSurface.querySelector(":scope > #container > #primary") : null;
      const mount = resultsPrimary instanceof HTMLElement
        ? resultsPrimary
        : gridHeader instanceof HTMLElement
          ? gridHeader
          : pageSurface;

      let heading = existing;
      if (!(heading instanceof HTMLElement)) {
        heading = document.createElement("section");
        heading.id = PAGE_HEADING_ID;
        heading.setAttribute("aria-labelledby", "nhdtv-tv-page-title");
        heading.setAttribute("data-nhdtv-extension-ui", "true");
        const eyebrow = document.createElement("span");
        eyebrow.className = "nhdtv-tv-page-eyebrow";
        const title = document.createElement("h1");
        title.id = "nhdtv-tv-page-title";
        heading.append(eyebrow, title);
      }

      const eyebrow = heading.querySelector(".nhdtv-tv-page-eyebrow");
      const title = heading.querySelector("#nhdtv-tv-page-title");
      if (eyebrow && eyebrow.textContent !== copy.eyebrow) eyebrow.textContent = copy.eyebrow;
      if (title && title.textContent !== copy.title) title.textContent = copy.title;
      if (heading.parentElement !== mount) mount.prepend(heading);
    }

    visibleElement(selector) {
      return [...document.querySelectorAll(selector)].find((element) =>
        element instanceof HTMLElement && namespace.dom.isRendered(element)
      ) ?? null;
    }

    focusSearch() {
      const focusField = () => {
        const field = this.visibleElement(namespace.selectors.searchFields);
        if (!(field instanceof HTMLElement)) return false;
        field.focus({ preventScroll: true });
        return document.activeElement === field;
      };
      if (focusField()) return;

      const launcher = this.visibleElement(namespace.selectors.searchLaunchers);
      if (launcher instanceof HTMLElement) launcher.click();
      for (const delay of [0, 80, 220, 500]) {
        const timer = setTimeout(() => {
          this.#railTimers.delete(timer);
          if (this.#enabled) focusField();
        }, delay);
        this.#railTimers.add(timer);
      }
    }

    onRailClick(event) {
      const target = event.target instanceof Element
        ? event.target.closest(".nhdtv-tv-rail-item")
        : null;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.nhdtvRailAction === "search") {
        event.preventDefault();
        this.focusSearch();
        return;
      }

      if (!(target instanceof HTMLAnchorElement)) return;
      target.blur();
      const destination = new URL(target.href, location.origin);
      const nativeTarget = [...document.querySelectorAll(`a[href='${CSS.escape(destination.pathname + destination.search)}']`)]
        .find((candidate) => candidate instanceof HTMLAnchorElement && candidate.closest(`#${RAIL_ID}`) === null);
      if (nativeTarget instanceof HTMLAnchorElement) {
        event.preventDefault();
        nativeTarget.click();
      }
    }

    diagnostics() {
      const navigator = this.navigator.diagnostics();
      return {
        active: this.#enabled,
        cards: document.querySelectorAll(namespace.selectors.cards).length,
        categories: document.querySelectorAll(namespace.selectors.categoryTabs).length,
        candidates: this.#enabled ? this.navigator.candidates().length : 0,
        dialogs: document.querySelectorAll(namespace.selectors.dialogs).length,
        focused: document.querySelectorAll("[data-nhdtv-focused='true']").length,
        hostManaged: this.#hostManaged,
        inputOwner: navigator.inputOwner,
        playerFirst: navigator.playerFirst,
        route: namespace.dom.routeKind(),
        rail: document.querySelectorAll(`#${RAIL_ID}`).length,
        pageHeading: document.querySelector(`#${PAGE_HEADING_ID}`)?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        safeArea: this.#preferences.safeArea,
        scale: this.#preferences.scale,
        shelves: document.querySelectorAll(namespace.selectors.shelves).length,
        url: location.href
      };
    }
  }

  namespace.controller = new TvModeController();
  void namespace.controller.initialize();
})();
