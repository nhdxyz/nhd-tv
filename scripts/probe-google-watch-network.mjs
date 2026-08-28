import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, session } from "electron";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const probeDirectory = path.join(projectRoot, ".cache", "google-watch-probe");
const reportPath = path.join(probeDirectory, "network-probe.json");
const query = process.argv.slice(2).find((argument) => !argument.startsWith("--")) ??
  "Breaking Bad season 1 episode 3";
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

mkdirSync(probeDirectory, { recursive: true });
app.setName("NHD-TV Google Network Probe");
app.setPath("userData", path.join(probeDirectory, "electron-user-data"));
app.on("window-all-closed", () => undefined);

function googleSearchUrl(searchQuery) {
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", searchQuery);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");
  url.searchParams.set("pws", "0");
  return url.toString();
}

function endpointTemplate(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const keys = [...new Set(url.searchParams.keys())].sort();
    return `${url.origin}${url.pathname}${keys.length === 0 ? "" : `?${keys.join("&")}`}`;
  } catch {
    return "invalid-url";
  }
}

function markerSummary(body) {
  return {
    bodyBytes: body.length,
    hasApple: /tv(?:\\u002e|\\x2e|\.)apple(?:\\u002e|\\x2e|\.)com/i.test(body),
    hasFandango: /athome(?:\\u002e|\\x2e|\.)fandango(?:\\u002e|\\x2e|\.)com/i.test(body),
    hasNetflix: /netflix(?:\\u002e|\\x2e|\.)com/i.test(body),
    hasWhereToWatch: /Where.{0,24}to.{0,24}watch/i.test(body)
  };
}

function captureSessionRequests(probeSession) {
  const records = new Map();
  let phase = "idle";
  const filter = {
    urls: ["https://*.google.com/*", "https://google.com/*"]
  };

  probeSession.webRequest.onBeforeRequest(filter, (details, callback) => {
    if (!["mainFrame", "subFrame", "script", "xhr", "other"].includes(details.resourceType)) {
      callback({ cancel: false });
      return;
    }
    const bodyParts = (details.uploadData ?? [])
      .map((part) => part.bytes)
      .filter((bytes) => bytes !== undefined);
    records.set(details.id, {
      body: bodyParts.length === 0 ? null : Buffer.concat(bodyParts),
      completed: false,
      fromCache: null,
      headerNames: [],
      headers: {},
      id: details.id,
      method: details.method,
      phase,
      resourceType: details.resourceType,
      statusCode: null,
      template: endpointTemplate(details.url),
      url: details.url
    });
    callback({ cancel: false });
  });

  probeSession.webRequest.onCompleted(filter, (details) => {
    const record = records.get(details.id);
    if (record === undefined) return;
    record.completed = true;
    record.fromCache = details.fromCache;
    record.statusCode = details.statusCode;
  });

  return {
    close() {
      probeSession.webRequest.onBeforeRequest(filter, null);
      probeSession.webRequest.onCompleted(filter, null);
    },
    records,
    setPhase(nextPhase) {
      phase = nextPhase;
    }
  };
}

async function pageState(window) {
  return window.webContents.executeJavaScript(`(() => {
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
    const bodyText = normalize(document.body?.innerText);
    const watchList = [...document.querySelectorAll('[role="list"]')]
      .find((element) => /where to watch/i.test(normalize(element.innerText)));
    const moreButton = [...(watchList?.querySelectorAll('button') ?? [])]
      .find((button) => /^\\+\\d+ more$/i.test(normalize(button.innerText)));
    return {
      hasCaptcha:
        /our systems have detected unusual traffic|type the characters you see below/i.test(bodyText) ||
        location.hostname === "sorry.google.com",
      hasWatchList: Boolean(watchList),
      moreButtonLabel: moreButton ? normalize(moreButton.innerText) : null,
      providerLinkCount: watchList?.querySelectorAll('a[href]').length ?? 0,
      title: document.title,
      urlHost: location.hostname
    };
  })()`, true);
}

async function waitForPanel(window, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await pageState(window);
    if (state.hasCaptcha || state.hasWatchList) return state;
    await delay(100);
  }
  return state;
}

async function expandPanel(window) {
  return window.webContents.executeJavaScript(`(() => {
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
    const watchList = [...document.querySelectorAll('[role="list"]')]
      .find((element) => /where to watch/i.test(normalize(element.innerText)));
    const button = [...(watchList?.querySelectorAll('button') ?? [])]
      .find((candidate) => /^\\+\\d+ more$/i.test(normalize(candidate.innerText)));
    if (!button) return false;
    button.click();
    return true;
  })()`, true);
}

function summarizeRecords(records) {
  return [...records.values()].map((record) => ({
    completed: record.completed,
    fromCache: record.fromCache,
    headerNames: record.headerNames,
    method: record.method,
    phase: record.phase,
    resourceType: record.resourceType,
    statusCode: record.statusCode,
    template: record.template
  }));
}

function summarizeByEndpoint(records) {
  const groups = new Map();
  for (const record of records.values()) {
    const key = `${record.phase}|${record.method}|${record.resourceType}|${record.template}`;
    const group = groups.get(key) ?? {
      count: 0,
      fromCacheCount: 0,
      method: record.method,
      phase: record.phase,
      resourceType: record.resourceType,
      statusCodes: new Set(),
      template: record.template
    };
    group.count += 1;
    if (record.fromCache) group.fromCacheCount += 1;
    if (record.statusCode !== null) group.statusCodes.add(record.statusCode);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    statusCodes: [...group.statusCodes].sort()
  }));
}

