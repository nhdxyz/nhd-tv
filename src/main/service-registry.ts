import {
  assertValidServiceDefinition,
  type ServiceDefinition
} from "./security/navigation-policy";
import type { CustomServiceManifest, ServiceSummary } from "./contracts";

const services: readonly ServiceDefinition[] = [
  {
    allowedOrigins: ["https://shaka-project.github.io"],
    artworkHosts: [],
    id: "shaka-demo",
    kind: "test",
    mediaKeySystemOrigins: ["https://shaka-project.github.io"],
    name: "Shaka Player DRM Demo",
    partition: "persist:service-shaka-demo",
    playback: null,
    rootUrls: ["https://shaka-project.github.io/shaka-player-release/demo/"],
    search: null,
    spatialNavigation: "native",
    startUrl: "https://shaka-project.github.io/shaka-player-release/demo/"
  },
  {
    allowedOrigins: ["https://www.netflix.com"],
    artworkHosts: ["nflximg.net", "nflxso.net"],
    id: "netflix",
    kind: "commercial",
    mediaKeySystemOrigins: ["https://www.netflix.com"],
    name: "Netflix",
    partition: "persist:service-netflix",
    playback: {
      pathPrefixes: ["/watch/"],
      queryParameters: [],
      subtitleSelectors: [
        '[data-uia="video-title"] [data-uia*="episode"]',
        '[data-uia="video-title"] [class*="episode"]',
        '[data-uia="video-title"] [class*="ellipsize"]'
      ],
      titleSelectors: [
        '[data-uia="video-title"] [data-uia="title"]',
        '[data-uia="video-title"] h1',
        '[data-uia="video-title"] h2',
        '[data-uia="video-title"]',
        'meta[property="og:title"]',
        "title"
      ]
    },
    rootUrls: ["https://www.netflix.com/browse"],
    search: {
      baseUrl: "https://www.netflix.com/search",
      queryParameter: "q"
    },
    spatialNavigation: "dom",
    startUrl: "https://www.netflix.com/browse"
  },
  {
    allowedOrigins: [
      "https://www.youtube.com",
      "https://accounts.google.com",
      "https://accounts.youtube.com"
    ],
    artworkHosts: ["i.ytimg.com"],
    authenticationNote:
      "If Google asks for a passkey but no system prompt appears, choose Try another way, then Enter your password. Native macOS passkeys require a signed, entitled app build.",
    id: "youtube",
    kind: "commercial",
    mediaKeySystemOrigins: ["https://www.youtube.com"],
    name: "YouTube",
    partition: "persist:service-youtube",
    playback: {
      pathPrefixes: ["/watch", "/shorts/"],
      queryParameters: ["v"],
      subtitleSelectors: [
        "#owner #channel-name",
        "ytd-video-owner-renderer #channel-name"
      ],
      titleSelectors: [
        "h1.ytd-watch-metadata yt-formatted-string",
        "h1.ytd-watch-metadata",
        'meta[property="og:title"]',
        "title"
      ]
    },
    rootUrls: ["https://www.youtube.com/"],
    search: {
      baseUrl: "https://www.youtube.com/results",
      queryParameter: "search_query"
    },
    spatialNavigation: "dom",
    startUrl: "https://www.youtube.com/"
  },
  {
    allowedOrigins: ["https://www.disneyplus.com"],
    artworkHosts: ["disney-plus.net"],
    id: "disney-plus",
    kind: "commercial",
    mediaKeySystemOrigins: ["https://www.disneyplus.com"],
    name: "Disney+",
    partition: "persist:service-disney-plus",
    playback: {
      pathPrefixes: ["/play/", "/video/"],
      queryParameters: [],
      subtitleSelectors: [],
      titleSelectors: [
        'meta[property="og:title"]',
        "title"
      ]
    },
    rootUrls: ["https://www.disneyplus.com/home"],
    search: {
      baseUrl: "https://www.disneyplus.com/search",
      queryParameter: null
    },
    spatialNavigation: "dom",
    startUrl: "https://www.disneyplus.com/home"
  }
];

let customServices: readonly ServiceDefinition[] = [];

for (const service of services) {
  assertValidServiceDefinition(service);
}

export function getServiceDefinition(serviceId: string): ServiceDefinition | null {
  return [...services, ...customServices].find((service) => service.id === serviceId) ?? null;
}

export function getServiceDefinitions(): readonly ServiceDefinition[] {
  return [...services, ...customServices];
}

export function getServiceSummaries(): readonly ServiceSummary[] {
  return [...services, ...customServices].map(({ authenticationNote, id, kind, name, search }) => ({
    authenticationNote,
    id,
    kind,
    name,
    searchMode: search === null ? "none" : search.queryParameter === null ? "browse" : "query"
  }));
}

export function setCustomServiceManifests(
  manifests: readonly CustomServiceManifest[]
): void {
  customServices = manifests.map((manifest) => {
    const startUrl = new URL(manifest.startUrl);
    const definition: ServiceDefinition = {
      allowedOrigins: [startUrl.origin],
      artworkHosts: [],
      authenticationNote: "Custom same-origin service. Playback observation and search are not enabled.",
      id: manifest.id,
      kind: "custom",
      mediaKeySystemOrigins: [startUrl.origin],
      name: manifest.name,
      partition: `persist:service-${manifest.id}`,
      playback: null,
      rootUrls: [manifest.startUrl],
      search: null,
      spatialNavigation: "dom",
      startUrl: manifest.startUrl
    };
    assertValidServiceDefinition(definition);
    return definition;
  });
}
