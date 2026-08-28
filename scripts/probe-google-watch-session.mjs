import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, session } from "electron";
import { openGoogleWatchCache } from "./google-watch-cache.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const probeDirectory = path.join(projectRoot, ".cache", "google-watch-probe");
const databasePath = path.join(probeDirectory, "watch-results.sqlite");
const countryCode = "US";
const queries = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
const completeOffers = process.argv.includes("--complete");
const probeQueries = queries.length > 0
  ? queries
  : ["Breaking Bad season 1 episode 3", "Apollo 13 movie"];

mkdirSync(probeDirectory, { recursive: true });
app.setName("NHD-TV Google Discovery Probe");
app.setPath("userData", path.join(probeDirectory, "electron-user-data"));

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function googleSearchUrl(query) {
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", countryCode.toLowerCase());
  url.searchParams.set("pws", "0");
  return url.toString();
}

function responseContainsProviderData(body) {
  return {
    bodyBytes: body.length,
    hasProviderData:
      /Where.{0,24}to.{0,24}watch/i.test(body) &&
      /netflix(?:\\u002e|\\x2e|\.)com|tv(?:\\u002e|\\x2e|\.)apple(?:\\u002e|\\x2e|\.)com|athome(?:\\u002e|\\x2e|\.)fandango(?:\\u002e|\\x2e|\.)com/i.test(body)
  };
}

async function sessionRequest(probeSession, url) {
  const startedAt = Date.now();
  const response = await probeSession.fetch(url, {
    cache: "no-store",
    credentials: "include",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9"
    },
    redirect: "follow"
  });
  const body = await response.text();
  return {
    ...responseContainsProviderData(body),
    body,
    elapsedMs: Date.now() - startedAt,
    status: response.status
  };
}

function requestSummary(request) {
  const { body: _body, ...summary } = request;
  return summary;
}

function parseIntentHints(query) {
  const season = query.match(/\bseason\s+(\d+)\b/i);
  const episode = query.match(/\bepisode\s+(\d+)\b/i);
  return {
    episodeNumber: episode === null ? null : Number(episode[1]),
    mediaType: episode === null ? (query.match(/\bmovie\b/i) ? "movie" : null) : "episode",
    seasonNumber: season === null ? null : Number(season[1])
  };
}

