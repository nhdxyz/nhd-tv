import type { WebContents } from "electron";
import type {
  RemotePointerInput,
  RemotePointerResult
} from "./contracts";
import { spatialCandidatePriority } from "./spatial-focus";

interface PointerTarget {
  key: string | null;
  snapped: boolean;
  textEntry: boolean;
  x: number;
  y: number;
}

export interface PrecisionPointerDispatch extends RemotePointerResult {
  snapKey: string | null;
}

export const PRECISION_POINTER_IDLE_MS = 3_500;

export function precisionScrollDelta(scroll: number): number {
  return scroll * -90;
}

export function precisionShellScrollDelta(scroll: number): number {
  return scroll * 90;
}

export function buildShellPrecisionScrollScript(scroll: number): string {
  return `(() => {
    const deltaY = ${JSON.stringify(precisionShellScrollDelta(scroll))};
    if (!Number.isFinite(deltaY) || deltaY === 0) return false;
    window.scrollBy({ behavior: 'auto', left: 0, top: deltaY });
    return true;
  })()`;
}

export function buildShellPrecisionRailScrollScript(
  scrollX: number,
  x: number,
  y: number
): string {
  return `(() => {
    const deltaX = ${JSON.stringify(precisionShellScrollDelta(scrollX))};
    const requestedX = Math.max(0, Math.min(1, ${JSON.stringify(x)})) * innerWidth;
    const requestedY = Math.max(0, Math.min(1, ${JSON.stringify(y)})) * innerHeight;
    if (!Number.isFinite(deltaX) || deltaX === 0) return false;
    const row = document.elementsFromPoint(requestedX, requestedY)
      .map((element) => element.closest('.horizontal-row'))
      .find((element) => element instanceof HTMLElement && element.scrollWidth > element.clientWidth + 2);
    if (!(row instanceof HTMLElement)) return false;
    row.scrollBy({ behavior: 'auto', left: deltaX, top: 0 });
    return true;
  })()`;
}

