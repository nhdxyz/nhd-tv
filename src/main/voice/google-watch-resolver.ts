import { BrowserWindow, session, type Session } from "electron";
import type { VoiceMediaIntent } from "./voice-intent";
import {
  GoogleWatchCache,
  type GoogleWatchOffer,
  type GoogleWatchResult
} from "./google-watch-cache";

const MAX_GOOGLE_RESPONSE_BYTES = 5 * 1024 * 1024;
const PANEL_TIMEOUT_MS = 12_000;
const REDIRECT_TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const PROVIDER_BODY_HOST_PATTERN = new RegExp([
  "(?:netflix|youtube|amazon|primevideo|hulu|disneyplus|max|hbomax|sling|peacocktv|paramountplus)",
  "(?:\\\\u002e|\\\\x2e|\\.)com",
  "|tv(?:\\\\u002e|\\\\x2e|\\.)apple(?:\\\\u002e|\\\\x2e|\\.)com",
  "|play(?:\\\\u002e|\\\\x2e|\\.)google(?:\\\\u002e|\\\\x2e|\\.)com",
  "|athome(?:\\\\u002e|\\\\x2e|\\.)fandango(?:\\\\u002e|\\\\x2e|\\.)com"
].join(""), "i");

const PROVIDER_NAMES: ReadonlyMap<string, string> = new Map([
  ["www.netflix.com", "Netflix"],
  ["netflix.com", "Netflix"],
  ["www.youtube.com", "YouTube"],
  ["youtube.com", "YouTube"],
  ["play.google.com", "Google Play Movies & TV"],
  ["tv.apple.com", "Apple TV"],
  ["athome.fandango.com", "Fandango"],
  ["www.amazon.com", "Amazon Prime Video"],
  ["amazon.com", "Amazon Prime Video"],
  ["www.primevideo.com", "Amazon Prime Video"],
  ["primevideo.com", "Amazon Prime Video"],
  ["www.hulu.com", "Hulu"],
  ["www.disneyplus.com", "Disney+"],
  ["www.max.com", "Max"],
  ["play.max.com", "Max"],
  ["play.hbomax.com", "Max"],
  ["watch.sling.com", "Sling TV"],
  ["tv.youtube.com", "YouTube TV"],
  ["www.peacocktv.com", "Peacock"],
  ["www.paramountplus.com", "Paramount+"]
]);

interface ExtractedWatchPanel {
  candidateLinks: Array<{ href: string; label: string }>;
  episodeMetadataCandidates: string[];
  resolvedSubtitle: string | null;
  resolvedTitle: string | null;
}

export interface GoogleWatchLookup {
  countryCode: string;
  episodeNumber: number | null;
  mediaType: string;
  queryText: string;
  requestedTitle: string;
  seasonNumber: number | null;
}

export interface GoogleWatchResolverOptions {
  cache: GoogleWatchCache;
  partition?: string;
}

interface GoogleWatchResolutionOptions {
  completeOffers?: boolean;
  preferredProviderNames?: readonly string[];
  signal?: AbortSignal;
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(finish, milliseconds);
    const abort = () => finish(signal?.reason, true);
    function finish(reason?: unknown, aborted = false): void {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      if (aborted) reject(reason);
      else resolve();
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function settleOnAbort<T>(
  task: Promise<T>,
  signal: AbortSignal | undefined,
  onAbort: () => void
): Promise<T> {
  if (signal === undefined) return task;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      callback();
    };
    const abort = () => {
      try {
        onAbort();
      } catch {
        // Cancellation must still reject even if best-effort cleanup fails.
      } finally {
        finish(() => reject(
          signal.reason ?? new DOMException("The operation was aborted.", "AbortError")
        ));
      }
    };
    signal.addEventListener("abort", abort, { once: true });
    void task.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error))
    );
  });
}

function normalizedCountry(value: string): string {
  const country = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new TypeError("The Google watch region must be a two-letter country code.");
  }
  return country;
}

export function googleWatchSearchUrl(query: string, countryCode: string): string {
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", normalizedCountry(countryCode).toLowerCase());
  url.searchParams.set("pws", "0");
  return url.toString();
}

