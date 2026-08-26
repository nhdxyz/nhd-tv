export interface ServiceDefinition {
  allowedOrigins: readonly string[];
  id: string;
  kind: "commercial" | "test";
  mediaKeySystemOrigins: readonly string[];
  name: string;
  partition: string;
  startUrl: string;
}

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
}
