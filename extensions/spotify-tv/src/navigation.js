(() => {
  "use strict";

  const FOCUS_ATTRIBUTE = "data-nhdtv-spotify-focused";
  const TARGET_ATTRIBUTE = "data-nhdtv-spotify-target";
  const TARGET_SELECTOR = `[${TARGET_ATTRIBUTE}="true"]`;
  let current = null;
  let desiredX = null;

  const isRendered = (element) => {
    if (!(element instanceof HTMLElement) || element.hasAttribute("disabled")) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };

  const frameFor = (element) => element.closest([
    "[data-nhdtv-spotify-card]",
    "[data-nhdtv-spotify-track]",
    "#nhdtv-spotify-tv-nav a",
    "#nhdtv-spotify-tv-nav button",
    "#nhdtv-spotify-tv-nav input"
  ].join(",")) ?? element;

  const center = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

  const candidates = () => {
    const frames = new Set();
    return [...document.querySelectorAll(TARGET_SELECTOR)].filter((element) => {
      if (!(element instanceof HTMLElement) || !isRendered(element)) return false;
      const frame = frameFor(element);
      const rect = frame.getBoundingClientRect();
      if (
        rect.bottom < 72 ||
        rect.top > innerHeight - 72 ||
        rect.right < 0 ||
        rect.left > innerWidth
      ) return false;
      if (frames.has(frame)) return false;
      frames.add(frame);
      return true;
    });
  };

  const horizontalScore = (direction, from, to) => {
    const source = center(from);
    const target = center(to);
    const major = direction === "left" ? source.x - target.x : target.x - source.x;
    if (major <= 2) return Number.POSITIVE_INFINITY;
    const verticalGap = Math.max(0, Math.max(from.top, to.top) - Math.min(from.bottom, to.bottom));
    if (verticalGap > Math.min(from.height, to.height) * 0.72) return Number.POSITIVE_INFINITY;
    return major + Math.abs(source.y - target.y) * 4 + verticalGap * 6;
  };

  const verticalScore = (direction, from, to, columnX) => {
    const source = center(from);
    const target = center(to);
    const major = direction === "up" ? source.y - target.y : target.y - source.y;
    if (major <= 2) return Number.POSITIVE_INFINITY;
    return major + Math.abs(target.x - columnX) * 2.4;
  };

  const clearFocus = () => {
    document.querySelectorAll(`[${FOCUS_ATTRIBUTE}]`).forEach((element) => {
      element.removeAttribute(FOCUS_ATTRIBUTE);
    });
  };

  const applyFocus = (element, preserveColumn = false) => {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;
    clearFocus();
    const frame = frameFor(element);
    frame.setAttribute(FOCUS_ATTRIBUTE, "true");
    current = element;
    element.focus({ preventScroll: true });
    const rect = frame.getBoundingClientRect();
    if (!preserveColumn || desiredX === null) desiredX = center(rect).x;
    frame.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    return true;
  };

  const initialCandidate = (available, direction) => {
    const preferred = available.find((element) =>
      element.getAttribute("data-nhdtv-spotify-default") === "true"
    );
    if (preferred) return preferred;
    const activeNavigation = available.find((element) => element.getAttribute("aria-current") === "page");
    if (direction === "up" && activeNavigation) return activeNavigation;
    const content = available.filter((element) => element.closest("#nhdtv-spotify-tv-nav") === null);
    const pool = content.length > 0 ? content : available;
    return [...pool].sort((left, right) => {
      const a = frameFor(left).getBoundingClientRect();
      const b = frameFor(right).getBoundingClientRect();
      return a.top - b.top || a.left - b.left;
    })[0] ?? null;
  };

  const move = (direction) => {
    const available = candidates();
    if (available.length === 0) return false;
    if (!(current instanceof HTMLElement) || !current.isConnected || !available.includes(current)) {
      return applyFocus(initialCandidate(available, direction));
    }

    const from = frameFor(current).getBoundingClientRect();
    const columnX = desiredX ?? center(from).x;
    let best = null;
    let score = Number.POSITIVE_INFINITY;
    for (const candidate of available) {
      if (candidate === current) continue;
      const to = frameFor(candidate).getBoundingClientRect();
      const candidateScore = direction === "left" || direction === "right"
        ? horizontalScore(direction, from, to)
        : verticalScore(direction, from, to, columnX);
      if (candidateScore < score) {
        best = candidate;
        score = candidateScore;
      }
    }
    if (best instanceof HTMLElement) {
      return applyFocus(best, direction === "up" || direction === "down");
    }

    const main = document.querySelector("main");
    if (main instanceof HTMLElement) {
      const amount = Math.max(420, innerHeight * 0.7);
      main.scrollBy({
        behavior: "smooth",
        left: direction === "left" ? -amount : direction === "right" ? amount : 0,
        top: direction === "up" ? -amount : direction === "down" ? amount : 0
      });
      return true;
    }
    return false;
  };

  document.addEventListener("nhdtv-remote-action", (event) => {
    if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== "object") return;
    const action = event.detail.action;
    if (action === "back") return;
    if (action === "select") {
      const available = candidates();
      if (current instanceof HTMLElement && current.isConnected && available.includes(current)) {
        event.preventDefault();
        current.click();
        return;
      }
      const initial = initialCandidate(available, "down");
      if (initial instanceof HTMLElement) {
        event.preventDefault();
        applyFocus(initial);
      }
      return;
    }
    if (["up", "down", "left", "right"].includes(action) && move(action)) {
      event.preventDefault();
    }
  }, true);

  addEventListener("popstate", () => {
    current = null;
    desiredX = null;
    clearFocus();
  });
})();