export function buildPrecisionPointerTargetScript(
  x: number,
  y: number,
  phase: RemotePointerInput["phase"] = "move",
  remoteTextEntrySelectors: readonly string[] = [],
  remoteTextEntryTriggerSelectors: readonly string[] = []
): string {
  return `(() => {
    const requestedX = Math.max(0, Math.min(1, ${JSON.stringify(x)})) * innerWidth;
    const requestedY = Math.max(0, Math.min(1, ${JSON.stringify(y)})) * innerHeight;
    const phase = ${JSON.stringify(phase)};
    const candidatePriority = (${spatialCandidatePriority.toString()});
    const declaredTextEntrySelectors = ${JSON.stringify(remoteTextEntrySelectors)};
    const declaredTextEntryTriggerSelectors = ${JSON.stringify(remoteTextEntryTriggerSelectors)};
    const cursorId = 'nhd-tv-precision-cursor';
    const pointerState = globalThis.__nhdTvPrecisionPointer || {
      hideTimer: null,
      keys: new WeakMap(),
      nextKey: 1,
      removeTimer: null
    };
    globalThis.__nhdTvPrecisionPointer = pointerState;
    if (pointerState.hideTimer !== null) clearTimeout(pointerState.hideTimer);
    if (pointerState.removeTimer !== null) clearTimeout(pointerState.removeTimer);
    pointerState.hideTimer = null;
    pointerState.removeTimer = null;
    const clearFocus = () => {
      document.querySelectorAll('[data-nhd-tv-focus="true"],[data-remote-focused="true"]').forEach((element) => {
        element.removeAttribute('data-nhd-tv-focus');
        element.removeAttribute('data-remote-focused');
      });
      document.documentElement.removeAttribute('data-nhd-tv-has-focus');
      document.documentElement.style.removeProperty('--nhd-tv-focus-top');
      document.documentElement.style.removeProperty('--nhd-tv-focus-left');
      document.documentElement.style.removeProperty('--nhd-tv-focus-width');
      document.documentElement.style.removeProperty('--nhd-tv-focus-height');
    };
    let cursor = document.getElementById(cursorId);
    if (!(cursor instanceof HTMLElement) || cursor.dataset.nhdTvOwned !== 'true') {
      cursor?.remove();
      cursor = document.createElement('div');
      cursor.id = cursorId;
      cursor.dataset.nhdTvOwned = 'true';
      cursor.setAttribute('aria-hidden', 'true');
      cursor.style.cssText = [
        'position:fixed !important',
        'z-index:2147483647 !important',
        'width:18px !important',
        'height:18px !important',
        'margin:0 !important',
        'padding:0 !important',
        'border:2px solid rgba(255,255,255,.96) !important',
        'border-radius:999px !important',
        'background:radial-gradient(circle at center,#fff 0 15%,#7dd3fc 18%,#1685ff 68%) !important',
        'box-shadow:0 0 0 6px rgba(22,133,255,.22),0 0 24px 9px rgba(37,99,235,.62) !important',
        'pointer-events:none !important',
        'transform:translate(-50%,-50%) !important',
        'opacity:1 !important',
        'transition:left 48ms linear,top 48ms linear,width 80ms ease,height 80ms ease,box-shadow 80ms ease,opacity 160ms ease !important',
        'will-change:left,top,opacity !important'
      ].join(';');
    }
    cursor.style.setProperty('opacity', '1', 'important');
    cursor.style.setProperty('left', requestedX + 'px', 'important');
    cursor.style.setProperty('top', requestedY + 'px', 'important');
    const openDialog = [...document.querySelectorAll('dialog[open]')]
      .find((element) => element instanceof HTMLDialogElement);
    const cursorHost = document.fullscreenElement instanceof HTMLElement
      ? document.fullscreenElement
      : openDialog instanceof HTMLDialogElement
        ? openDialog
        : document.documentElement;
    if (cursor.parentElement !== cursorHost) {
      cursorHost.append(cursor);
    }
    pointerState.hideTimer = setTimeout(() => {
      pointerState.hideTimer = null;
      clearFocus();
      if (cursor.isConnected) cursor.style.setProperty('opacity', '0', 'important');
      pointerState.removeTimer = setTimeout(() => {
        pointerState.removeTimer = null;
        cursor.remove();
      }, 180);
    }, ${PRECISION_POINTER_IDLE_MS});
    const setCursorSnapped = (snapped) => {
      cursor.dataset.nhdTvSnapped = String(snapped);
      cursor.style.setProperty('opacity', snapped ? '0' : '1', 'important');
      cursor.style.setProperty('width', snapped ? '22px' : '18px', 'important');
      cursor.style.setProperty('height', snapped ? '22px' : '18px', 'important');
      cursor.style.setProperty(
        'box-shadow',
        snapped
          ? '0 0 0 7px rgba(34,211,238,.26),0 0 30px 11px rgba(14,165,233,.76)'
          : '0 0 0 6px rgba(22,133,255,.22),0 0 24px 9px rgba(37,99,235,.62)',
        'important'
      );
    };
    const selectors = [
      'a[href]',
      'button',
      '[role="button"]',
      '[role="link"]',
      '[tabindex]:not([tabindex="-1"])',
      ...declaredTextEntrySelectors,
      ...declaredTextEntryTriggerSelectors
    ].join(',');
    const snapRadius = Math.max(52, Math.min(108, Math.min(innerWidth, innerHeight) * 0.1));
    const youtube = location.hostname === 'www.youtube.com' || location.hostname.endsWith('.youtube.com');
    const netflix = location.hostname === 'www.netflix.com' || location.hostname.endsWith('.netflix.com');
    const priorityFor = (element) => candidatePriority({
      hasHref: element instanceof HTMLAnchorElement && element.hasAttribute('href'),
      role: element.getAttribute('role'),
      tabIndex: element.tabIndex,
      tagName: element.tagName
    });
    const cardSelector = [
      'ytd-rich-item-renderer',
      'ytd-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-compact-video-renderer',
      'yt-lockup-view-model'
    ].join(',');
    const sensitiveBoundary = (element) => {
      const form = element.closest('form');
      if (form === null) return false;
      const boundary = [
        form.getAttribute('action'),
        form.getAttribute('aria-label'),
        form.getAttribute('name'),
        form.id,
        form.className
      ].filter((value) => typeof value === 'string').join(' ');
      return /login|log-in|signin|sign-in|password|payment|checkout|billing/i.test(boundary);
    };
    const isDeclaredTextEntry = (element) => {
      const editable = element.closest('input,textarea,[contenteditable="true"],[role="textbox"],[role="searchbox"]');
      if (!(editable instanceof HTMLElement) || sensitiveBoundary(editable)) return false;
      if (editable instanceof HTMLInputElement && !['search', 'text'].includes(editable.type)) return false;
      return declaredTextEntrySelectors.some((selector) => {
        try {
          return editable.matches(selector);
        } catch {
          return false;
        }
      });
    };
    const isDeclaredTextEntryTrigger = (element) => declaredTextEntryTriggerSelectors.some((selector) => {
      try {
        return element.matches(selector) || element.closest(selector) !== null;
      } catch {
        return false;
      }
    });
    const blocked = (element) => {
      if (sensitiveBoundary(element)) return true;
      if (element.closest('input,textarea,select,[contenteditable="true"],[role="textbox"],[role="searchbox"]') !== null) {
        return !isDeclaredTextEntry(element);
      }
      return false;
    };
    const modalSelector = [
      'dialog[open]',
      '[role="dialog"]',
      '[aria-modal="true"]',
      '[data-uia*="modal"]',
      '[class*="previewModal"]',
      '[class*="detail-modal"]'
    ].join(',');
    const visibleModalRoots = [...document.querySelectorAll(modalSelector)].filter((element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        Number(style.opacity) > 0.05 && rect.width >= 40 && rect.height >= 40 &&
        rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    });
    const modalRoot = visibleModalRoots
      .filter((candidate) => !visibleModalRoots.some((other) => other !== candidate && other.contains(candidate)))
      .at(-1) || null;
    const isCandidate = (element) => {
      if (
        !(element instanceof HTMLElement) ||
        (modalRoot !== null && (element === modalRoot || !modalRoot.contains(element))) ||
        blocked(element) ||
        element.matches(':disabled,[aria-disabled="true"],[aria-hidden="true"],[inert]') ||
        element.closest('[aria-hidden="true"],[inert]') !== null
      ) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        Number(style.opacity) > 0.05 && rect.width >= 12 && rect.height >= 12 &&
        rect.bottom >= 0 && rect.top <= innerHeight && rect.right >= 0 && rect.left <= innerWidth;
    };
    const previousTarget = document.querySelector('[data-nhd-tv-focus="true"]');
    const sampleOffset = snapRadius * 0.7;
    const samplePoints = [
      [0, 0],
      [-snapRadius, 0], [snapRadius, 0], [0, -snapRadius], [0, snapRadius],
      [-sampleOffset, -sampleOffset], [sampleOffset, -sampleOffset],
      [-sampleOffset, sampleOffset], [sampleOffset, sampleOffset]
    ];
    const nearby = new Set();
    for (const [offsetX, offsetY] of samplePoints) {
      const sampleX = Math.max(0, Math.min(innerWidth - 1, requestedX + offsetX));
      const sampleY = Math.max(0, Math.min(innerHeight - 1, requestedY + offsetY));
      for (const element of document.elementsFromPoint(sampleX, sampleY)) {
        const card = youtube ? element.closest(cardSelector) : null;
        const cardTarget = card === null
          ? null
          : [...card.querySelectorAll('a[href^="/watch"], a[href^="/shorts/"]')]
            .find((candidate) =>
              candidate instanceof HTMLElement &&
              candidate.closest('[aria-hidden="true"],[inert]') === null
            );
        const target = cardTarget || element.closest(selectors);
        if (target instanceof HTMLElement) {
          nearby.add(target);
          if (priorityFor(target) < 4) {
            for (const descendant of [...target.querySelectorAll(selectors)].slice(0, 24)) {
              if (descendant instanceof HTMLElement) nearby.add(descendant);
            }
          }
        }
      }
    }
    const visibleCandidates = [...nearby].filter(isCandidate);
    const candidates = visibleCandidates.filter((element) => {
      const priority = priorityFor(element);
      const rect = element.getBoundingClientRect();
      const area = rect.width * rect.height;
      return !visibleCandidates.some((descendant) => {
        if (descendant === element || !element.contains(descendant)) return false;
        const descendantPriority = priorityFor(descendant);
        if (descendantPriority > priority) return true;
        if (descendantPriority < priority) return false;
        const descendantRect = descendant.getBoundingClientRect();
        return descendantRect.width * descendantRect.height < area * 0.92;
      });
    });

    const distanceTo = (rect) => Math.hypot(
      Math.max(rect.left - requestedX, 0, requestedX - rect.right),
      Math.max(rect.top - requestedY, 0, requestedY - rect.bottom)
    );
    let nearest = candidates
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const distance = distanceTo(rect);
        const centerDistance = Math.hypot(
          rect.left + rect.width / 2 - requestedX,
          rect.top + rect.height / 2 - requestedY
        );
        return { distance, element, rect, score: distance + centerDistance * 0.025 };
      })
      .filter((candidate) => candidate.distance <= snapRadius)
      .sort((left, right) => left.score - right.score)[0];

    if (previousTarget instanceof HTMLElement && isCandidate(previousTarget)) {
      const rect = previousTarget.getBoundingClientRect();
      const distance = distanceTo(rect);
      const centerDistance = Math.hypot(
        rect.left + rect.width / 2 - requestedX,
        rect.top + rect.height / 2 - requestedY
      );
      const previous = {
        distance,
        element: previousTarget,
        rect,
        score: distance + centerDistance * 0.025
      };
      const retainForTap = phase === 'tap' && distance <= snapRadius * 1.4 && (
        nearest === undefined ||
        nearest.element === previousTarget ||
        (distance <= 28 && nearest.distance > 0)
      );
      const retainForMove = phase === 'move' && distance <= 28 && (
        nearest === undefined ||
        nearest.element === previousTarget ||
        (nearest.distance > 0 && previous.score <= nearest.score + 18)
      );
      if (retainForTap || retainForMove) {
        nearest = previous;
      }
    }

    document.querySelectorAll('[data-nhd-tv-focus="true"],[data-remote-focused="true"]').forEach((element) => {
      element.removeAttribute('data-nhd-tv-focus');
      element.removeAttribute('data-remote-focused');
    });
    if (nearest === undefined) {
      setCursorSnapped(false);
      document.documentElement.removeAttribute('data-nhd-tv-has-focus');
      return {
        key: null,
        snapped: false,
        textEntry: false,
        x: Math.round(requestedX),
        y: Math.round(requestedY)
      };
    }

    const element = nearest.element;
    const rect = nearest.rect;
    setCursorSnapped(true);
    let key = pointerState.keys.get(element);
    if (typeof key !== 'string') {
      key = 'target-' + pointerState.nextKey++;
      pointerState.keys.set(element, key);
    }
    element.dataset.nhdTvFocus = 'true';
    element.dataset.remoteFocused = 'true';
    const netflixEpisodeRow = netflix
      ? element.closest([
        '[data-uia*="episode-item"]',
        '.episodeSelector .episode',
        '[class*="episodeSelector"] [class*="episode"]'
      ].join(','))
      : null;
    const netflixEpisodeRect = netflixEpisodeRow instanceof HTMLElement
      ? netflixEpisodeRow.getBoundingClientRect()
      : null;
    const overlayRect = youtube
      ? element.closest(cardSelector)?.getBoundingClientRect() || rect
      : netflixEpisodeRect !== null &&
          netflixEpisodeRect.width >= rect.width &&
          netflixEpisodeRect.height >= rect.height &&
          netflixEpisodeRect.height <= 260
        ? netflixEpisodeRect
        : rect;
    document.documentElement.dataset.nhdTvHasFocus = 'true';
    document.documentElement.style.setProperty('--nhd-tv-focus-top', overlayRect.top + 'px');
    document.documentElement.style.setProperty('--nhd-tv-focus-left', overlayRect.left + 'px');
    document.documentElement.style.setProperty('--nhd-tv-focus-width', overlayRect.width + 'px');
    document.documentElement.style.setProperty('--nhd-tv-focus-height', overlayRect.height + 'px');
    return {
      key,
      snapped: true,
      textEntry: isDeclaredTextEntry(element) || isDeclaredTextEntryTrigger(element),
      x: Math.round(Math.max(rect.left + 1, Math.min(rect.right - 1, requestedX))),
      y: Math.round(Math.max(rect.top + 1, Math.min(rect.bottom - 1, requestedY)))
    };
  })()`;
}

