import type { WebContents } from "electron";
import type {
  RemotePointerInput,
  RemotePointerResult
} from "./contracts";

interface PointerTarget {
  key: string | null;
  snapped: boolean;
  x: number;
  y: number;
}

export interface PrecisionPointerDispatch extends RemotePointerResult {
  snapKey: string | null;
}

export function buildPrecisionPointerTargetScript(x: number, y: number): string {
  return `(() => {
    const requestedX = Math.max(0, Math.min(1, ${JSON.stringify(x)})) * innerWidth;
    const requestedY = Math.max(0, Math.min(1, ${JSON.stringify(y)})) * innerHeight;
    const selectors = [
      'a[href]',
      'button',
      '[role="button"]',
      '[role="link"]',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');
    const snapRadius = Math.max(52, Math.min(108, Math.min(innerWidth, innerHeight) * 0.1));
    const youtube = location.hostname === 'www.youtube.com' || location.hostname.endsWith('.youtube.com');
    const cardSelector = [
      'ytd-rich-item-renderer',
      'ytd-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-compact-video-renderer',
      'yt-lockup-view-model'
    ].join(',');
    const blocked = (element) => {
      if (element.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]') !== null) {
        return true;
      }
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
        const target = card?.querySelector(
          'a#thumbnail[href], a[href^="/watch"], a[href^="/shorts/"]'
        ) || element.closest(selectors);
        if (target instanceof HTMLElement) nearby.add(target);
      }
    }
    const candidates = [...nearby].filter((element) => {
      if (
        !(element instanceof HTMLElement) ||
        blocked(element) ||
        element.matches(':disabled,[aria-disabled="true"],[aria-hidden="true"],[inert]') ||
        element.closest('[aria-hidden="true"],[inert]') !== null
      ) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        Number(style.opacity) > 0.05 && rect.width >= 12 && rect.height >= 12 &&
        rect.bottom >= 0 && rect.top <= innerHeight && rect.right >= 0 && rect.left <= innerWidth;
    });

    const distanceTo = (rect) => Math.hypot(
      Math.max(rect.left - requestedX, 0, requestedX - rect.right),
      Math.max(rect.top - requestedY, 0, requestedY - rect.bottom)
    );
    const nearest = candidates
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

    document.querySelectorAll('[data-nhd-tv-focus="true"]').forEach((element) => {
      element.removeAttribute('data-nhd-tv-focus');
    });
    if (nearest === undefined) {
      document.documentElement.removeAttribute('data-nhd-tv-has-focus');
      return {
        key: null,
        snapped: false,
        x: Math.round(requestedX),
        y: Math.round(requestedY)
      };
    }

    const element = nearest.element;
    const rect = nearest.rect;
    const pointerState = globalThis.__nhdTvPrecisionPointer || {
      keys: new WeakMap(),
      nextKey: 1
    };
    globalThis.__nhdTvPrecisionPointer = pointerState;
    let key = pointerState.keys.get(element);
    if (typeof key !== 'string') {
      key = 'target-' + pointerState.nextKey++;
      pointerState.keys.set(element, key);
    }
    element.dataset.nhdTvFocus = 'true';
    element.focus({ preventScroll: true });
    document.documentElement.dataset.nhdTvHasFocus = 'true';
    document.documentElement.style.setProperty('--nhd-tv-focus-top', rect.top + 'px');
    document.documentElement.style.setProperty('--nhd-tv-focus-left', rect.left + 'px');
    document.documentElement.style.setProperty('--nhd-tv-focus-width', rect.width + 'px');
    document.documentElement.style.setProperty('--nhd-tv-focus-height', rect.height + 'px');
    return {
      key,
      snapped: true,
      x: Math.round(Math.max(rect.left + 1, Math.min(rect.right - 1, requestedX))),
      y: Math.round(Math.max(rect.top + 1, Math.min(rect.bottom - 1, requestedY)))
    };
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
    typeof target.x === "number" && Number.isFinite(target.x) &&
    target.x >= 0 && target.x <= 16_384 &&
    typeof target.y === "number" && Number.isFinite(target.y) &&
    target.y >= 0 && target.y <= 16_384
  );
}

export async function dispatchPrecisionPointer(
  webContents: WebContents,
  input: RemotePointerInput,
  previousSnapKey: string | null
): Promise<PrecisionPointerDispatch> {
  const rawTarget = await webContents.executeJavaScript(
    buildPrecisionPointerTargetScript(input.x, input.y),
    true
  ) as unknown;
  if (!validTarget(rawTarget)) {
    return { snapChanged: false, snapKey: null, snapped: false };
  }

  const target = rawTarget;
  webContents.sendInputEvent({
    movementX: 0,
    movementY: 0,
    type: "mouseMove",
    x: target.x,
    y: target.y
  });

  if (input.scroll !== 0) {
    webContents.sendInputEvent({
      canScroll: true,
      deltaX: 0,
      deltaY: input.scroll * 90,
      hasPreciseScrollingDeltas: true,
      type: "mouseWheel",
      x: target.x,
      y: target.y
    });
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
    snapped: target.snapped
  };
}
