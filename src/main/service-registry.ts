import {
  assertValidServiceDefinition,
  type ServiceDefinition
} from "./security/navigation-policy";
import type { ServiceSummary } from "./contracts";

const services: readonly ServiceDefinition[] = [
  {
    allowedOrigins: ["https://shaka-project.github.io"],
    id: "shaka-demo",
    kind: "test",
    mediaKeySystemOrigins: ["https://shaka-project.github.io"],
    name: "Shaka Player DRM Demo",
    partition: "persist:service-shaka-demo",
    rootUrls: ["https://shaka-project.github.io/shaka-player-release/demo/"],
    spatialNavigation: "native",
    startUrl: "https://shaka-project.github.io/shaka-player-release/demo/"
  },
  {
    allowedOrigins: ["https://www.netflix.com"],
    id: "netflix",
    kind: "commercial",
    mediaKeySystemOrigins: ["https://www.netflix.com"],
    name: "Netflix",
    partition: "persist:service-netflix",
    rootUrls: ["https://www.netflix.com/browse"],
    spatialNavigation: "dom",
    startUrl: "https://www.netflix.com/browse"
  },
  {
    allowedOrigins: [
      "https://www.youtube.com",
      "https://accounts.google.com",
      "https://accounts.youtube.com"
    ],
    authenticationNote:
      "If Google asks for a passkey but no system prompt appears, choose Try another way, then Enter your password. Native macOS passkeys require a signed, entitled app build.",
    id: "youtube",
    kind: "commercial",
    mediaKeySystemOrigins: ["https://www.youtube.com"],
    name: "YouTube",
    partition: "persist:service-youtube",
    rootUrls: ["https://www.youtube.com/"],
    spatialNavigation: "dom",
    startUrl: "https://www.youtube.com/"
  },
  {
    allowedOrigins: ["https://www.disneyplus.com"],
    id: "disney-plus",
    kind: "commercial",
    mediaKeySystemOrigins: ["https://www.disneyplus.com"],
    name: "Disney+",
    partition: "persist:service-disney-plus",
    rootUrls: ["https://www.disneyplus.com/home"],
    spatialNavigation: "dom",
    startUrl: "https://www.disneyplus.com/home"
  }
];

for (const service of services) {
  assertValidServiceDefinition(service);
}

export function getServiceDefinition(serviceId: string): ServiceDefinition | null {
  return services.find((service) => service.id === serviceId) ?? null;
}

export function getServiceDefinitions(): readonly ServiceDefinition[] {
  return services;
}

export function getServiceSummaries(): readonly ServiceSummary[] {
  return services.map(({ authenticationNote, id, kind, name }) => ({
    authenticationNote,
    id,
    kind,
    name
  }));
}