export function buildPrecisionPointerHideScript(): string {
  return `(() => {
    const pointerState = globalThis.__nhdTvPrecisionPointer;
    if (pointerState?.hideTimer !== null && pointerState?.hideTimer !== undefined) {
      clearTimeout(pointerState.hideTimer);
      pointerState.hideTimer = null;
    }
    if (pointerState?.removeTimer !== null && pointerState?.removeTimer !== undefined) {
      clearTimeout(pointerState.removeTimer);
      pointerState.removeTimer = null;
    }
    document.getElementById('nhd-tv-precision-cursor')?.remove();
    document.querySelectorAll('[data-nhd-tv-focus="true"],[data-remote-focused="true"]').forEach((element) => {
      element.removeAttribute('data-nhd-tv-focus');
      element.removeAttribute('data-remote-focused');
    });
    document.documentElement.removeAttribute('data-nhd-tv-has-focus');
    document.documentElement.style.removeProperty('--nhd-tv-focus-top');
    document.documentElement.style.removeProperty('--nhd-tv-focus-left');
    document.documentElement.style.removeProperty('--nhd-tv-focus-width');
    document.documentElement.style.removeProperty('--nhd-tv-focus-height');
    return true;
  })()`;
}

function validTarget(value: unknown): value is PointerTarget {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const target = value as Record<string, unknown>;
  return (
    (typeof target.key === "string" || target.key === null) &&
    typeof target.snapped === "boolean" &&
    typeof target.textEntry === "boolean" &&
    typeof target.x === "number" && Number.isFinite(target.x) &&
    target.x >= 0 && target.x <= 16_384 &&
    typeof target.y === "number" && Number.isFinite(target.y) &&
    target.y >= 0 && target.y <= 16_384
  );
}

