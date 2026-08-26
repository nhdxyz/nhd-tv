import { buildServiceSearchUrl, normalizeSearchQuery } from "./security/navigation-policy";
import { getServiceDefinition } from "./service-registry";

export type RemoteSearchDestination =
  | {
      kind: "active-service";
      query: string;
      serviceId: string;
      url: string;
    }
  | {
      kind: "shell";
      query: string;
    };

export function resolveRemoteSearchDestination(
  activeServiceId: string | null,
  query: unknown
): RemoteSearchDestination | null {
  const normalizedQuery = normalizeSearchQuery(query);
  if (normalizedQuery === null) {
    return null;
  }

  const activeDefinition = activeServiceId === null
    ? null
    : getServiceDefinition(activeServiceId);
  const activeSearchUrl = activeDefinition === null
    ? null
    : buildServiceSearchUrl(activeDefinition, normalizedQuery);

  if (activeDefinition !== null && activeSearchUrl !== null) {
    return {
      kind: "active-service",
      query: normalizedQuery,
      serviceId: activeDefinition.id,
      url: activeSearchUrl
    };
  }

  return { kind: "shell", query: normalizedQuery };
}