export function googleWatchLookupFromIntent(
  intent: VoiceMediaIntent,
  countryCode: string
): GoogleWatchLookup {
  const episodeSuffix = intent.mediaType === "episode"
    ? ` season ${intent.season} episode ${intent.episode}`
    : intent.mediaType === "movie" ? " movie" : "";
  return {
    countryCode: normalizedCountry(countryCode),
    episodeNumber: intent.episode,
    mediaType: intent.mediaType,
    queryText: `${intent.title}${episodeSuffix}`,
    requestedTitle: intent.title,
    seasonNumber: intent.season
  };
}

function normalizedMetadataText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

/**
 * Removes metadata that merely repeats a generated Google query. A query echo
 * is not independent evidence that Google resolved the requested movie or
 * episode, and trusting it can launch a different title or episode directly.
 */
export function googleWatchMetadataForLookup(
  lookup: Pick<
    GoogleWatchLookup,
    "episodeNumber" | "queryText" | "requestedTitle" | "seasonNumber"
  >,
  metadata: Pick<ExtractedWatchPanel, "resolvedSubtitle" | "resolvedTitle"> & {
    episodeMetadataCandidates?: readonly string[];
  }
): Pick<ExtractedWatchPanel, "resolvedSubtitle" | "resolvedTitle"> {
  const queryText = normalizedMetadataText(lookup.queryText);
  const queryAddsDisambiguation = queryText !== normalizedMetadataText(lookup.requestedTitle);
  const verified = (value: string | null): string | null => {
    const candidate = value?.replace(/\s+/g, " ").trim() ?? "";
    if (candidate.length === 0) return null;
    return queryAddsDisambiguation && normalizedMetadataText(candidate) === queryText
      ? null
      : candidate;
  };
  if (lookup.seasonNumber !== null && lookup.episodeNumber !== null) {
    const structuredEpisode = [...(metadata.episodeMetadataCandidates ?? [])]
      .reverse()
      .flatMap((candidate) => {
        if (normalizedMetadataText(candidate) === queryText) return [];
        const match = new RegExp(
          `^(.+?)\\s*:\\s*season\\s*0*${lookup.seasonNumber}` +
          `\\s*,?\\s*episode\\s*0*${lookup.episodeNumber}(?:\\D|$)`,
          "i"
        ).exec(candidate);
        if (match === null) return [];
        const title = match[1]?.replace(/\s+/g, " ").trim() ?? "";
        return title.length === 0
          ? []
          : [{ resolvedSubtitle: candidate, resolvedTitle: title }];
      })[0];
    if (structuredEpisode !== undefined) return structuredEpisode;
  }
  return {
    resolvedSubtitle: verified(metadata.resolvedSubtitle),
    resolvedTitle: verified(metadata.resolvedTitle)
  };
}

export function googleWatchCachedIdentityNeedsRefresh(
  lookup: Pick<GoogleWatchLookup, "queryText" | "requestedTitle">,
  result: Pick<GoogleWatchResult, "resolvedSubtitle" | "resolvedTitle">
): boolean {
  const queryText = normalizedMetadataText(lookup.queryText);
  if (queryText === normalizedMetadataText(lookup.requestedTitle)) return false;
  return [result.resolvedTitle, result.resolvedSubtitle].some((candidate) =>
    candidate !== null && normalizedMetadataText(candidate) === queryText
  );
}

function verifiedCachedResult(
  result: GoogleWatchResult,
  lookup: GoogleWatchLookup
): GoogleWatchResult {
  return {
    ...result,
    ...googleWatchMetadataForLookup(lookup, result)
  };
}

function providerIdentity(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "");
}

export function prioritizeGoogleWatchCandidates(
  candidates: readonly { href: string; label: string }[],
  preferredProviderNames: readonly string[]
): Array<{ href: string; label: string }> {
  const priorities = preferredProviderNames.map(providerIdentity);
  return candidates.map((candidate, position) => {
    const label = providerIdentity(candidate.label);
    const priority = priorities.findIndex((provider) => label.includes(provider));
    return {
      candidate,
      position,
      priority: priority < 0 ? Number.MAX_SAFE_INTEGER : priority
    };
  }).sort((left, right) =>
    left.priority - right.priority || left.position - right.position
  ).map(({ candidate }) => candidate);
}