export async function dispatchPrecisionPointer(
  webContents: WebContents,
  input: RemotePointerInput,
  previousSnapKey: string | null,
  remoteTextEntrySelectors: readonly string[] = [],
  remoteTextEntryTriggerSelectors: readonly string[] = []
): Promise<PrecisionPointerDispatch> {
  if (input.phase === "hide") {
    await webContents.executeJavaScript(buildPrecisionPointerHideScript(), true);
    return { snapChanged: false, snapKey: null, snapped: false, textEntryAvailable: false };
  }

  const rawTarget = await webContents.executeJavaScript(
    buildPrecisionPointerTargetScript(
      input.x,
      input.y,
      input.phase,
      remoteTextEntrySelectors,
      remoteTextEntryTriggerSelectors
    ),
    true
  ) as unknown;
  if (!validTarget(rawTarget)) {
    return { snapChanged: false, snapKey: null, snapped: false, textEntryAvailable: false };
  }

  const target = rawTarget;
  webContents.focus();
  webContents.sendInputEvent({
    movementX: 0,
    movementY: 0,
    type: "mouseMove",
    x: target.x,
    y: target.y
  });

  if (input.scroll !== 0) {
    if (webContents.getURL().startsWith("app://shell/")) {
      await webContents.executeJavaScript(
        buildShellPrecisionScrollScript(input.scroll),
        true
      );
    } else {
      webContents.sendInputEvent({
        canScroll: true,
        deltaX: 0,
        deltaY: precisionScrollDelta(input.scroll),
        hasPreciseScrollingDeltas: true,
        type: "mouseWheel",
        x: target.x,
        y: target.y
      });
    }
  }

  if (input.scrollX !== 0) {
    if (webContents.getURL().startsWith("app://shell/")) {
      await webContents.executeJavaScript(
        buildShellPrecisionRailScrollScript(input.scrollX, input.x, input.y),
        true
      );
    } else {
      webContents.sendInputEvent({
        canScroll: true,
        deltaX: precisionScrollDelta(input.scrollX),
        deltaY: 0,
        hasPreciseScrollingDeltas: true,
        type: "mouseWheel",
        x: target.x,
        y: target.y
      });
    }
  }

  if (input.phase === "tap" && target.snapped) {
    webContents.sendInputEvent({
      button: "left",
      clickCount: 1,
      type: "mouseDown",
      x: target.x,
      y: target.y
    });
    webContents.sendInputEvent({
      button: "left",
      clickCount: 1,
      type: "mouseUp",
      x: target.x,
      y: target.y
    });
  }

  return {
    snapChanged: target.snapped && target.key !== previousSnapKey,
    snapKey: target.snapped ? target.key : null,
    snapped: target.snapped,
    textEntryAvailable: target.snapped && target.textEntry
  };
}
