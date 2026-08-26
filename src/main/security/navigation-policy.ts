export interface ServiceDefinition {
  allowedOrigins: readonly string[];
  id: string;
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

  if (!isAllowedServiceUrl(definition.startUrl, definition.allowedOrigins)) {
    throw new Error(`Service start URL is not in its allowed origins: ${definition.id}`);
  }
}