function isPreferredLaunchableOffer(
  offer: GoogleWatchOffer,
  preferredProviderNames: readonly string[]
): boolean {
  if (preferredProviderNames[0] !== offer.providerName) return false;
  if (offer.monetizationType === "subscription" || offer.monetizationType === "free") {
    return true;
  }
  return offer.monetizationType === null &&
    offer.priceText === null &&
    (offer.providerName === "Netflix" || offer.providerName === "Disney+");
}

function providerContentId(url: URL): string | null {
  if (url.hostname.endsWith("netflix.com")) {
    return url.pathname.match(/\/watch\/(\d+)/)?.[1] ?? null;
  }
  if (url.hostname.endsWith("youtube.com")) return url.searchParams.get("v");
  if (url.hostname === "play.google.com") return url.searchParams.get("id");
  if (url.hostname === "tv.apple.com") {
    return url.pathname.match(/\/(umc\.cmc\.[^/?]+)/)?.[1] ?? null;
  }
  if (url.hostname.endsWith("amazon.com") || url.hostname.endsWith("primevideo.com")) {
    return url.pathname.match(/\/detail\/([^/?]+)/)?.[1] ?? null;
  }
  return url.pathname.split("/").filter(Boolean).at(-1) ?? null;
}

export function googleWatchOfferFromUrl(
  urlValue: string,
  rawLabelValue: string
): GoogleWatchOffer | null {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    return null;
  }
  if (url.hostname === "www.youtube.com" && url.pathname === "/attribution_link") {
    const target = url.searchParams.get("u");
    if (target === null) return null;
    try {
      const unwrapped = new URL(target, "https://www.youtube.com");
      if (unwrapped.origin !== "https://www.youtube.com") return null;
      url = unwrapped;
    } catch {
      return null;
    }
  }
  const providerName = PROVIDER_NAMES.get(url.hostname);
  if (url.protocol !== "https:" || providerName === undefined) return null;

  const rawLabel = rawLabelValue.replace(/\s+/g, " ").trim().slice(0, 240);
  const priceText = rawLabel.match(/(?:From )?\$\d+(?:\.\d{2})?/i)?.[0] ?? null;
  let monetizationType: string | null = null;
  if (
    /requires?\s+(?:an?\s+)?add[ -]?on|add[ -]?on|required channel|primetime subscription/i
      .test(rawLabel)
  ) {
    monetizationType = "add_on";
  } else if (/subscription/i.test(rawLabel)) {
    monetizationType = "subscription";
  } else if (/free/i.test(rawLabel)) {
    monetizationType = "free";
  } else if (priceText !== null) {
    monetizationType = "purchase_or_rental";
  }
  return {
    monetizationType,
    priceText,
    providerContentId: providerContentId(url),
    providerHost: url.hostname,
    providerName,
    rawLabel: rawLabel.length === 0 ? null : rawLabel,
    watchUrl: url.href
  };
}

function responseContainsProviderData(body: string): boolean {
  return /Where.{0,24}to.{0,24}watch/i.test(body) &&
    PROVIDER_BODY_HOST_PATTERN.test(body);
}

