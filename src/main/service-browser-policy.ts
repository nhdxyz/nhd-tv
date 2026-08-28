import {
  isAllowedServiceUrl,
  type ServiceDefinition
} from "./security/navigation-policy";

export type ServiceWindowDisposition = "current-view" | "deny" | "popup";

export function serviceWindowDisposition(
  definition: ServiceDefinition,
  requestedUrl: string
): ServiceWindowDisposition {
  if (!isAllowedServiceUrl(
    requestedUrl,
    definition.allowedOrigins,
    definition.allowedSubdomainHosts
  )) {
    return "deny";
  }

  return definition.id === "spotify" ? "current-view" : "popup";
}

export function serviceUserAgent(definition: ServiceDefinition, userAgent: string): string {
  if (definition.id !== "spotify") {
    return userAgent;
  }

  return userAgent
    .replace(/\sElectron\/[^\s]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