async function replayCandidates(probeSession, records) {
  const ordered = [...records.values()]
    .filter((record) =>
      record.completed &&
      ["GET", "POST"].includes(record.method) &&
      ["mainFrame", "xhr", "other"].includes(record.resourceType) &&
      new URL(record.url).hostname.endsWith("google.com")
    )
    .sort((left, right) => {
      const phaseRank = (phase) => phase === "expand" ? 0 : phase === "navigation" ? 1 : 2;
      const typeRank = (type) => type === "xhr" ? 0 : type === "other" ? 1 : 2;
      return phaseRank(left.phase) - phaseRank(right.phase) ||
        typeRank(left.resourceType) - typeRank(right.resourceType);
    });
  const unique = [];
  const seen = new Set();
  for (const record of ordered) {
    const key = `${record.method}|${record.template}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(record);
    if (unique.length === 8) break;
  }

  const results = [];
  for (const record of unique) {
    const startedAt = Date.now();
    try {
      const response = await probeSession.fetch(record.url, {
        body: record.method === "POST" ? record.body : undefined,
        cache: "no-store",
        credentials: "include",
        headers: record.headers,
        method: record.method,
        redirect: "follow"
      });
      const body = await response.text();
      results.push({
        elapsedMs: Date.now() - startedAt,
        method: record.method,
        originalPhase: record.phase,
        originalType: record.resourceType,
        response: markerSummary(body),
        status: response.status,
        template: record.template
      });
    } catch (error) {
      results.push({
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        method: record.method,
        originalPhase: record.phase,
        originalType: record.resourceType,
        template: record.template
      });
    }
  }
  return results;
}

async function runScenario({ label, partition, persistent, replay }) {
  console.log(`[google-watch-network] starting ${label}`);
  const probeSession = session.fromPartition(partition, { cache: true });
  const capture = captureSessionRequests(probeSession);
  const window = new BrowserWindow({
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

  try {
    capture.setPhase("warmup");
    const warmStartedAt = Date.now();
    probeSession.preconnect({ numSockets: 1, url: "https://www.google.com" });
    const warmResponse = await probeSession.fetch("https://www.google.com/?hl=en&gl=us&pws=0", {
      credentials: "include",
      redirect: "follow"
    });
    await warmResponse.arrayBuffer();
    const warmMs = Date.now() - warmStartedAt;
    console.log(`[google-watch-network] ${label} warmed in ${warmMs} ms`);

    capture.setPhase("navigation");
    const navigationStartedAt = Date.now();
    let navigationError = null;
    try {
      await window.loadURL(googleSearchUrl(query));
    } catch (error) {
      navigationError = error instanceof Error ? error.message : String(error);
    }
    const initialState = await waitForPanel(window);
    const panelReadyMs = Date.now() - navigationStartedAt;
    console.log(`[google-watch-network] ${label} panel state ${JSON.stringify(initialState)}`);

    const requestsBeforeExpand = capture.records.size;
    capture.setPhase("expand");
    const expanded = initialState?.hasWatchList ? await expandPanel(window) : false;
    await delay(1_000);
    const expandedState = await pageState(window);
    const requestsAfterExpand = capture.records.size;
    capture.setPhase("idle");
    await delay(250);

    return {
      endpointGroups: summarizeByEndpoint(capture.records),
      expanded,
      expandedState,
      expansionRequestCount: requestsAfterExpand - requestsBeforeExpand,
      initialState,
      label,
      navigationError,
      panelReadyMs,
      persistent,
      records: summarizeRecords(capture.records),
      replayResults: replay ? await replayCandidates(probeSession, capture.records) : [],
      totalRequestCount: capture.records.size,
      warmMs
    };
  } finally {
    capture.close();
    window.destroy();
  }
}

async function run() {
  console.log("[google-watch-network] Electron ready");
  const cold = await runScenario({
    label: "cold-in-memory",
    partition: `google-watch-network-cold-${Date.now()}`,
    persistent: false,
    replay: false
  });
  const warm = await runScenario({
    label: "warm-persistent",
    partition: "persist:google-watch-probe",
    persistent: true,
    replay: true
  });
  const report = {
    capturedAt: new Date().toISOString(),
    query,
    scenarios: [cold, warm]
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({
    reportPath,
    scenarios: report.scenarios.map((scenario) => ({
      endpointGroups: scenario.endpointGroups,
      expanded: scenario.expanded,
      expandedState: scenario.expandedState,
      expansionRequestCount: scenario.expansionRequestCount,
      initialState: scenario.initialState,
      label: scenario.label,
      navigationError: scenario.navigationError,
      panelReadyMs: scenario.panelReadyMs,
      replayResults: scenario.replayResults,
      totalRequestCount: scenario.totalRequestCount,
      warmMs: scenario.warmMs
    }))
  }, null, 2));
}

console.log("[google-watch-network] waiting for Electron");
app.whenReady()
  .then(run)
  .catch((error) => {
    console.error("[google-watch-network] failed", error);
    process.exitCode = 1;
  })
  .finally(() => app.exit(process.exitCode ?? 0));