function extractionScript(rootExpression: string): string {
  return `(() => {
    const root = ${rootExpression};
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
    const lists = [...root.querySelectorAll('[role="list"]')];
    const watchList = lists.find((element) => /where to watch/i.test(normalize(element.textContent)));
    if (!watchList) return null;
    const candidateLinks = [...watchList.querySelectorAll('a[href]')].map((link) => ({
      href: link.href,
      label: normalize(link.textContent).slice(0, 240)
    }));
    const headings = [...root.querySelectorAll('h2')]
      .filter((element) => (element.compareDocumentPosition(watchList) & 4) !== 0)
      .map((element) => normalize(element.textContent))
      .filter((text) => text && text.length <= 200 &&
        !/^(search results|web results|videos|images|top stories|cast|ask anything in ai mode)$/i.test(text));
    const lines = [...root.querySelectorAll('body *:not(style):not(script):not(noscript)')]
      .filter((element) => element.children.length === 0)
      .filter((element) => (element.compareDocumentPosition(watchList) & 4) !== 0)
      .map((element) => normalize(element.textContent))
      .filter((text) => text && text.length <= 240);
    return {
      candidateLinks,
      episodeMetadataCandidates: lines.filter((line) =>
        /season\\s+\\d+.*episode\\s+\\d+|\\bs\\s*\\d+\\s*e\\s*\\d+\\b/i.test(line)
      ),
      resolvedSubtitle: lines.find((line) =>
        /season\\s+\\d+.*episode\\s+\\d+|\\bs\\s*\\d+\\s*e\\s*\\d+\\b/i.test(line)
      ) ?? null,
      resolvedTitle: headings.at(-1) ?? null
    };
  })()`;
}

function parsedExtraction(value: unknown): ExtractedWatchPanel | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.candidateLinks)) return null;
  const candidateLinks = candidate.candidateLinks.flatMap((linkValue) => {
    if (typeof linkValue !== "object" || linkValue === null || Array.isArray(linkValue)) return [];
    const link = linkValue as Record<string, unknown>;
    return typeof link.href === "string" && typeof link.label === "string"
      ? [{ href: link.href, label: link.label }]
      : [];
  }).slice(0, 20);
  return {
    candidateLinks,
    episodeMetadataCandidates: Array.isArray(candidate.episodeMetadataCandidates)
      ? candidate.episodeMetadataCandidates.filter((line): line is string =>
        typeof line === "string"
      ).map((line) => line.slice(0, 240)).slice(0, 40)
      : [],
    resolvedSubtitle: typeof candidate.resolvedSubtitle === "string"
      ? candidate.resolvedSubtitle.slice(0, 240)
      : null,
    resolvedTitle: typeof candidate.resolvedTitle === "string"
      ? candidate.resolvedTitle.slice(0, 200)
      : null
  };
}

async function loadUrl(
  window: BrowserWindow,
  url: string,
  signal?: AbortSignal
): Promise<void> {
  signal?.throwIfAborted();
  const stop = () => {
    try {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.stop();
      }
    } catch {
      // The resolver owner may already have destroyed this hidden window.
    }
  };
  signal?.addEventListener("abort", stop, { once: true });
  try {
    await window.loadURL(url);
  } catch (error) {
    signal?.throwIfAborted();
    if (!(error instanceof Error) || !error.message.includes("ERR_ABORTED")) throw error;
  } finally {
    signal?.removeEventListener("abort", stop);
  }
  signal?.throwIfAborted();
}

export class GoogleWatchResolver {
  #activeResolution: symbol | null = null;
  readonly #cache: GoogleWatchCache;
  readonly #partition: string;
  #probeSession: Session | null = null;
  #resolverWindow: BrowserWindow | null = null;
  #searchWindow: BrowserWindow | null = null;
  #sequence: Promise<void> = Promise.resolve();
  #warmMs: number | null = null;

  constructor(options: GoogleWatchResolverOptions) {
    this.#cache = options.cache;
    this.#partition = options.partition ?? "persist:google-watch-discovery";
  }

