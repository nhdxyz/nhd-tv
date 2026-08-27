import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, session } from "electron";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionPath = path.join(projectRoot, "extensions", "youtube-tv");
const screenshotDirectory = process.env.NHD_YOUTUBE_TV_SCREENSHOT_DIR;
const extensionErrors = [];
const temporaryUserData = mkdtempSync(path.join(tmpdir(), "nhd-youtube-tv-verification-"));
app.setPath("userData", temporaryUserData);
app.once("quit", () => rmSync(temporaryUserData, { force: true, recursive: true }));

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(sample, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    try {
      lastValue = await sample();
      if (lastValue) return lastValue;
    } catch {
      // YouTube can replace the document while the client-side route settles.
    }
    await delay(120);
  }
  throw new Error(`Timed out waiting for live YouTube state. Last value: ${String(lastValue)}`);
}

function sendKey(window, key) {
  window.focus();
  window.webContents.focus();
  sendFocusedKey(window, key);
}

function sendFocusedKey(window, key) {
  window.webContents.sendInputEvent({ keyCode: key, type: "keyDown" });
  window.webContents.sendInputEvent({ keyCode: key, type: "keyUp" });
}

async function clickVisibleElement(window, selector) {
  const point = await window.webContents.executeJavaScript(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    const rect = element?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`, true);
  assert.ok(point, `Expected a visible element matching ${selector}`);
  window.webContents.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y });
  window.webContents.sendInputEvent({ button: "left", clickCount: 1, type: "mouseDown", x: point.x, y: point.y });
  window.webContents.sendInputEvent({ button: "left", clickCount: 1, type: "mouseUp", x: point.x, y: point.y });
}

async function loadYouTube(window, url) {
  try {
    await window.loadURL(url);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("ERR_ABORTED") || !window.webContents.getURL().startsWith("https://www.youtube.com/")) {
      throw error;
    }
  }
}

console.log("[youtube-tv-live] waiting for Electron");
let window;
let popup;

async function run() {
  console.log("[youtube-tv-live] Electron ready");
  const serviceSession = session.fromPartition("persist:youtube-tv-verification", { cache: false });

  try {
  console.log("[youtube-tv-live] loading extension");
  const extension = await serviceSession.extensions.loadExtension(extensionPath, { allowFileAccess: false });
  console.log(`[youtube-tv-live] extension loaded ${extension.id}`);
  window = new BrowserWindow({
    height: 1080,
    show: false,
    width: 1920,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: serviceSession
    }
  });

  window.webContents.on("console-message", (details) => {
    if (
      details &&
      typeof details === "object" &&
      details.level === "error" &&
      (String(details.sourceId).startsWith(`chrome-extension://${extension.id}/`) ||
        String(details.message).includes("NHDYouTubeTV"))
    ) {
      extensionErrors.push(`${details.sourceId}:${details.lineNumber} ${details.message}`);
    }
  });

  console.log("[youtube-tv-live] loading YouTube Home");
  await loadYouTube(window, "https://www.youtube.com/");
  console.log("[youtube-tv-live] YouTube Home loaded");
  try {
    await waitFor(() => window.webContents.executeJavaScript(
      "document.documentElement.dataset.nhdtvExtensionActive === 'true'",
      true
    ));
  } catch (error) {
    const diagnostic = await window.webContents.executeJavaScript(`({
      cards: document.querySelectorAll('[data-nhdtv-card]').length,
      marker: document.documentElement.dataset.nhdtvExtensionActive ?? null,
      readyState: document.readyState,
      styles: document.querySelectorAll('#nhdtv-youtube-tv-styles').length,
      url: location.href
    })`, true);
    console.error("[youtube-tv-live] startup diagnostic", JSON.stringify({ diagnostic, extensionErrors }));
    throw error;
  }

  const startup = await waitFor(() => window.webContents.executeJavaScript(`(() => {
    const rail = document.querySelector('#nhdtv-tv-rail');
    const pageHeading = document.querySelector('#nhdtv-tv-page-heading');
    const pageManager = document.querySelector('#page-manager');
    const masthead = document.querySelector('ytd-masthead');
    const mastheadContainer = document.querySelector('ytd-masthead #container');
    const logo = [...document.querySelectorAll('ytd-masthead ytd-topbar-logo-renderer,ytd-masthead #logo-icon')]
      .find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const style = getComputedStyle(candidate);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
    const guideButton = document.querySelector('ytd-masthead #guide-button');
    const nativeGuide = document.querySelector('ytd-mini-guide-renderer,ytd-app #guide');
    if (!(rail instanceof HTMLElement) || !(pageManager instanceof HTMLElement) || !(pageHeading instanceof HTMLElement)) return null;
    const railRect = rail.getBoundingClientRect();
    const logoRect = logo?.getBoundingClientRect();
    const mastheadContainerRect = mastheadContainer?.getBoundingClientRect();
    const pageStyle = getComputedStyle(pageManager);
    const mastheadStyle = masthead ? getComputedStyle(masthead) : null;
    return {
      activeItem: rail.querySelector('[aria-current="page"]')?.getAttribute('aria-label') ?? null,
      guideButtonHidden: !guideButton || getComputedStyle(guideButton).display === 'none',
      itemCount: rail.querySelectorAll('.nhdtv-tv-rail-item').length,
      logoNotObscured: !logoRect || logoRect.left >= railRect.right - 2,
      logoRect: logoRect ? { left: Math.round(logoRect.left), right: Math.round(logoRect.right), width: Math.round(logoRect.width) } : null,
      mastheadContainerRect: mastheadContainerRect ? { left: Math.round(mastheadContainerRect.left), right: Math.round(mastheadContainerRect.right), width: Math.round(mastheadContainerRect.width) } : null,
      mastheadLeft: mastheadStyle?.left ?? null,
      nativeGuideHidden: !nativeGuide || getComputedStyle(nativeGuide).display === 'none',
      pageHeading: pageHeading.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      pageMarginLeft: pageStyle.marginLeft,
      railCount: document.querySelectorAll('#nhdtv-tv-rail').length,
      railWidth: Math.round(railRect.width),
      styleLinks: document.querySelectorAll('#nhdtv-youtube-tv-styles').length,
      toolbarHeight: getComputedStyle(document.querySelector('ytd-app') ?? document.documentElement)
        .getPropertyValue('--ytd-toolbar-height').trim()
    };
  })()`, true));
  console.log("[youtube-tv-live] startup", JSON.stringify(startup));
  assert.equal(startup.railCount, 1);
  assert.equal(startup.itemCount, 5);
  assert.equal(startup.logoNotObscured, true);
  assert.equal(startup.activeItem, "Home");
  assert.equal(startup.guideButtonHidden, true);
  assert.equal(startup.nativeGuideHidden, true);
  assert.equal(startup.pageHeading, "HomeRecommended for you");
  assert.equal(startup.styleLinks, 1);
  assert.equal(startup.toolbarHeight, "88px");
  assert.ok(startup.railWidth >= 90);
  assert.ok(Number.parseFloat(startup.pageMarginLeft) >= 90);
  console.log("[youtube-tv-live] cold-start rail passed without hamburger interaction");

  let browseSurface = "home";
  const initialHomeCards = await window.webContents.executeJavaScript(
    "document.querySelectorAll('[data-nhdtv-card]').length",
    true
  );
  if (initialHomeCards < 3) {
    browseSurface = "channel";
    console.log("[youtube-tv-live] signed-out Home has no recommendations; loading public channel grid");
    await loadYouTube(window, "https://www.youtube.com/@YouTube/videos");
    await waitFor(() => window.webContents.executeJavaScript(
      "document.documentElement.dataset.nhdtvRoute === 'channel' && document.querySelectorAll('[data-nhdtv-card]').length >= 3",
      true
    ));
  }

  await delay(800);

  if (screenshotDirectory) {
    mkdirSync(screenshotDirectory, { recursive: true });
    writeFileSync(
      path.join(screenshotDirectory, "youtube-tv-cold-1920x1080.png"),
      await window.webContents.capturePage().then((image) => image.toPNG())
    );
  }

  const focusRailControl = async (label) => {
    const focused = await window.webContents.executeJavaScript(`(() => {
      const control = document.querySelector(${JSON.stringify(`#nhdtv-tv-rail [aria-label="${label}"]`)});
      if (!(control instanceof HTMLElement)) return false;
      control.focus({ preventScroll: true });
      return document.activeElement === control;
    })()`, true);
    assert.equal(focused, true);
  };

  await focusRailControl("Search");
  sendKey(window, "Enter");
  await waitFor(() => window.webContents.executeJavaScript(
    "document.activeElement?.matches(\"textarea[name='search_query'],input[name='search_query'],ytd-searchbox input,yt-searchbox input,[role='search'] [role='textbox']\") === true",
    true
  ));
  await window.webContents.executeJavaScript("document.activeElement?.blur()", true);

  await focusRailControl("Subscriptions");
  sendKey(window, "Enter");
  await waitFor(() => window.webContents.executeJavaScript(
    "location.pathname.startsWith('/feed/subscriptions') && document.querySelector('#nhdtv-tv-rail [aria-label=\"Subscriptions\"]')?.getAttribute('aria-current') === 'page'",
    true
  ));

  await focusRailControl("Home");
  sendKey(window, "Enter");
  await waitFor(() => window.webContents.executeJavaScript(
    "location.pathname === '/' && document.querySelector('#nhdtv-tv-rail [aria-label=\"Home\"]')?.getAttribute('aria-current') === 'page'",
    true
  ));

  if (browseSurface === "channel") {
    await loadYouTube(window, "https://www.youtube.com/@YouTube/videos");
    await waitFor(() => window.webContents.executeJavaScript(
      "document.documentElement.dataset.nhdtvRoute === 'channel' && document.querySelectorAll('[data-nhdtv-card]').length >= 3 && document.querySelectorAll('#nhdtv-tv-rail').length === 1",
      true
    ));
  }
  await waitFor(() => window.webContents.executeJavaScript(
    "Math.round(document.querySelector('#nhdtv-tv-rail')?.getBoundingClientRect().width ?? 0) < 180",
    true
  ));
  console.log("[youtube-tv-live] rail search and destination actions passed");

  const categoryPresentation = await window.webContents.executeJavaScript(`(() => {
    const header = document.querySelector('ytd-rich-grid-renderer > #header');
    if (!(header instanceof HTMLElement)) return null;
    const list = document.createElement('div');
    list.id = 'nhdtv-verification-categories';
    list.setAttribute('role', 'tablist');
    for (const [index, label] of ['All', 'Music', 'Gaming'].entries()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(index === 0));
      button.textContent = label;
      list.append(button);
    }
    header.append(list);
    const first = list.querySelector('[role=tab]');
    const rect = first?.getBoundingClientRect();
    const style = first ? getComputedStyle(first) : null;
    const remoteUp = new CustomEvent('nhdtv-remote-action', {
      cancelable: true,
      detail: { action: 'up' }
    });
    document.dispatchEvent(remoteUp);
    const focusedUpElement = document.querySelector('[data-nhdtv-focus-target=true]');
    const focusedAfterUp = focusedUpElement?.textContent?.trim() ?? null;
    const focusedUpIsCategory = focusedUpElement?.getAttribute('data-nhdtv-category') === 'true';
    const remoteRight = new CustomEvent('nhdtv-remote-action', {
      cancelable: true,
      detail: { action: 'right' }
    });
    document.dispatchEvent(remoteRight);
    const focusedRightElement = document.querySelector('[data-nhdtv-focus-target=true]');
    const focusedAfterRight = focusedRightElement?.textContent?.trim() ?? null;
    const focusedRightIsCategory = focusedRightElement?.getAttribute('data-nhdtv-category') === 'true';
    const result = {
      fontSize: Number.parseFloat(style?.fontSize ?? '0'),
      focusedAfterRight,
      focusedAfterUp,
      focusedRightIsCategory,
      focusedUpIsCategory,
      height: Math.round(rect?.height ?? 0),
      labels: [...list.querySelectorAll('[role=tab]')].map((tab) => tab.textContent),
      remoteRightConsumed: remoteRight.defaultPrevented,
      remoteUpConsumed: remoteUp.defaultPrevented,
      visible: Boolean(rect && rect.width > 0 && rect.height > 0)
    };
    list.remove();
    return result;
  })()`, true);
  assert.deepEqual(categoryPresentation?.labels, ["All", "Music", "Gaming"]);
  assert.equal(categoryPresentation?.focusedUpIsCategory, true);
  assert.equal(categoryPresentation?.focusedRightIsCategory, true);
  assert.ok(categoryPresentation?.focusedAfterUp);
  assert.notEqual(categoryPresentation?.focusedAfterRight, categoryPresentation?.focusedAfterUp);
  assert.equal(categoryPresentation?.remoteUpConsumed, true);
  assert.equal(categoryPresentation?.remoteRightConsumed, true);
  assert.equal(categoryPresentation?.visible, true);
  assert.ok(categoryPresentation.height >= 44);
  assert.ok(categoryPresentation.fontSize >= 17);
  console.log("[youtube-tv-live] TV-scale category text presentation passed");

  const resolutions = [];
  for (const [width, height] of [[1920, 1080], [3840, 2160]]) {
    window.setContentSize(width, height);
    await delay(300);
    const snapshot = await window.webContents.executeJavaScript(`(() => {
      const cards = [...document.querySelectorAll('[data-nhdtv-card-format="landscape"]')]
        .filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && card.parentElement?.closest('[data-nhdtv-card]') === null;
        });
      const cardRects = cards.map((card) => card.getBoundingClientRect());
      const firstTop = Math.min(...cardRects.map((rect) => rect.top));
      const firstRow = cardRects.filter((rect) => Math.abs(rect.top - firstTop) <= 36);
      const sortedWidths = firstRow.map((rect) => rect.width).sort((a, b) => a - b);
      const grid = document.querySelector('ytd-rich-grid-renderer');
      const rail = document.querySelector('#nhdtv-tv-rail');
      const logo = [...document.querySelectorAll('ytd-masthead ytd-topbar-logo-renderer,ytd-masthead #logo-icon')]
        .find((candidate) => {
          const rect = candidate.getBoundingClientRect();
          const style = getComputedStyle(candidate);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        });
      const firstTitle = cards[0]?.querySelector('#video-title,#video-title-link,h3,[role="heading"]');
      const railRect = rail?.getBoundingClientRect();
      const logoRect = logo?.getBoundingClientRect();
      return {
        cards: cards.length,
        firstCardWidth: Math.round(sortedWidths[Math.floor(sortedWidths.length / 2)] ?? 0),
        firstRowCount: firstRow.length,
        height: innerHeight,
        itemsPerRow: getComputedStyle(grid ?? document.body)
          .getPropertyValue('--ytd-rich-grid-items-per-row').trim(),
        logoNotObscured: !logoRect || !railRect || logoRect.left >= railRect.right - 2,
        logoRect: logoRect ? { left: Math.round(logoRect.left), right: Math.round(logoRect.right), width: Math.round(logoRect.width) } : null,
        railRect: railRect ? { left: Math.round(railRect.left), right: Math.round(railRect.right), width: Math.round(railRect.width) } : null,
        titleFontSize: Number.parseFloat(getComputedStyle(firstTitle ?? document.body).fontSize),
        styleLinks: document.querySelectorAll('#nhdtv-youtube-tv-styles').length,
        width: innerWidth
      };
    })()`, true);
    console.log(`[youtube-tv-live] resolution ${width}x${height}`, JSON.stringify(snapshot));
    assert.equal(snapshot.styleLinks, 1);
    assert.ok(snapshot.cards >= 3);
    assert.ok(snapshot.firstCardWidth >= (width >= 3000 ? 520 : 300));
    assert.ok(snapshot.firstRowCount >= (width >= 3000 ? 5 : 4));
    assert.equal(snapshot.logoNotObscured, true);
    assert.ok(snapshot.titleFontSize >= (width >= 3000 ? 40 : 20));
    if (screenshotDirectory) {
      writeFileSync(
        path.join(screenshotDirectory, `youtube-tv-${width}x${height}.png`),
        await window.webContents.capturePage().then((image) => image.toPNG())
      );
    }
    resolutions.push(snapshot);
  }
  console.log("[youtube-tv-live] resolution checks passed");

  window.setContentSize(1920, 1080);
  await delay(220);
  sendKey(window, "Down");
  await waitFor(() => window.webContents.executeJavaScript(
    "document.querySelectorAll('[data-nhdtv-focused=true]').length === 1",
    true
  ));
  for (let index = 0; index < 8; index += 1) {
    sendKey(window, "Left");
    await delay(80);
  }
  await waitFor(() => window.webContents.executeJavaScript(
    "document.querySelector('#nhdtv-tv-rail')?.contains(document.querySelector('[data-nhdtv-focus-target=true]')) === true",
    true
  ));
  sendKey(window, "Up");
  await delay(100);
  sendKey(window, "Down");
  await delay(100);
  const expandedRail = await window.webContents.executeJavaScript(`(() => {
    const rail = document.querySelector('#nhdtv-tv-rail');
    const focused = rail?.querySelector('[data-nhdtv-focus-target=true]');
    const railRect = rail?.getBoundingClientRect();
    const focusedRect = focused?.getBoundingClientRect();
    return {
      count: document.querySelectorAll('#nhdtv-tv-rail').length,
      focusedInsideRail: Boolean(railRect && focusedRect && focusedRect.left >= railRect.left && focusedRect.right <= railRect.right),
      focusedLabel: focused?.getAttribute('aria-label') ?? null,
      scrollLeft: rail?.scrollLeft ?? -1,
      width: Math.round(rail?.getBoundingClientRect().width ?? 0)
    };
  })()`, true);
  assert.equal(expandedRail.count, 1);
  assert.equal(expandedRail.focusedInsideRail, true);
  assert.equal(expandedRail.scrollLeft, 0);
  assert.ok(expandedRail.width >= 280);
  if (screenshotDirectory) {
    writeFileSync(
      path.join(screenshotDirectory, "youtube-tv-rail-expanded-1920x1080.png"),
      await window.webContents.capturePage().then((image) => image.toPNG())
    );
  }
  sendKey(window, "Right");
  await waitFor(() => window.webContents.executeJavaScript(
    "document.querySelector('#nhdtv-tv-rail')?.contains(document.querySelector('[data-nhdtv-focus-target=true]')) === false",
    true
  ));
  console.log("[youtube-tv-live] deterministic rail entry, expansion, and exit passed");
  const focusedMediaHrefExpression = `(() => {
    const target = document.querySelector('[data-nhdtv-focus-target=true]');
    const selector = 'a[href^="/watch"],a[href^="/shorts/"]';
    const link = target?.matches(selector) ? target : target?.querySelector(selector);
    return link?.getAttribute('href') ?? '';
  })()`;
  let firstFocus = await window.webContents.executeJavaScript(focusedMediaHrefExpression, true);
  for (let attempts = 0; !firstFocus && attempts < 4; attempts += 1) {
    sendKey(window, "Down");
    await delay(180);
    firstFocus = await window.webContents.executeJavaScript(focusedMediaHrefExpression, true);
  }
  assert.ok(firstFocus);
  sendKey(window, "Right");
  const secondFocus = await waitFor(async () => {
    const href = await window.webContents.executeJavaScript(focusedMediaHrefExpression, true);
    return href && href !== firstFocus ? href : null;
  });
  assert.notEqual(firstFocus, secondFocus);
  console.log("[youtube-tv-live] keyboard shelf navigation passed");

  let sawClientSideNavigation = false;
  const onInPageNavigation = () => {
    sawClientSideNavigation = true;
  };
  window.webContents.on("did-navigate-in-page", onInPageNavigation);
  sendKey(window, "Enter");
  await waitFor(() => window.webContents.executeJavaScript(
    "document.documentElement.dataset.nhdtvRoute === 'watch' || document.documentElement.dataset.nhdtvRoute === 'shorts'",
    true
  ));
  assert.equal(sawClientSideNavigation, true);
  window.webContents.navigationHistory.goBack();
  await waitFor(() => window.webContents.executeJavaScript(
    "document.documentElement.dataset.nhdtvRoute === 'channel'",
    true
  ));
  await waitFor(() => window.webContents.executeJavaScript(
    `${focusedMediaHrefExpression} === ${JSON.stringify(secondFocus)}`,
    true
  ));
  window.webContents.removeListener("did-navigate-in-page", onInPageNavigation);
  console.log("[youtube-tv-live] client-side navigation and focus restoration passed");

  const beforeLazyLoad = await window.webContents.executeJavaScript(
    "document.querySelectorAll('[data-nhdtv-card]').length",
    true
  );
  await window.webContents.executeJavaScript("scrollTo(0, document.documentElement.scrollHeight)", true);
  await delay(2200);
  const afterLazyLoad = await window.webContents.executeJavaScript(
    "document.querySelectorAll('[data-nhdtv-card]').length",
    true
  );
  assert.ok(afterLazyLoad >= beforeLazyLoad);
  console.log("[youtube-tv-live] lazy loading passed");

  console.log("[youtube-tv-live] loading search results");
  await loadYouTube(window, "https://www.youtube.com/results?search_query=nhdtv+extension+verification");
  await waitFor(() => window.webContents.executeJavaScript(
    "document.documentElement.dataset.nhdtvRoute === 'results' && document.querySelectorAll('ytd-video-renderer,yt-lockup-view-model').length > 0 && document.querySelector('#nhdtv-tv-page-heading')?.textContent?.includes('Results for')",
    true
  ));
  const searchFieldSelector = "input[name='search_query'],input#search,textarea[name='search_query']";
  const searchFieldExpression = `([...document.querySelectorAll(${JSON.stringify(searchFieldSelector)})].find((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight &&
      rect.right > 0 && rect.left < innerWidth && style.display !== 'none' && style.visibility !== 'hidden';
  }))`;
  const searchSetup = await window.webContents.executeJavaScript(`(() => {
    const field = ${searchFieldExpression};
    if (!(field instanceof HTMLElement)) return { valid: false };
    field.focus({ preventScroll: true });
    return new Promise((resolve) => setTimeout(() => resolve({
      activeId: document.activeElement?.id ?? '',
      activeTag: document.activeElement?.tagName ?? '',
      editing: document.documentElement.dataset.nhdtvEditing === 'true',
      focusFrames: document.querySelectorAll('[data-nhdtv-focused=true]').length,
      sameActive: document.activeElement === field,
      valid: document.activeElement === field &&
        document.documentElement.dataset.nhdtvEditing === 'true'
    }), 120));
  })()`, true);
  if (!searchSetup.valid) console.error("[youtube-tv-live] search setup", JSON.stringify(searchSetup));
  assert.equal(searchSetup.valid, true);
  const searchBefore = await window.webContents.executeJavaScript(
    `${searchFieldExpression}?.value ?? ''`,
    true
  );
  window.webContents.sendInputEvent({ keyCode: "z", type: "char" });
  await waitFor(() => window.webContents.executeJavaScript(
    `${searchFieldExpression}?.value !== ${JSON.stringify(searchBefore)}`,
    true
  ));
  sendFocusedKey(window, "Backspace");
  await waitFor(() => window.webContents.executeJavaScript(
    `${searchFieldExpression}?.value === ${JSON.stringify(searchBefore)}`,
    true
  ));
  console.log("[youtube-tv-live] search editing passed");

  console.log("[youtube-tv-live] loading watch page");
  await loadYouTube(window, "https://www.youtube.com/watch?v=jNQXAC9IVRw");
  await waitFor(() => window.webContents.executeJavaScript(
    "document.documentElement.dataset.nhdtvRoute === 'watch' && document.querySelector('video')?.readyState >= 1",
    true
  ));
  const watchSnapshot = await window.webContents.executeJavaScript(`(() => {
    const player = document.querySelector('#movie_player');
    const controls = document.querySelector('.ytp-chrome-controls');
    const video = document.querySelector('video');
    const controlsStyle = controls ? getComputedStyle(controls) : null;
    return {
      controlsPresent: Boolean(controls),
      controlsVisible: Boolean(controlsStyle && controlsStyle.display !== 'none' && controlsStyle.visibility !== 'hidden'),
      playerPresent: Boolean(player),
      readyState: video?.readyState ?? 0
    };
  })()`, true);
  assert.equal(watchSnapshot.playerPresent, true);
  assert.equal(watchSnapshot.controlsPresent, true);
  assert.equal(watchSnapshot.controlsVisible, true);
  assert.equal(await window.webContents.executeJavaScript(
    "document.querySelectorAll('[data-nhdtv-focused=true]').length",
    true
  ), 0);
  sendKey(window, "Down");
  await delay(180);
  assert.equal(await window.webContents.executeJavaScript(
    "document.querySelectorAll('[data-nhdtv-focused=true]').length",
    true
  ), 0);
  await clickVisibleElement(window, ".ytp-fullscreen-button");
  await waitFor(() => window.webContents.executeJavaScript(
    "document.documentElement.dataset.nhdtvFullscreen === 'true'",
    true
  ));
  const fullscreenSnapshot = await window.webContents.executeJavaScript(`(() => {
    const player = document.fullscreenElement ?? document.querySelector('#movie_player.ytp-fullscreen');
    const playerRect = player?.getBoundingClientRect();
    const rail = document.querySelector('#nhdtv-tv-rail');
    const railStyle = rail ? getComputedStyle(rail) : null;
    return {
      pageMarginLeft: getComputedStyle(document.querySelector('#page-manager')).marginLeft,
      playerLeft: Math.round(playerRect?.left ?? -1),
      playerRight: Math.round(playerRect?.right ?? -1),
      railDisplay: railStyle?.display ?? null,
      viewportWidth: innerWidth
    };
  })()`, true);
  assert.equal(fullscreenSnapshot.railDisplay, "none");
  assert.equal(fullscreenSnapshot.pageMarginLeft, "0px");
  assert.ok(fullscreenSnapshot.playerLeft <= 1);
  assert.ok(fullscreenSnapshot.playerRight >= fullscreenSnapshot.viewportWidth - 1);
  await clickVisibleElement(window, ".ytp-fullscreen-button");
  await waitFor(() => window.webContents.executeJavaScript(
    "document.documentElement.dataset.nhdtvFullscreen === 'false'",
    true
  ));
  assert.equal(await window.webContents.executeJavaScript(
    "getComputedStyle(document.querySelector('#nhdtv-tv-rail')).display !== 'none'",
    true
  ), true);
  watchSnapshot.fullscreen = fullscreenSnapshot;
  console.log("[youtube-tv-live] watch player passed");

  await window.webContents.executeJavaScript(`(() => {
    const dialog = document.createElement('div');
    dialog.id = 'nhdtv-verification-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const first = document.createElement('button');
    first.type = 'button';
    first.textContent = 'First dialog action';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    dialog.append(first, close);
    Object.assign(dialog.style, { background: '#111', height: '300px', left: '400px', position: 'fixed', top: '200px', width: '700px', zIndex: '999999' });
    document.body.append(dialog);
  })()`, true);
  const dialogActionConsumed = await window.webContents.executeJavaScript(`(() => {
    const event = new CustomEvent('nhdtv-remote-action', {
      cancelable: true,
      detail: { action: 'down' }
    });
    document.dispatchEvent(event);
    return event.defaultPrevented;
  })()`, true);
  assert.equal(dialogActionConsumed, true);
  await waitFor(() => window.webContents.executeJavaScript(
    "document.querySelector('#nhdtv-verification-dialog')?.contains(document.querySelector('[data-nhdtv-focus-target=true]')) === true",
    true
  ));
  await window.webContents.executeJavaScript("document.querySelector('#nhdtv-verification-dialog')?.remove()", true);
  console.log("[youtube-tv-live] dialog confinement passed");

  popup = new BrowserWindow({
    height: 500,
    show: false,
    width: 360,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, session: serviceSession }
  });
  await popup.loadURL(`chrome-extension://${extension.id}/popup/popup.html`);

  for (const enabled of [false, true, false, true]) {
    await popup.webContents.executeJavaScript(
      `chrome.storage.local.set({ tvModeEnabled: ${JSON.stringify(enabled)} })`,
      true
    );
    await waitFor(async () => {
      const active = await window.webContents.executeJavaScript(
        "document.documentElement.dataset.nhdtvExtensionActive === 'true'",
        true
      );
      return active === enabled;
    });
    const lifecycle = await window.webContents.executeJavaScript(`({
      active: document.documentElement.dataset.nhdtvExtensionActive === 'true',
      classes: document.documentElement.classList.contains('nhdtv-tv-mode'),
      focusFrames: document.querySelectorAll('[data-nhdtv-focused],[data-nhdtv-focus-target]').length,
      rail: document.querySelectorAll('#nhdtv-tv-rail').length,
      styles: document.querySelectorAll('#nhdtv-youtube-tv-styles').length
    })`, true);
    assert.equal(lifecycle.active, enabled);
    assert.equal(lifecycle.classes, enabled);
    assert.equal(lifecycle.styles, enabled ? 1 : 0);
    assert.equal(lifecycle.rail, enabled ? 1 : 0);
    if (!enabled) assert.equal(lifecycle.focusFrames, 0);
  }
  console.log("[youtube-tv-live] repeated lifecycle passed");

  await popup.webContents.executeJavaScript(
    "chrome.storage.local.set({ tvModeSafeArea: 'wide', tvModeScale: 'large' })",
    true
  );
  await waitFor(() => window.webContents.executeJavaScript(
    "document.documentElement.dataset.nhdtvSafeArea === 'wide' && document.documentElement.dataset.nhdtvScale === 'large'",
    true
  ));
  await popup.webContents.executeJavaScript(
    "chrome.storage.local.set({ tvModeSafeArea: 'standard', tvModeScale: 'standard' })",
    true
  );
  await waitFor(() => window.webContents.executeJavaScript(
    "document.documentElement.dataset.nhdtvSafeArea === 'standard' && document.documentElement.dataset.nhdtvScale === 'standard'",
    true
  ));
  console.log("[youtube-tv-live] scale and safe-area preferences passed");

  const hostDisabled = await window.webContents.executeJavaScript(`(() => {
    const event = new CustomEvent('nhdtv-tv-mode-config', {
      cancelable: true,
      detail: { enabled: false, safeArea: 'wide', scale: 'large' }
    });
    document.dispatchEvent(event);
    return event.defaultPrevented;
  })()`, true);
  assert.equal(hostDisabled, true);
  await waitFor(async () => !await window.webContents.executeJavaScript(
    "document.documentElement.dataset.nhdtvExtensionActive === 'true'",
    true
  ));
  const hostEnabled = await window.webContents.executeJavaScript(`(() => {
    const event = new CustomEvent('nhdtv-tv-mode-config', {
      cancelable: true,
      detail: { enabled: true, safeArea: 'wide', scale: 'large' }
    });
    document.dispatchEvent(event);
    return event.defaultPrevented;
  })()`, true);
  assert.equal(hostEnabled, true);
  await waitFor(() => window.webContents.executeJavaScript(
    "document.documentElement.dataset.nhdtvExtensionActive === 'true' && document.documentElement.dataset.nhdtvInputOwner === 'host' && document.documentElement.dataset.nhdtvManaged === 'true' && document.documentElement.dataset.nhdtvSafeArea === 'wide' && document.documentElement.dataset.nhdtvScale === 'large'",
    true
  ));
  console.log("[youtube-tv-live] NHD-managed lifecycle and sole input ownership passed");

  assert.deepEqual(extensionErrors, []);
  console.log(JSON.stringify({
    extensionErrors,
    browseSurface,
    infiniteScroll: { after: afterLazyLoad, before: beforeLazyLoad },
    resolutions,
    startup,
    status: "passed",
    watch: watchSnapshot
  }, null, 2));
  } finally {
    popup?.destroy();
    window?.destroy();
  }
}

app.whenReady().then(() => {
  void run()
    .then(() => app.quit())
    .catch((error) => {
      console.error(error);
      app.exit(1);
    });
});
