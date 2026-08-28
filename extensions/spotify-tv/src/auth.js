(() => {
  "use strict";

  const ROOT_CLASS = "nhdtv-spotify-auth";
  const TARGET_ATTRIBUTE = "data-nhdtv-spotify-target";
  const DEFAULT_ATTRIBUTE = "data-nhdtv-spotify-default";
  const root = document.documentElement;
  let mutationFrame = null;

  root.classList.add(ROOT_CLASS);
  root.setAttribute("data-nhdtv-extension-active", "true");
  root.setAttribute("data-nhdtv-input-owner", "host");

  const isRendered = (element) => {
    if (!(element instanceof HTMLElement) || element.matches(":disabled,[aria-disabled=true]")) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };

  const update = () => {
    mutationFrame = null;
    const controls = [...document.querySelectorAll([
      'input:not([type="hidden"])',
      'button:not([disabled])',
      'a[href]',
      '[role="button"]'
    ].join(","))].filter(isRendered);
    const desired = new Set(controls);

    document.querySelectorAll(`[${TARGET_ATTRIBUTE}]`).forEach((element) => {
      if (!desired.has(element)) element.removeAttribute(TARGET_ATTRIBUTE);
    });
    desired.forEach((element) => {
      if (element.getAttribute(TARGET_ATTRIBUTE) !== "true") {
        element.setAttribute(TARGET_ATTRIBUTE, "true");
      }
    });

    const email = controls.find((element) =>
      element instanceof HTMLInputElement &&
      (element.type === "email" || element.autocomplete === "username" || element.name === "username")
    );
    document.querySelectorAll(`[${DEFAULT_ATTRIBUTE}]`).forEach((element) => {
      if (element !== email) element.removeAttribute(DEFAULT_ATTRIBUTE);
    });
    if (email instanceof HTMLElement && email.getAttribute(DEFAULT_ATTRIBUTE) !== "true") {
      email.setAttribute(DEFAULT_ATTRIBUTE, "true");
    }
  };

  const scheduleUpdate = () => {
    if (mutationFrame !== null) return;
    mutationFrame = requestAnimationFrame(update);
  };

  const observer = new MutationObserver(scheduleUpdate);
  observer.observe(root, { childList: true, subtree: true });
  scheduleUpdate();
})();
