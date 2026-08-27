(() => {
  "use strict";

  const namespace = globalThis.NHDYouTubeTV;
  if (!namespace?.dom || !namespace?.selectors) return;

  const { dom, selectors } = namespace;
  const FOCUS_ATTRIBUTE = "data-nhdtv-focused";
  const TARGET_ATTRIBUTE = "data-nhdtv-focus-target";
  const EDITING_ATTRIBUTE = "data-nhdtv-editing";
  const RESTORE_KEY = "nhdtv.youtube.focus.v2";
  const MAX_RESTORE_ROUTES = 20;
  const RESTORE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
  const DIRECTION_REPEAT_DELAY_MS = 380;
  const DIRECTION_REPEAT_INTERVAL_MS = 115;
  const GAMEPAD_DEAD_ZONE = 0.62;

  const center = (rect) => ({
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  });

  const overlap = (aStart, aEnd, bStart, bEnd) =>
    Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

  const horizontalScore = (direction, current, candidate) => {
    const from = center(current);
    const to = center(candidate);
    const deltaX = to.x - from.x;
    const deltaY = Math.abs(to.y - from.y);
    const forward = direction === "left" ? deltaX < -8 : deltaX > 8;
    if (!forward) return Number.POSITIVE_INFINITY;

    const verticalOverlap = overlap(current.top, current.bottom, candidate.top, candidate.bottom);
    const sameShelf = verticalOverlap >= Math.min(current.height, candidate.height) * 0.35;
    return sameShelf ? Math.abs(deltaX) * 3 + deltaY : Number.POSITIVE_INFINITY;
  };

  const verticalScore = (direction, current, candidate, desiredX) => {
    const from = center(current);
    const to = center(candidate);
    const deltaY = to.y - from.y;
    const forward = direction === "up" ? deltaY < -8 : deltaY > 8;
    if (!forward) return Number.POSITIVE_INFINITY;

    const horizontalOverlap = overlap(current.left, current.right, candidate.left, candidate.right);
    const aligned = horizontalOverlap >= Math.min(current.width, candidate.width) * 0.12;
    const crossDistance = Math.abs(to.x - desiredX);
    return Math.abs(deltaY) * 3 + crossDistance * 1.25 + (aligned ? 0 : 900);
  };

  const gamepadButtonPressed = (gamepad, index) =>
    gamepad.buttons[index]?.pressed === true || (gamepad.buttons[index]?.value ?? 0) > 0.6;

  const gamepadActionsFor = (gamepad) => {
    const actions = [];
    const dpadX = Number(gamepadButtonPressed(gamepad, 15)) - Number(gamepadButtonPressed(gamepad, 14));
    const dpadY = Number(gamepadButtonPressed(gamepad, 13)) - Number(gamepadButtonPressed(gamepad, 12));
    const axisX = gamepad.axes[0] ?? 0;
    const axisY = gamepad.axes[1] ?? 0;
    const x = dpadX !== 0 ? dpadX : Math.abs(axisX) >= GAMEPAD_DEAD_ZONE ? axisX : 0;
    const y = dpadY !== 0 ? dpadY : Math.abs(axisY) >= GAMEPAD_DEAD_ZONE ? axisY : 0;

    if (Math.abs(x) > Math.abs(y)) actions.push(x < 0 ? "left" : "right");
    else if (y !== 0) actions.push(y < 0 ? "up" : "down");
    if (gamepadButtonPressed(gamepad, 0)) actions.push("select");
    if (gamepadButtonPressed(gamepad, 1)) actions.push("back");
    return actions;
  };

  const candidatePriority = (element) => {
    if (element.matches("button,input,textarea,select,summary")) return 4;
    if (element instanceof HTMLAnchorElement && element.hasAttribute("href")) return 4;
    if (["button", "link", "menuitem", "option", "tab"].includes(element.getAttribute("role"))) return 3;
    return element.tabIndex >= 0 ? 2 : 0;
  };

  const frameFor = (element) =>
    element.closest(selectors.cards) ??
    element.closest(selectors.guideEntries) ??
    element;

  const routeUrl = (url = location.href) => {
    try {
      const parsed = new URL(url, location.origin);
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return url;
    }
  };

  const accessibleName = (element) => (
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    element.textContent ||
    ""
  ).replace(/\s+/g, " ").trim().slice(0, 180);

  const elementIdentity = (element) => ({
    href: dom.normalizedHref(element),
    name: accessibleName(element),
    tag: element.tagName
  });

  const readRestoreLedger = () => {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(RESTORE_KEY) ?? "null");
      if (
        parsed &&
        typeof parsed === "object" &&
        parsed.routes &&
        typeof parsed.routes === "object"
      ) {
        return parsed;
      }
    } catch {
      // Storage can be unavailable in hardened browsing contexts.
    }
    return { routes: {} };
  };

  const writeRestoreLedger = (state) => {
    try {
      sessionStorage.setItem(RESTORE_KEY, JSON.stringify(state));
    } catch {
      // Focus restoration is best-effort and never blocks navigation.
    }
  };

  const clearRestoreState = () => {
    try {
      sessionStorage.removeItem(RESTORE_KEY);
    } catch {
      // Nothing else is required when storage is unavailable.
    }
  };

  class SpatialNavigator {
    #active = false;
    #current = null;
    #desiredX = null;
    #gamepadFrame = null;
    #gamepadPressed = new Map();
    #lastContentTarget = null;
    #pendingRetry = null;
    #restoreTimers = new Set();
    #inputOwner = "browser";
    #gamepadListenersActive = false;

    constructor(options = {}) {
      this.onNeedsMoreContent = options.onNeedsMoreContent ?? (() => undefined);
      this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

      this.onClick = this.onClick.bind(this);
      this.onFocusIn = this.onFocusIn.bind(this);
      this.onFocusOut = this.onFocusOut.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
      this.onRemoteAction = this.onRemoteAction.bind(this);
      this.onGamepadConnected = this.onGamepadConnected.bind(this);
      this.onGamepadDisconnected = this.onGamepadDisconnected.bind(this);
      this.pollGamepads = this.pollGamepads.bind(this);
    }

    start() {
      if (this.#active) return;
      this.#active = true;
      document.addEventListener("click", this.onClick, true);
      document.addEventListener("focusin", this.onFocusIn, true);
      document.addEventListener("focusout", this.onFocusOut, true);
      document.addEventListener("keydown", this.onKeyDown, true);
      document.addEventListener("nhdtv-remote-action", this.onRemoteAction, true);
      this.updateGamepadLifecycle();
      this.restoreSoon();
    }

    stop() {
      if (!this.#active) return;
      this.#active = false;
      document.removeEventListener("click", this.onClick, true);
      document.removeEventListener("focusin", this.onFocusIn, true);
      document.removeEventListener("focusout", this.onFocusOut, true);
      document.removeEventListener("keydown", this.onKeyDown, true);
      document.removeEventListener("nhdtv-remote-action", this.onRemoteAction, true);
      this.stopGamepadPolling();
      this.removeGamepadListeners();
      if (this.#pendingRetry !== null) clearTimeout(this.#pendingRetry);
      for (const timer of this.#restoreTimers) clearTimeout(timer);
      this.#restoreTimers.clear();
      this.#gamepadPressed.clear();
      this.#gamepadFrame = null;
      this.#pendingRetry = null;
      this.clearFocus();
      clearRestoreState();
    }

    setInputOwner(owner) {
      const normalized = owner === "host" ? "host" : "browser";
      if (normalized === this.#inputOwner) return;
      this.#inputOwner = normalized;
      if (this.#active) this.updateGamepadLifecycle();
    }

    diagnostics() {
      const gamepads = this.connectedGamepads();
      return {
        focusName: this.#current instanceof HTMLElement ? accessibleName(this.#current) : null,
        gamepads: gamepads.map((gamepad) => ({
          id: gamepad.id,
          index: gamepad.index,
          mapping: gamepad.mapping
        })),
        inputOwner: this.#inputOwner,
        playerFirst: this.isPlayerFirstContext()
      };
    }

    clearFocus() {
      document.querySelectorAll(`[${FOCUS_ATTRIBUTE}],[${TARGET_ATTRIBUTE}]`).forEach((element) => {
        element.removeAttribute(FOCUS_ATTRIBUTE);
        element.removeAttribute(TARGET_ATTRIBUTE);
      });
      this.clearEditableFocus();
      this.#current = null;
      this.#desiredX = null;
    }

    clearEditableFocus() {
      const root = document.documentElement;
      root.removeAttribute(EDITING_ATTRIBUTE);
      root.style.removeProperty("--nhdtv-edit-height");
      root.style.removeProperty("--nhdtv-edit-left");
      root.style.removeProperty("--nhdtv-edit-top");
      root.style.removeProperty("--nhdtv-edit-width");
    }

    showEditableFocus(element) {
      if (!(element instanceof HTMLElement) || !element.isConnected) return;
      const update = () => {
        if (!this.#active || document.activeElement !== element || !element.isConnected) return;
        const rect = element.getBoundingClientRect();
        const root = document.documentElement;
        root.setAttribute(EDITING_ATTRIBUTE, "true");
        root.style.setProperty("--nhdtv-edit-height", `${rect.height}px`);
        root.style.setProperty("--nhdtv-edit-left", `${rect.left}px`);
        root.style.setProperty("--nhdtv-edit-top", `${rect.top}px`);
        root.style.setProperty("--nhdtv-edit-width", `${rect.width}px`);
      };
      update();
      requestAnimationFrame(update);
    }

    routeChanged() {
      this.clearFocus();
      this.restoreSoon();
    }

    domChanged() {
      if (this.#current && !this.#current.isConnected) this.#current = null;
      if (dom.isEditable(document.activeElement) || dom.isPlayerTarget(document.activeElement)) return;
      if (this.restoreStateForRoute() !== null) this.restoreSoon([80]);
    }

    candidates() {
      const modal = dom.visibleDialog();
      const root = modal ?? document;
      let candidates = [...root.querySelectorAll(selectors.candidates)].filter((element) =>
        element instanceof HTMLElement &&
        dom.isRendered(element) &&
        !dom.isPlayerTarget(element)
      );

      if (modal instanceof HTMLElement) {
        candidates = candidates.filter((element) => element !== modal && modal.contains(element));
      }

      candidates = candidates.filter((element, _index, all) => {
        const priority = candidatePriority(element);
        const rect = element.getBoundingClientRect();
        const area = rect.width * rect.height;
        return !all.some((descendant) => {
          if (descendant === element || !element.contains(descendant)) return false;
          const descendantPriority = candidatePriority(descendant);
          if (descendantPriority > priority) return true;
          if (descendantPriority < priority) return false;
          const descendantRect = descendant.getBoundingClientRect();
          return descendantRect.width * descendantRect.height < area * 0.9;
        });
      });

      if (modal === null) {
        const allowedCardTargets = new Set();
        const cardGroups = new Map();
        for (const candidate of candidates) {
          const card = candidate.closest(selectors.cards);
          if (!(card instanceof HTMLElement)) continue;
          const group = cardGroups.get(card) ?? [];
          group.push(candidate);
          cardGroups.set(card, group);
        }

        for (const [card, group] of cardGroups) {
          const isAdvertisement = card.querySelector(
            "ytd-ad-slot-renderer,ytd-display-ad-renderer,ytd-in-feed-ad-layout-renderer"
          ) !== null;
          if (isAdvertisement) {
            group.forEach((element) => allowedCardTargets.add(element));
            continue;
          }

          const preferred = [...card.querySelectorAll(selectors.primaryCardLinks)]
            .find((element) => group.includes(element) && dom.isRendered(element));
          allowedCardTargets.add(preferred ?? group[0]);
        }

        candidates = candidates.filter((element) => {
          const card = element.closest(selectors.cards);
          return card === null || allowedCardTargets.has(element);
        });
      }

      return [...new Set(candidates)];
    }

    initialCandidate(candidates, direction) {
      const nonGuide = candidates.filter((element) => element.closest(selectors.guideRoots) === null);
      const visibleCategories = nonGuide.filter((element) =>
        element.matches(selectors.categoryTabs) &&
        element.getBoundingClientRect().bottom > 0 &&
        element.getBoundingClientRect().top < innerHeight
      );
      if (direction === "up" && visibleCategories.length > 0) {
        return visibleCategories.find((element) => element.getAttribute("aria-selected") === "true") ??
          visibleCategories[0];
      }
      const cardTargets = nonGuide.filter((element) => element.closest(selectors.cards) !== null);
      const visibleCards = cardTargets.filter((element) => {
        const rect = frameFor(element).getBoundingClientRect();
        return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
      });
      const pool = visibleCards.length > 0
        ? visibleCards
        : cardTargets.length > 0
          ? cardTargets
          : nonGuide.length > 0
            ? nonGuide
            : candidates;
      const viewportCenterX = innerWidth / 2;

      return [...pool].sort((left, right) => {
        const a = left.getBoundingClientRect();
        const b = right.getBoundingClientRect();
        return a.top - b.top || Math.abs(center(a).x - viewportCenterX) - Math.abs(center(b).x - viewportCenterX);
      })[0] ?? null;
    }

    applyFocus(element, options = {}) {
      if (!(element instanceof HTMLElement) || !element.isConnected) return false;
      document.querySelectorAll(`[${FOCUS_ATTRIBUTE}],[${TARGET_ATTRIBUTE}]`).forEach((focused) => {
        focused.removeAttribute(FOCUS_ATTRIBUTE);
        focused.removeAttribute(TARGET_ATTRIBUTE);
      });
      this.clearEditableFocus();

      if (dom.isEditable(element)) {
        element.focus({ preventScroll: true });
        this.#current = null;
        this.#desiredX = center(element.getBoundingClientRect()).x;
        element.scrollIntoView({
          behavior: this.reducedMotion ? "auto" : "smooth",
          block: "center",
          inline: "center"
        });
        this.showEditableFocus(element);
        return true;
      }

      const frame = frameFor(element);
      const inGuide = element.closest(selectors.guideRoots) !== null;
      const inCategories = element.matches(selectors.categoryTabs);
      frame.setAttribute(FOCUS_ATTRIBUTE, "true");
      element.setAttribute(TARGET_ATTRIBUTE, "true");
      this.#current = element;
      element.focus({ preventScroll: true });
      if (!inGuide) this.#lastContentTarget = element;
      this.rememberRouteFocus(element);

      const rect = frame.getBoundingClientRect();
      if (options.preserveColumn !== true || this.#desiredX === null) this.#desiredX = center(rect).x;
      if (inGuide) {
        const guide = element.closest(selectors.guideRoots);
        if (guide instanceof HTMLElement) {
          guide.scrollLeft = 0;
          if (guide.id === "nhdtv-tv-rail") guide.scrollTop = 0;
        }
        return true;
      }
      if (inCategories) {
        element.scrollIntoView({
          behavior: this.reducedMotion ? "auto" : "smooth",
          block: "nearest",
          inline: "center"
        });
        return true;
      }
      frame.scrollIntoView({
        behavior: this.reducedMotion ? "auto" : "smooth",
        block: "center",
        inline: "center"
      });
      return true;
    }

    move(direction) {
      const candidates = this.candidates();
      if (candidates.length === 0) return false;

      let current = candidates.includes(this.#current) ? this.#current : null;
      if (current === null && document.activeElement instanceof HTMLElement && candidates.includes(document.activeElement)) {
        current = document.activeElement;
      }
      if (current === null) return this.applyFocus(this.initialCandidate(candidates, direction));

      const currentRect = current.getBoundingClientRect();
      const currentInGuide = current.closest(selectors.guideRoots) !== null;
      if (currentInGuide && direction === "right") {
        if (
          this.#lastContentTarget instanceof HTMLElement &&
          this.#lastContentTarget.isConnected &&
          candidates.includes(this.#lastContentTarget)
        ) {
          return this.applyFocus(this.#lastContentTarget);
        }
        const nearestContent = candidates
          .filter((candidate) => candidate.closest(selectors.guideRoots) === null)
          .sort((left, right) =>
            Math.abs(center(left.getBoundingClientRect()).y - center(currentRect).y) -
            Math.abs(center(right.getBoundingClientRect()).y - center(currentRect).y)
          )[0];
        if (nearestContent instanceof HTMLElement) return this.applyFocus(nearestContent);
      }
      const desiredX = this.#desiredX ?? center(currentRect).x;
      let best = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const candidate of candidates) {
        if (candidate === current) continue;
        const candidateInGuide = candidate.closest(selectors.guideRoots) !== null;
        const candidateRect = candidate.getBoundingClientRect();
        let score;

        if (direction === "left" || direction === "right") {
          if (currentInGuide && direction === "right" && candidateInGuide) continue;
          if (!currentInGuide && direction === "right" && candidateInGuide) continue;
          score = horizontalScore(direction, currentRect, candidateRect);
          if (currentInGuide !== candidateInGuide) score += 240;
        } else {
          if (currentInGuide !== candidateInGuide) continue;
          score = verticalScore(direction, currentRect, candidateRect, desiredX);
        }

        if (score < bestScore) {
          best = candidate;
          bestScore = score;
        }
      }

      if (best instanceof HTMLElement) {
        return this.applyFocus(best, { preserveColumn: direction === "up" || direction === "down" });
      }

      if (!currentInGuide && direction === "left") {
        const guideTarget = candidates
          .filter((candidate) => candidate.closest(selectors.guideRoots) !== null)
          .sort((a, b) => Math.abs(center(a.getBoundingClientRect()).y - center(currentRect).y) - Math.abs(center(b.getBoundingClientRect()).y - center(currentRect).y))[0];
        if (guideTarget instanceof HTMLElement) return this.applyFocus(guideTarget);
      }

      this.requestMoreContent(direction, current);
      return true;
    }

    requestMoreContent(direction, current) {
      if (this.#pendingRetry !== null) return;
      const shelf = current.closest(selectors.shelves);
      const categoryRoot = current.closest(selectors.categoryBars);
      const categoryScroller = categoryRoot instanceof HTMLElement
        ? categoryRoot.matches(selectors.categoryScrollers)
          ? categoryRoot
          : categoryRoot.querySelector(selectors.categoryScrollers)
        : null;
      const horizontalScroller = categoryScroller instanceof HTMLElement &&
        categoryScroller.scrollWidth > categoryScroller.clientWidth + 12
        ? categoryScroller
        : shelf instanceof HTMLElement && shelf.scrollWidth > shelf.clientWidth + 12
          ? shelf
          : null;
      if ((direction === "left" || direction === "right") && horizontalScroller instanceof HTMLElement) {
        horizontalScroller.scrollBy({
          behavior: this.reducedMotion ? "auto" : "smooth",
          left: (direction === "left" ? -1 : 1) * Math.max(320, horizontalScroller.clientWidth * 0.72)
        });
      } else if (direction === "up" || direction === "down") {
        scrollBy({
          behavior: this.reducedMotion ? "auto" : "smooth",
          top: (direction === "up" ? -1 : 1) * Math.max(420, innerHeight * 0.72)
        });
      }

      this.onNeedsMoreContent(direction);
      this.#pendingRetry = setTimeout(() => {
        this.#pendingRetry = null;
        if (this.#active && this.#current === current && current.isConnected) this.move(direction);
      }, 260);
    }

    activate() {
      const candidates = this.candidates();
      const current = candidates.includes(this.#current) ? this.#current : null;
      if (!(current instanceof HTMLElement)) {
        return this.applyFocus(this.initialCandidate(candidates, "down"));
      }

      if (dom.isEditable(current)) {
        current.focus();
        return true;
      }

      this.rememberBeforeNavigation(current);
      current.click();
      return true;
    }

    goBack() {
      const dialog = dom.visibleDialog();
      if (dialog instanceof HTMLElement) {
        const close = [...dialog.querySelectorAll("button,[role='button'],[role='menuitem']")].find((element) => {
          const name = accessibleName(element);
          return dom.isRendered(element) && /^(close|cancel|back|dismiss|done)(?:\s|$)/i.test(name);
        });
        if (close instanceof HTMLElement) {
          close.click();
          return true;
        }
        return false;
      }

      if (this.#current?.closest(selectors.guideRoots) !== null && this.#lastContentTarget?.isConnected) {
        return this.applyFocus(this.#lastContentTarget);
      }

      if (routeUrl() === "/") return false;
      history.back();
      return true;
    }

    handleAction(action, source = "host") {
      if (!this.#active) return false;
      const active = document.activeElement;
      if (dom.visibleDialog() === null && (dom.isEditable(active) || dom.isPlayerTarget(active))) return false;
      if (this.isPlayerFirstContext()) {
        if (action === "back" && source === "gamepad") {
          if (routeUrl() !== "/") history.back();
          return routeUrl() !== "/";
        }
        return false;
      }
      if (["up", "down", "left", "right"].includes(action)) return this.move(action);
      if (action === "select") return this.activate();
      if (action === "back") return this.goBack();
      return false;
    }

    isPlayerFirstContext() {
      return dom.isPlaybackRoute() && dom.visibleDialog() === null && this.#current === null;
    }

    rememberRouteFocus(element) {
      if (
        !(element instanceof HTMLElement) ||
        dom.isPlaybackRoute() ||
        element.closest(selectors.guideRoots) !== null
      ) return;
      const candidates = this.candidates();
      const index = candidates.indexOf(element);
      const shelf = element.closest(selectors.shelves);
      const shelfCandidates = shelf instanceof HTMLElement
        ? candidates.filter((candidate) => shelf.contains(candidate))
        : [];
      const ledger = readRestoreLedger();
      const routes = Object.fromEntries(
        Object.entries(ledger.routes)
          .filter(([, state]) => Date.now() - Number(state?.updatedAt ?? 0) <= RESTORE_MAX_AGE_MS)
          .sort(([, left], [, right]) => Number(right?.updatedAt ?? 0) - Number(left?.updatedAt ?? 0))
          .slice(0, MAX_RESTORE_ROUTES - 1)
      );
      routes[routeUrl()] = {
        candidateIndex: index,
        shelfIndex: shelfCandidates.indexOf(element),
        shelfName: shelf instanceof HTMLElement ? accessibleName(shelf).slice(0, 120) : "",
        target: elementIdentity(element),
        updatedAt: Date.now()
      };
      writeRestoreLedger({ routes });
    }

    rememberBeforeNavigation(element) {
      if (element instanceof HTMLElement) this.rememberRouteFocus(element);
    }

    restoreStateForRoute() {
      const state = readRestoreLedger().routes[routeUrl()] ?? null;
      if (state === null || Date.now() - Number(state.updatedAt ?? 0) > RESTORE_MAX_AGE_MS) return null;
      return state;
    }

    restoreSoon(delays = [80, 280, 720, 1600]) {
      if (dom.isPlaybackRoute()) return;
      const restoreUrl = routeUrl();
      const state = this.restoreStateForRoute();
      if (state === null) return;
      for (const delay of delays) {
        const timer = setTimeout(() => {
          this.#restoreTimers.delete(timer);
          if (
            !this.#active ||
            this.#current !== null ||
            routeUrl() !== restoreUrl ||
            dom.isEditable(document.activeElement) ||
            dom.isPlayerTarget(document.activeElement)
          ) return;
          const candidates = this.candidates();
          let match = candidates.find((candidate) => {
            const identity = elementIdentity(candidate);
            return (
              (state.target.href && identity.href === state.target.href) ||
              (state.target.name && identity.name === state.target.name && identity.tag === state.target.tag)
            );
          });
          if (!(match instanceof HTMLElement) && state.shelfName) {
            const shelf = [...document.querySelectorAll(selectors.shelves)].find((candidate) =>
              candidate instanceof HTMLElement && accessibleName(candidate).slice(0, 120) === state.shelfName
            );
            const shelfCandidates = shelf instanceof HTMLElement
              ? candidates.filter((candidate) => shelf.contains(candidate))
              : [];
            match = shelfCandidates[state.shelfIndex] ?? null;
          }
          if (!(match instanceof HTMLElement)) match = candidates[state.candidateIndex] ?? null;
          if (match instanceof HTMLElement) this.applyFocus(match);
        }, delay);
        this.#restoreTimers.add(timer);
      }
    }

    onClick(event) {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (target instanceof HTMLAnchorElement) this.rememberBeforeNavigation(target);
    }

    onFocusIn(event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (dom.isEditable(target)) {
        document.querySelectorAll(`[${FOCUS_ATTRIBUTE}],[${TARGET_ATTRIBUTE}]`).forEach((element) => {
          element.removeAttribute(FOCUS_ATTRIBUTE);
          element.removeAttribute(TARGET_ATTRIBUTE);
        });
        this.showEditableFocus(target);
        this.#current = null;
        return;
      }
      if (dom.isPlayerTarget(target)) {
        document.querySelectorAll(`[${FOCUS_ATTRIBUTE}],[${TARGET_ATTRIBUTE}]`).forEach((element) => {
          element.removeAttribute(FOCUS_ATTRIBUTE);
          element.removeAttribute(TARGET_ATTRIBUTE);
        });
        this.clearEditableFocus();
        this.#current = null;
        return;
      }
      const candidate = target.closest(selectors.candidates);
      if (
        candidate instanceof HTMLElement &&
        dom.isRendered(candidate) &&
        !(candidate === this.#current && candidate.hasAttribute(TARGET_ATTRIBUTE))
      ) this.applyFocus(candidate);
    }

    onFocusOut() {
      setTimeout(() => {
        if (this.#active && !dom.isEditable(document.activeElement)) this.clearEditableFocus();
      }, 0);
    }

    onKeyDown(event) {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      const active = event.target instanceof Element ? event.target : document.activeElement;
      if (dom.visibleDialog() === null && (dom.isEditable(active) || dom.isPlayerTarget(active))) return;

      const action = ({
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        Backspace: "back",
        Enter: "select",
        Escape: "back"
      })[event.key];
      if (action === undefined) return;
      if (event.key === "Escape" && dom.visibleDialog() !== null) return;

      if (this.handleAction(action, "keyboard")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    onRemoteAction(event) {
      const action = event instanceof CustomEvent ? event.detail?.action : null;
      if (this.handleAction(action, "host")) event.preventDefault();
    }

    connectedGamepads() {
      if (typeof navigator.getGamepads !== "function") return [];
      return [...navigator.getGamepads()].filter((gamepad) => gamepad?.connected);
    }

    addGamepadListeners() {
      if (this.#gamepadListenersActive) return;
      this.#gamepadListenersActive = true;
      window.addEventListener("gamepadconnected", this.onGamepadConnected);
      window.addEventListener("gamepaddisconnected", this.onGamepadDisconnected);
    }

    removeGamepadListeners() {
      if (!this.#gamepadListenersActive) return;
      this.#gamepadListenersActive = false;
      window.removeEventListener("gamepadconnected", this.onGamepadConnected);
      window.removeEventListener("gamepaddisconnected", this.onGamepadDisconnected);
    }

    startGamepadPolling() {
      if (this.#gamepadFrame !== null || this.#inputOwner !== "browser" || !this.#active) return;
      this.#gamepadFrame = requestAnimationFrame(this.pollGamepads);
    }

    stopGamepadPolling() {
      if (this.#gamepadFrame !== null) cancelAnimationFrame(this.#gamepadFrame);
      this.#gamepadFrame = null;
      this.#gamepadPressed.clear();
    }

    updateGamepadLifecycle() {
      if (!this.#active || this.#inputOwner !== "browser") {
        this.stopGamepadPolling();
        this.removeGamepadListeners();
        return;
      }
      this.addGamepadListeners();
      if (this.connectedGamepads().length > 0) this.startGamepadPolling();
      else this.stopGamepadPolling();
    }

    onGamepadConnected() {
      this.startGamepadPolling();
    }

    onGamepadDisconnected() {
      if (this.connectedGamepads().length === 0) this.stopGamepadPolling();
    }

    pollGamepads(now) {
      if (!this.#active) return;
      this.#gamepadFrame = null;
      const gamepads = this.connectedGamepads();
      if (gamepads.length === 0 || this.#inputOwner !== "browser") {
        this.#gamepadPressed.clear();
        return;
      }
      const pressed = new Set();

      for (const gamepad of gamepads) {
        for (const action of gamepadActionsFor(gamepad)) pressed.add(action);
      }

      for (const action of pressed) {
        const state = this.#gamepadPressed.get(action);
        const directional = ["up", "down", "left", "right"].includes(action);
        if (state === undefined || (directional && now >= state.nextAt)) {
          this.handleAction(action, "gamepad");
          this.#gamepadPressed.set(action, {
            nextAt: state === undefined ? now + DIRECTION_REPEAT_DELAY_MS : now + DIRECTION_REPEAT_INTERVAL_MS
          });
        }
      }
      for (const action of this.#gamepadPressed.keys()) {
        if (!pressed.has(action)) this.#gamepadPressed.delete(action);
      }

      this.startGamepadPolling();
    }
  }

  namespace.SpatialNavigator = SpatialNavigator;
  namespace.geometry = Object.freeze({ horizontalScore, verticalScore });
  namespace.input = Object.freeze({ gamepadActionsFor });
})();