function titleFromQuery(query) {
  return query
    .replace(/\bseason\s+\d+\b.*$/i, "")
    .replace(/\bmovie\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function waitForRenderedResult(window, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastDiagnostic = null;
  while (Date.now() < deadline) {
    lastDiagnostic = await window.webContents.executeJavaScript(`(() => {
      const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
      const lists = [...document.querySelectorAll('[role="list"]')];
      const watchList = lists.find((element) => /where to watch/i.test(normalize(element.innerText)));
      const bodyText = normalize(document.body?.innerText);
      return {
        bodyPrefix: bodyText.slice(0, 320),
        hasCaptcha:
          /our systems have detected unusual traffic|type the characters you see below/i.test(bodyText) ||
          location.hostname === "sorry.google.com",
        hasWatchList: Boolean(watchList),
        readyState: document.readyState,
        title: document.title,
        url: location.href
      };
    })()`, true);
    if (lastDiagnostic.hasCaptcha) {
      throw new Error(
        `Google presented an automated-traffic or CAPTCHA page: ${JSON.stringify(lastDiagnostic)}`
      );
    }
    if (lastDiagnostic.hasWatchList) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for Where to watch: ${JSON.stringify(lastDiagnostic)}`);
}

async function expandProviderList(window) {
  const expanded = await window.webContents.executeJavaScript(`(() => {
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
    const watchList = [...document.querySelectorAll('[role="list"]')]
      .find((element) => /where to watch/i.test(normalize(element.innerText)));
    const button = [...(watchList?.querySelectorAll('button') ?? [])]
      .find((candidate) => /^\\+\\d+ more$/i.test(normalize(candidate.innerText)));
    if (!button) return false;
    button.click();
    return true;
  })()`, true);
  if (expanded) await delay(350);
}

function extractionScript(rootExpression) {
  return `(() => {
    const root = ${rootExpression};
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
    const lists = [...root.querySelectorAll('[role="list"]')];
    const watchList = lists.find((element) => /where to watch/i.test(normalize(element.textContent)));
    if (!watchList) return null;
    const links = [...watchList.querySelectorAll('a[href]')];
    const candidateLinks = links.map((link) => ({
      href: link.href,
      label: normalize(link.textContent)
    }));
    const headings = [...root.querySelectorAll('h2')]
      .filter((element) => (element.compareDocumentPosition(watchList) & 4) !== 0)
      .map((element) => normalize(element.textContent))
      .filter((text) =>
        text &&
        text.length <= 200 &&
        !/^(search results|web results|videos|images|top stories|cast|ask anything in ai mode)$/i.test(text)
      );
    const resolvedTitle = headings.at(-1) ?? null;
    const lines = [...root.querySelectorAll('body *:not(style):not(script):not(noscript)')]
      .filter((element) => element.children.length === 0)
      .map((element) => normalize(element.textContent))
      .filter((text) => text && text.length <= 240);
    const resolvedSubtitle = lines.find((line) => /season\\s+\\d+.*episode\\s+\\d+/i.test(line)) ?? null;
    return { candidateLinks, resolvedSubtitle, resolvedTitle };
  })()`;
}

async function extractRenderedResult(window) {
  return window.webContents.executeJavaScript(extractionScript("document"), true);
}

async function extractRequestResult(window, body) {
  return window.webContents.executeJavaScript(
    extractionScript(`new DOMParser().parseFromString(${JSON.stringify(body)}, "text/html")`),
    true
  );
}

const providerNames = new Map([
  ["www.netflix.com", "Netflix"],
  ["netflix.com", "Netflix"],
  ["www.youtube.com", "YouTube"],
  ["youtube.com", "YouTube"],
  ["play.google.com", "Google Play Movies & TV"],
  ["tv.apple.com", "Apple TV"],
  ["athome.fandango.com", "Fandango"],
  ["www.amazon.com", "Amazon Prime Video"],
  ["amazon.com", "Amazon Prime Video"],
  ["www.hulu.com", "Hulu"],
  ["www.disneyplus.com", "Disney+"],
  ["www.max.com", "Max"],
  ["www.peacocktv.com", "Peacock"],
  ["www.paramountplus.com", "Paramount+"]
]);

function providerContentId(url) {
  if (url.hostname.endsWith("netflix.com")) return url.pathname.match(/\/watch\/(\d+)/)?.[1] ?? null;
  if (url.hostname.endsWith("youtube.com")) return url.searchParams.get("v");
  if (url.hostname === "play.google.com") return url.searchParams.get("id");
  if (url.hostname === "tv.apple.com") return url.pathname.match(/\/(umc\.cmc\.[^/?]+)/)?.[1] ?? null;
  if (url.hostname.endsWith("amazon.com")) return url.pathname.match(/\/detail\/([^/?]+)/)?.[1] ?? null;
  return url.pathname.split("/").filter(Boolean).at(-1) ?? null;
}

async function resolveCandidateUrl(resolverWindow, candidateUrl, timeoutMs = 5_000) {
  const parsed = new URL(candidateUrl);
  if (!parsed.hostname.endsWith("google.com") || parsed.pathname !== "/goto") {
    return { url: parsed, usedHiddenNavigation: false };
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolverWindow.webContents.removeListener("will-navigate", handleNavigation);
      resolverWindow.webContents.removeListener("will-redirect", handleNavigation);
      resolverWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      resolve(value);
    };
    const handleNavigation = (event, url) => {
      const nextUrl = new URL(url);
      if (providerNames.has(nextUrl.hostname)) {
        event.preventDefault();
        finish({ url: nextUrl, usedHiddenNavigation: true });
      }
    };
    const timeout = setTimeout(() => finish(null), timeoutMs);
    resolverWindow.webContents.on("will-navigate", handleNavigation);
    resolverWindow.webContents.on("will-redirect", handleNavigation);
    resolverWindow.webContents.setWindowOpenHandler(({ url }) => {
      const nextUrl = new URL(url);
      if (providerNames.has(nextUrl.hostname)) {
        finish({ url: nextUrl, usedHiddenNavigation: true });
      }
      return { action: "deny" };
    });
    resolverWindow.loadURL(parsed.href).catch((error) => {
      if (!settled && (!(error instanceof Error) || !error.message.includes("ERR_ABORTED"))) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  });
}

async function offersFromCandidates(resolverWindow, candidates) {
  const offers = [];
  let usedHiddenNavigation = false;
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate.href)) continue;
    seen.add(candidate.href);
    const resolution = await resolveCandidateUrl(resolverWindow, candidate.href);
    if (resolution === null) continue;
    const { url } = resolution;
    usedHiddenNavigation ||= resolution.usedHiddenNavigation;
    const providerName = providerNames.get(url.hostname);
    if (providerName === undefined) continue;
    const rawLabel = candidate.label;
    const priceText = rawLabel.match(/(?:From )?\$\d+(?:\.\d{2})?/i)?.[0] ?? null;
    const monetizationType = /subscription/i.test(rawLabel)
      ? "subscription"
      : /free/i.test(rawLabel)
        ? "free"
        : priceText === null ? null : "purchase_or_rental";
    offers.push({
      monetizationType,
      priceText,
      providerContentId: providerContentId(url),
      providerHost: url.hostname,
      providerName,
      rawLabel,
      watchUrl: url.href
    });
  }
  return { offers, usedHiddenNavigation };
}

async function loadUrl(window, url) {
  try {
    await window.loadURL(url);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("ERR_ABORTED")) throw error;
  }
}

let window;
let resolverWindow;
let cache;

async function run() {
  const probeSession = session.fromPartition("persist:google-watch-probe", { cache: true });
  window = new BrowserWindow({
    height: 720,
    paintWhenInitiallyHidden: true,
    show: false,
    width: 1280,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: probeSession,
      webSecurity: true
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  resolverWindow = new BrowserWindow({
    height: 180,
    paintWhenInitiallyHidden: true,
    show: false,
    width: 320,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: probeSession,
      webSecurity: true
    }
  });
  resolverWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  cache = openGoogleWatchCache(databasePath);

  const warmStartedAt = Date.now();
  await loadUrl(window, "https://www.google.com/?hl=en&gl=us&pws=0");
  const warmMs = Date.now() - warmStartedAt;
  console.log(`[google-watch-probe] warm browser ready in ${warmMs} ms`);

  for (const query of probeQueries) {
    const sourceUrl = googleSearchUrl(query);
    const beforeRender = await sessionRequest(probeSession, sourceUrl);
    let extracted = beforeRender.hasProviderData
      ? await extractRequestResult(window, beforeRender.body)
      : null;
    let resolution = extracted === null
      ? { offers: [], usedHiddenNavigation: false }
      : await offersFromCandidates(resolverWindow, extracted.candidateLinks);
    let offers = resolution.offers;
    let afterRender = null;
    let renderMs = null;
    let retrievalMode = resolution.usedHiddenNavigation
      ? "session-request-with-hidden-redirect"
      : "session-request";

    if (offers.length === 0 || completeOffers) {
      retrievalMode = "hidden-render";
      const renderStartedAt = Date.now();
      await loadUrl(window, sourceUrl);
      await waitForRenderedResult(window);
      await expandProviderList(window);
      extracted = await extractRenderedResult(window);
      renderMs = Date.now() - renderStartedAt;
      afterRender = await sessionRequest(probeSession, sourceUrl);
      resolution = extracted === null
        ? { offers: [], usedHiddenNavigation: false }
        : await offersFromCandidates(resolverWindow, extracted.candidateLinks);
      offers = resolution.offers;
      if (completeOffers && beforeRender.hasProviderData) {
        retrievalMode = "session-request-plus-rendered-enrichment";
      } else if (resolution.usedHiddenNavigation) {
        retrievalMode = "hidden-render-and-redirect";
      }
    }
    if (extracted === null || offers.length === 0) {
      throw new Error(`No provider links resolved for ${JSON.stringify(query)}: ` + JSON.stringify({
        afterRender: afterRender === null ? null : requestSummary(afterRender),
        beforeRender: requestSummary(beforeRender),
        extracted
      }));
    }

    const intentHints = parseIntentHints(query);
    const fetchedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const resolvedTitle = extracted.resolvedTitle ?? titleFromQuery(query);
    const resolvedSubtitle =
      extracted.resolvedSubtitle !== null &&
      extracted.resolvedSubtitle.toLocaleLowerCase("en-US") !== query.toLocaleLowerCase("en-US")
        ? extracted.resolvedSubtitle
        : intentHints.seasonNumber === null || intentHints.episodeNumber === null
          ? null
          : `Season ${intentHints.seasonNumber}, Episode ${intentHints.episodeNumber}`;
    cache.save({
      ...intentHints,
      countryCode,
      expiresAt,
      fetchedAt,
      offers,
      offersComplete: completeOffers || afterRender !== null,
      queryText: query,
      renderMs,
      requestAfterRenderHasData: afterRender?.hasProviderData ?? false,
      requestBeforeRenderHasData: beforeRender.hasProviderData,
      resolvedSubtitle,
      resolvedTitle,
      retrievalMode,
      source: "google-search",
      sourceUrl,
      warmMs
    });

    console.log(JSON.stringify({
      afterRender: afterRender === null ? null : requestSummary(afterRender),
      beforeRender: requestSummary(beforeRender),
      offers,
      query,
      renderMs,
      resolvedSubtitle,
      resolvedTitle,
      retrievalMode
    }, null, 2));
  }

  console.log(`[google-watch-probe] saved ${cache.exportRows().length} export rows to ${databasePath}`);
}

app.whenReady()
  .then(run)
  .catch((error) => {
    console.error("[google-watch-probe] failed", error);
    process.exitCode = 1;
  })
  .finally(() => {
    cache?.close();
    if (window !== undefined && !window.isDestroyed()) window.destroy();
    if (resolverWindow !== undefined && !resolverWindow.isDestroyed()) resolverWindow.destroy();
    app.exit(process.exitCode ?? 0);
  });