  async warm(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (this.#searchWindow !== null && !this.#searchWindow.isDestroyed()) return;
    const probeSession = session.fromPartition(this.#partition, { cache: true });
    this.#probeSession = probeSession;
    this.#searchWindow = this.#createWindow(probeSession, 1280, 720);
    this.#resolverWindow = this.#createWindow(probeSession, 360, 200);
    const startedAt = Date.now();
    probeSession.preconnect({ numSockets: 1, url: "https://www.google.com" });
    const response = await probeSession.fetch("https://www.google.com/?hl=en&pws=0", {
      credentials: "include",
      redirect: "follow",
      signal
    });
    await response.arrayBuffer();
    signal?.throwIfAborted();
    this.#warmMs = Date.now() - startedAt;
  }

  async resolve(
    lookup: GoogleWatchLookup,
    options: GoogleWatchResolutionOptions = {}
  ): Promise<GoogleWatchResult> {
    const signal = options.signal;
    signal?.throwIfAborted();
    const countryCode = normalizedCountry(lookup.countryCode);
    const completeOffers = options.completeOffers === true;
    const fresh = this.#cache.getFresh(lookup.queryText, countryCode);
    if (fresh !== null && (!completeOffers || fresh.offersComplete)) {
      if (!googleWatchCachedIdentityNeedsRefresh(lookup, fresh)) {
        return verifiedCachedResult(fresh, lookup);
      }
      this.#cache.invalidate(lookup.queryText, countryCode);
    }

    const resolution = Symbol("google-watch-resolution");
    const task = this.#sequence.catch(() => undefined).then(async () => {
      signal?.throwIfAborted();
      this.#activeResolution = resolution;
      try {
        const secondFresh = this.#cache.getFresh(lookup.queryText, countryCode);
        if (secondFresh !== null && (!completeOffers || secondFresh.offersComplete)) {
          if (!googleWatchCachedIdentityNeedsRefresh(lookup, secondFresh)) {
            return verifiedCachedResult(secondFresh, lookup);
          }
          this.#cache.invalidate(lookup.queryText, countryCode);
        }
        await this.warm(signal);
        return await this.#resolveUncached(
          { ...lookup, countryCode },
          completeOffers,
          options.preferredProviderNames ?? [],
          signal
        );
      } finally {
        if (this.#activeResolution === resolution) this.#activeResolution = null;
      }
    });
    this.#sequence = task.then(() => undefined, () => undefined);
    return settleOnAbort(task, signal, () => {
      if (this.#activeResolution === resolution) this.cancelActive();
    });
  }

  destroy(): void {
    for (const window of [this.#searchWindow, this.#resolverWindow]) {
      if (window !== null && !window.isDestroyed()) window.destroy();
    }
    this.#searchWindow = null;
    this.#resolverWindow = null;
    this.#probeSession = null;
  }

  cancelActive(): void {
    this.destroy();
    this.#activeResolution = null;
    this.#sequence = Promise.resolve();
  }

  #createWindow(probeSession: Session, width: number, height: number): BrowserWindow {
    const window = new BrowserWindow({
      height,
      paintWhenInitiallyHidden: true,
      show: false,
      width,
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
    return window;
  }

  async #sessionRequest(
    url: string,
    signal?: AbortSignal
  ): Promise<{ body: string; hasData: boolean }> {
    signal?.throwIfAborted();
    const probeSession = this.#probeSession;
    if (probeSession === null) throw new Error("The Google discovery session is unavailable.");
    const response = await probeSession.fetch(url, {
      cache: "no-store",
      credentials: "include",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9"
      },
      redirect: "follow",
      signal
    });
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (!response.ok || contentLength > MAX_GOOGLE_RESPONSE_BYTES) {
      return { body: "", hasData: false };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    signal?.throwIfAborted();
    if (bytes.byteLength > MAX_GOOGLE_RESPONSE_BYTES) return { body: "", hasData: false };
    const body = new TextDecoder().decode(bytes);
    return { body, hasData: responseContainsProviderData(body) };
  }

  async #extractRequestBody(body: string): Promise<ExtractedWatchPanel | null> {
    const window = this.#searchWindow;
    if (window === null || window.isDestroyed()) return null;
    const value: unknown = await window.webContents.executeJavaScript(
      extractionScript(`new DOMParser().parseFromString(${JSON.stringify(body)}, "text/html")`),
      true
    );
    return parsedExtraction(value);
  }

  async #extractRendered(): Promise<ExtractedWatchPanel | null> {
    const window = this.#searchWindow;
    if (window === null || window.isDestroyed()) return null;
    return parsedExtraction(
      await window.webContents.executeJavaScript(extractionScript("document"), true)
    );
  }

