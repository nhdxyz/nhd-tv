export interface ServiceDefinition {
  allowedOrigins: readonly string[];
  artworkHosts: readonly string[];
  authenticationNote?: string;
  id: string;
  kind: "commercial" | "test";
  mediaKeySystemOrigins: readonly string[];
  name: string;
  partition: string;
  playback: {
    pathPrefixes: readonly string[];
    queryParameters: readonly string[];
    subtitleSelectors: readonly string[];
    titleSelectors: readonly string[];
  } | null;
  rootUrls: readonly string[];
  search: {
    baseUrl: string;
    queryParameter: string | null;
  } | null;
  spatialNavigation: "dom" | "native";
  startUrl: string;
}

const MAX_SEARCH_QUERY_LENGTH = 120;

export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:") {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function originForDiagnostics(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "invalid-url";
  }
}

export function isAllowedServiceUrl(
  candidate: string,
  allowedOrigins: readonly string[]
): boolean {
  const candidateOrigin = normalizeOrigin(candidate);

  if (candidateOrigin === null) {
    return false;
  }

  return allowedOrigins.some((allowedOrigin) => normalizeOrigin(allowedOrigin) === candidateOrigin);
}

export function isAllowedArtworkUrl(
  candidate: string,
  allowedHosts: readonly string[]
): boolean {
  try {
    const url = new URL(candidate);

    if (url.protocol !== "https:") {
      return false;
    }

    return allowedHosts.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

export function isPlaybackUrl(
  candidate: string,
  definition: ServiceDefinition
): boolean {
  if (
    definition.playback === null ||
    !isAllowedServiceUrl(candidate, definition.allowedOrigins)
  ) {
    return false;
  }

  try {
    const path = new URL(candidate).pathname;
    return definition.playback.pathPrefixes.some((prefix) => path.startsWith(prefix));
  } catch {
    return false;
  }
}

export function sanitizePlaybackUrl(
  candidate: string,
  definition: ServiceDefinition
): string | null {
  if (!isPlaybackUrl(candidate, definition) || definition.playback === null) {
    return null;
  }

  const source = new URL(candidate);
  const sanitized = new URL(`${source.origin}${source.pathname}`);

  for (const parameter of definition.playback.queryParameters) {
    const value = source.searchParams.get(parameter);

    if (value !== null) {
      sanitized.searchParams.set(parameter, value);
    }
  }

  return sanitized.toString();
}

export function normalizeSearchQuery(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 && normalized.length <= MAX_SEARCH_QUERY_LENGTH
    ? normalized
    : null;
}

export function buildServiceSearchUrl(
  definition: ServiceDefinition,
  query: unknown
): string | null {
  if (definition.search === null) {
    return null;
  }

  const normalizedQuery = normalizeSearchQuery(query);

  if (normalizedQuery === null) {
    return null;
  }

  const url = new URL(definition.search.baseUrl);

  if (definition.search.queryParameter !== null) {
    url.searchParams.set(definition.search.queryParameter, normalizedQuery);
  }

  return url.toString();
}

function normalizedRoot(value: string): string | null {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:") {
      return null;
    }

    const path = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
    return `${url.origin}${path}`;
  } catch {
    return null;
  }
}

export function isServiceRootUrl(
  candidate: string,
  rootUrls: readonly string[]
): boolean {
  const candidateRoot = normalizedRoot(candidate);

  return candidateRoot !== null && rootUrls.some((rootUrl) => normalizedRoot(rootUrl) === candidateRoot);
}

export function isExpectedAllowedNavigationAbort(
  error: unknown,
  currentUrl: string,
  allowedOrigins: readonly string[]
): boolean {
  return (
    error instanceof Error &&
    error.message.includes("ERR_ABORTED (-3)") &&
    isAllowedServiceUrl(currentUrl, allowedOrigins)
  );
}

export function assertValidServiceDefinition(definition: ServiceDefinition): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(definition.id)) {
    throw new Error(`Invalid service id: ${definition.id}`);
  }

  if (!definition.partition.startsWith("persist:service-")) {
    throw new Error(`Service partition must be persistent and isolated: ${definition.id}`);
  }

  if (definition.allowedOrigins.length === 0) {
    throw new Error(`Service must declare at least one allowed origin: ${definition.id}`);
  }

  if (definition.allowedOrigins.some((origin) => normalizeOrigin(origin) !== origin)) {
    throw new Error(`Service navigation origins must be canonical HTTPS origins: ${definition.id}`);
  }

  if (definition.mediaKeySystemOrigins.length === 0) {
    throw new Error(`Service must declare a media-key-system origin: ${definition.id}`);
  }

  if (
    definition.mediaKeySystemOrigins.some(
      (origin) =>
        normalizeOrigin(origin) !== origin ||
        !definition.allowedOrigins.includes(origin)
    )
  ) {
    throw new Error(`Service media-key-system origins must be allowed HTTPS origins: ${definition.id}`);
  }

  if (!isAllowedServiceUrl(definition.startUrl, definition.allowedOrigins)) {
    throw new Error(`Service start URL is not in its allowed origins: ${definition.id}`);
  }

  if (
    definition.artworkHosts.some(
      (host) => !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)
    )
  ) {
    throw new Error(`Service artwork hosts must be canonical host suffixes: ${definition.id}`);
  }

  if (
    definition.playback !== null &&
    (
      definition.playback.pathPrefixes.length === 0 ||
      definition.playback.pathPrefixes.some((prefix) => !prefix.startsWith("/")) ||
      definition.playback.queryParameters.some(
        (parameter) => !/^[A-Za-z0-9_-]+$/.test(parameter)
      ) ||
      definition.playback.titleSelectors.length === 0 ||
      [...definition.playback.titleSelectors, ...definition.playback.subtitleSelectors].some(
        (selector) => selector.trim().length === 0 || selector.length > 200
      )
    )
  ) {
    throw new Error(`Service playback rules are invalid: ${definition.id}`);
  }

  if (
    definition.search !== null &&
    (
      !isAllowedServiceUrl(definition.search.baseUrl, definition.allowedOrigins) ||
      (
        definition.search.queryParameter !== null &&
        !/^[A-Za-z0-9_-]+$/.test(definition.search.queryParameter)
      )
    )
  ) {
    throw new Error(`Service search rules must stay on allowed origins: ${definition.id}`);
  }

  if (
    definition.rootUrls.length === 0 ||
    definition.rootUrls.some((rootUrl) => !isAllowedServiceUrl(rootUrl, definition.allowedOrigins))
  ) {
    throw new Error(`Service root URLs must use allowed HTTPS origins: ${definition.id}`);
  }

  if (!definition.rootUrls.some((rootUrl) => isServiceRootUrl(definition.startUrl, [rootUrl]))) {
    throw new Error(`Service start URL must be one of its roots: ${definition.id}`);
  }
}