  async #waitForPanel(signal?: AbortSignal): Promise<void> {
    const window = this.#searchWindow;
    if (window === null || window.isDestroyed()) throw new Error("Google discovery stopped.");
    const deadline = Date.now() + PANEL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      const state = await window.webContents.executeJavaScript(`(() => {
        const text = String(document.body?.innerText ?? "").replace(/\\s+/g, " ").trim();
        return {
          captcha: /our systems have detected unusual traffic|type the characters you see below/i.test(text) || location.hostname === "sorry.google.com",
          watch: [...document.querySelectorAll('[role="list"]')]
            .some((element) => /where to watch/i.test(String(element.textContent ?? "")))
        };
      })()`, true) as { captcha: boolean; watch: boolean };
      if (state.captcha) throw new Error("Google discovery needs a cooldown before retrying.");
      if (state.watch) return;
      await delay(100, signal);
    }
    throw new Error("Google did not return a Where to watch panel for that title.");
  }

  async #expandPanel(signal?: AbortSignal): Promise<boolean> {
    signal?.throwIfAborted();
    const window = this.#searchWindow;
    if (window === null || window.isDestroyed()) return false;
    const expanded = await window.webContents.executeJavaScript(`(() => {
      const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
      const watchList = [...document.querySelectorAll('[role="list"]')]
        .find((element) => /where to watch/i.test(normalize(element.textContent)));
      const button = [...(watchList?.querySelectorAll('button') ?? [])]
        .find((candidate) => /^\\+\\d+ more$/i.test(normalize(candidate.textContent)));
      if (!button) return false;
      button.click();
      return true;
    })()`, true);
    if (expanded === true) await delay(350, signal);
    return expanded === true;
  }

  async #resolveCandidate(
    candidateUrl: string,
    signal?: AbortSignal
  ): Promise<string | null> {
    signal?.throwIfAborted();
    let candidate: URL;
    try {
      candidate = new URL(candidateUrl);
    } catch {
      return null;
    }
    if (googleWatchOfferFromUrl(candidate.href, "") !== null) return candidate.href;
    if (
      candidate.protocol !== "https:" ||
      !["google.com", "www.google.com"].includes(candidate.hostname) ||
      candidate.pathname !== "/goto"
    ) return null;

    const probeSession = this.#probeSession;
    if (probeSession !== null) {
      try {
        const response = await probeSession.fetch(candidate.href, {
          credentials: "include",
          redirect: "manual",
          signal: signal === undefined
            ? AbortSignal.timeout(REDIRECT_TIMEOUT_MS)
            : AbortSignal.any([signal, AbortSignal.timeout(REDIRECT_TIMEOUT_MS)])
        });
        const location = response.headers.get("location");
        if (location !== null && googleWatchOfferFromUrl(location, "") !== null) return location;
      } catch {
        signal?.throwIfAborted();
        // Some /goto links require a hidden navigation rather than a raw redirect.
      }
    }

    const resolverWindow = this.#resolverWindow;
    if (resolverWindow === null || resolverWindow.isDestroyed()) return null;
    const resolverContents = resolverWindow.webContents;
    return new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (!resolverContents.isDestroyed()) {
          resolverContents.removeListener("will-navigate", handleNavigation);
          resolverContents.removeListener("will-redirect", handleNavigation);
          resolverContents.setWindowOpenHandler(() => ({ action: "deny" }));
        }
        signal?.removeEventListener("abort", handleAbort);
        resolve(value);
      };
      const handleNavigation = (event: Electron.Event, url: string) => {
        if (googleWatchOfferFromUrl(url, "") !== null) {
          event.preventDefault();
          finish(url);
        }
      };
      const handleAbort = () => {
        try {
          if (!resolverContents.isDestroyed()) resolverContents.stop();
        } finally {
          finish(null);
        }
      };
      const timeout = setTimeout(() => finish(null), REDIRECT_TIMEOUT_MS);
      resolverContents.on("will-navigate", handleNavigation);
      resolverContents.on("will-redirect", handleNavigation);
      signal?.addEventListener("abort", handleAbort, { once: true });
      resolverContents.setWindowOpenHandler(({ url }) => {
        if (googleWatchOfferFromUrl(url, "") !== null) finish(url);
        return { action: "deny" };
      });
      void loadUrl(resolverWindow, candidate.href, signal).catch(() => finish(null));
    });
  }

  async #offers(
    panel: ExtractedWatchPanel,
    preferredProviderNames: readonly string[],
    stopAfterPreferredOffer: boolean,
    signal?: AbortSignal
  ): Promise<GoogleWatchOffer[]> {
    const offers: GoogleWatchOffer[] = [];
    const seen = new Set<string>();
    const candidates = prioritizeGoogleWatchCandidates(
      panel.candidateLinks,
      preferredProviderNames
    );
    for (const candidate of candidates) {
      signal?.throwIfAborted();
      if (seen.has(candidate.href)) continue;
      seen.add(candidate.href);
      const resolvedUrl = await this.#resolveCandidate(candidate.href, signal);
      signal?.throwIfAborted();
      if (resolvedUrl === null) continue;
      const offer = googleWatchOfferFromUrl(resolvedUrl, candidate.label);
      if (offer !== null && !offers.some((existing) => existing.watchUrl === offer.watchUrl)) {
        offers.push(offer);
        if (
          stopAfterPreferredOffer &&
          isPreferredLaunchableOffer(offer, preferredProviderNames)
        ) return offers;
      }
    }
    return offers;
  }

  async #resolveUncached(
    lookup: GoogleWatchLookup,
    requireCompleteOffers: boolean,
    preferredProviderNames: readonly string[],
    signal?: AbortSignal
  ): Promise<GoogleWatchResult> {
    const sourceUrl = googleWatchSearchUrl(lookup.queryText, lookup.countryCode);
    const before = await this.#sessionRequest(sourceUrl, signal);
    let panel = before.hasData ? await this.#extractRequestBody(before.body) : null;
    signal?.throwIfAborted();
    let offers = panel === null ? [] : await this.#offers(
      panel,
      preferredProviderNames,
      !requireCompleteOffers,
      signal
    );
    let renderMs: number | null = null;
    let requestAfterRenderHasData = false;
    let offersComplete = false;
    let retrievalMode = offers.length > 0 ? "warmed-session-request" : "hidden-render";

    if (offers.length === 0 || requireCompleteOffers) {
      const window = this.#searchWindow;
      if (window === null || window.isDestroyed()) throw new Error("Google discovery stopped.");
      const renderStartedAt = Date.now();
      await loadUrl(window, sourceUrl, signal);
      await this.#waitForPanel(signal);
      await this.#expandPanel(signal);
      panel = await this.#extractRendered();
      signal?.throwIfAborted();
      renderMs = Date.now() - renderStartedAt;
      offers = panel === null ? [] : await this.#offers(
        panel,
        preferredProviderNames,
        !requireCompleteOffers,
        signal
      );
      offersComplete = true;
      const after = await this.#sessionRequest(sourceUrl, signal);
      requestAfterRenderHasData = after.hasData;
      retrievalMode = after.hasData
        ? "hidden-render-with-warmed-request"
        : "hidden-render";
    }
    if (panel === null || offers.length === 0) {
      throw new Error("No supported watch providers were found for that title.");
    }

    const fetchedAt = new Date();
    const metadata = googleWatchMetadataForLookup(lookup, panel);
    const result: GoogleWatchResult = {
      countryCode: lookup.countryCode,
      episodeNumber: lookup.episodeNumber,
      expiresAt: new Date(fetchedAt.getTime() + CACHE_TTL_MS).toISOString(),
      fetchedAt: fetchedAt.toISOString(),
      mediaType: lookup.mediaType,
      offers,
      offersComplete,
      queryText: lookup.queryText,
      renderMs,
      requestAfterRenderHasData,
      requestBeforeRenderHasData: before.hasData,
      resolvedSubtitle: metadata.resolvedSubtitle,
      resolvedTitle: metadata.resolvedTitle,
      retrievalMode,
      seasonNumber: lookup.seasonNumber,
      source: "google-search",
      sourceUrl,
      warmMs: this.#warmMs
    };
    this.#cache.save(result);
    return result;
  }
}
