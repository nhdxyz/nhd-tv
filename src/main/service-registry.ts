import {
  assertValidServiceDefinition,
  type ServiceDefinition
} from "./security/navigation-policy";
import type { CustomServiceManifest, ServiceSummary } from "./contracts";

const services: readonly ServiceDefinition[] = [
  {
    allowedOrigins: ["https://shaka-project.github.io"],
    artworkHosts: [],
    fullscreenOrigins: ["https://shaka-project.github.io"],
    id: "shaka-demo",
    kind: "test",
    mediaKeySystemOrigins: ["https://shaka-project.github.io"],
    name: "Shaka Player DRM Demo",
    partition: "persist:service-shaka-demo",
    playback: null,
    remoteTextEntrySelectors: [],
    remoteTextEntryTriggerSelectors: [],
    rootUrls: ["https://shaka-project.github.io/shaka-player-release/demo/"],
    search: null,
    spatialNavigation: "native",
    startUrl: "https://shaka-project.github.io/shaka-player-release/demo/"
  },
  {
    allowedOrigins: ["https://www.netflix.com"],
    allowedSubdomainHosts: ["netflix.com"],
    artworkHosts: ["nflximg.net", "nflxso.net"],
    fullscreenOrigins: ["https://www.netflix.com"],
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
    remoteTextEntrySelectors: [
      'input[data-uia="search-box-input"]',
      'input[data-uia*="search"][data-uia*="input"]',
      'input[name="search"]',
      'input[type="search"]',
      'input[aria-label*="search" i]',
      'input[placeholder*="search" i]'
    ],
    remoteTextEntryTriggerSelectors: [
      '[data-uia="search-box-launcher"]',
      'button[aria-label="Search"]'
    ],
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
    allowedSubdomainHosts: ["youtube.com"],
    artworkHosts: ["i.ytimg.com"],
    authenticationNote:
      "Embedded Google sign-in is feasibility-only and may stall after passkey or OTP. Supported TV activation is under evaluation; signed-out playback remains available.",
    fullscreenOrigins: ["https://www.youtube.com"],
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
    remoteTextEntrySelectors: [
      'textarea[name="search_query"]',
      "ytd-searchbox input#search",
      "input#search",
      'input[name="search_query"]'
    ],
    remoteTextEntryTriggerSelectors: [
      'ytd-searchbox button[aria-label*="Search" i]',
      'button#search-icon-legacy',
      'button[aria-label="Search"]'
    ],
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
    allowedSubdomainHosts: ["disneyplus.com"],
    artworkHosts: ["disney-plus.net"],
    fullscreenOrigins: ["https://www.disneyplus.com"],
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
    remoteTextEntrySelectors: [],
    remoteTextEntryTriggerSelectors: [],
    rootUrls: ["https://www.disneyplus.com/home"],
    search: {
      baseUrl: "https://www.disneyplus.com/search",
      queryParameter: null
    },
    spatialNavigation: "dom",
    startUrl: "https://www.disneyplus.com/home"
  },
  {
    allowedOrigins: [
      "https://open.spotify.com",
      "https://accounts.spotify.com"
    ],
    allowedSubdomainHosts: ["spotify.com"],
    artworkHosts: [],
    authenticationNote:
      "Uses Spotify's own isolated Web Player session. Sign in on the Spotify page; playback availability follows your Spotify account and region.",
    fullscreenOrigins: [],
    id: "spotify",
    kind: "commercial",
    mediaKeySystemOrigins: ["https://open.spotify.com"],
    name: "Spotify",
    partition: "persist:service-spotify",
    playback: null,
    remoteTextEntrySelectors: [
      "#nhdtv-spotify-tv-search",
      'input[data-testid="search-input"]',
      'input[role="searchbox"]',
      'input[type="search"]',
      'input[placeholder*="What do you want to play" i]'
    ],
    remoteTextEntryTriggerSelectors: [
      'a[href="/search"]',
      'a[href^="/search/"]',
      'button[aria-label*="Search" i]'
    ],
    rootUrls: ["https://open.spotify.com/"],
    search: {
      baseUrl: "https://open.spotify.com/search",
      queryParameter: null,
      queryPathSegment: true
    },
    spatialNavigation: "dom",
    startUrl: "https://open.spotify.com/"
  },
  {
    allowedOrigins: ["https://www.primevideo.com"],
    artworkHosts: [],
    authenticationNote:
      "Experimental integration. Regional redirects, sign-in, playback, and remote navigation still need qualification.",
    fullscreenOrigins: [],
    id: "prime-video",
    kind: "experimental",
    mediaKeySystemOrigins: ["https://www.primevideo.com"],
    name: "Prime Video",
    partition: "persist:service-prime-video",
    playback: null,
    remoteTextEntrySelectors: [],
    remoteTextEntryTriggerSelectors: [],
    rootUrls: ["https://www.primevideo.com/"],
    search: null,
    spatialNavigation: "dom",
    startUrl: "https://www.primevideo.com/"
  },
  {
    allowedOrigins: ["https://www.hulu.com", "https://auth.hulu.com"],
    artworkHosts: [],
    authenticationNote:
      "Experimental integration. Sign-in, playback, and remote navigation still need qualification.",
    fullscreenOrigins: [],
    id: "hulu",
    kind: "experimental",
    mediaKeySystemOrigins: ["https://www.hulu.com"],
    name: "Hulu",
    partition: "persist:service-hulu",
    playback: null,
    remoteTextEntrySelectors: [],
    remoteTextEntryTriggerSelectors: [],
    rootUrls: ["https://www.hulu.com/", "https://www.hulu.com/welcome"],
    search: null,
    spatialNavigation: "dom",
    startUrl: "https://www.hulu.com/"
  },
  {
    allowedOrigins: ["https://play.max.com"],
    artworkHosts: [],
    authenticationNote:
      "Experimental integration. Sign-in, playback, and remote navigation still need qualification.",
    fullscreenOrigins: [],
    id: "hbo-max",
    kind: "experimental",
    mediaKeySystemOrigins: ["https://play.max.com"],
    name: "HBO Max",
    partition: "persist:service-hbo-max",
    playback: null,
    remoteTextEntrySelectors: [],
    remoteTextEntryTriggerSelectors: [],
    rootUrls: ["https://play.max.com/"],
    search: null,
    spatialNavigation: "dom",
    startUrl: "https://play.max.com/"
  },
  {
    allowedOrigins: ["https://www.peacocktv.com"],
    artworkHosts: [],
    authenticationNote:
      "Experimental US-only integration. Sign-in, playback, and remote navigation still need qualification.",
    fullscreenOrigins: [],
    id: "peacock",
    kind: "experimental",
    mediaKeySystemOrigins: ["https://www.peacocktv.com"],
    name: "Peacock",
    partition: "persist:service-peacock",
    playback: null,
    remoteTextEntrySelectors: [],
    remoteTextEntryTriggerSelectors: [],
    rootUrls: ["https://www.peacocktv.com/", "https://www.peacocktv.com/unavailable"],
    search: null,
    spatialNavigation: "dom",
    startUrl: "https://www.peacocktv.com/"
  },
  {
    allowedOrigins: ["https://www.paramountplus.com"],
    artworkHosts: [],
    authenticationNote:
      "Experimental integration. Regional redirects, sign-in, playback, and remote navigation still need qualification.",
    fullscreenOrigins: [],
    id: "paramount-plus",
    kind: "experimental",
    mediaKeySystemOrigins: ["https://www.paramountplus.com"],
    name: "Paramount+",
    partition: "persist:service-paramount-plus",
    playback: null,
    remoteTextEntrySelectors: [],
    remoteTextEntryTriggerSelectors: [],
    rootUrls: ["https://www.paramountplus.com/", "https://www.paramountplus.com/intl/"],
    search: null,
    spatialNavigation: "dom",
    startUrl: "https://www.paramountplus.com/"
  },
  {
    allowedOrigins: ["https://tv.apple.com"],
    artworkHosts: [],
    authenticationNote:
      "Experimental integration. Apple Account sign-in, playback, and remote navigation still need qualification.",
    fullscreenOrigins: [],
    id: "apple-tv",
    kind: "experimental",
    mediaKeySystemOrigins: ["https://tv.apple.com"],
    name: "Apple TV",
    partition: "persist:service-apple-tv",
    playback: null,
    remoteTextEntrySelectors: [],
    remoteTextEntryTriggerSelectors: [],
    rootUrls: ["https://tv.apple.com/"],
    search: null,
    spatialNavigation: "dom",
    startUrl: "https://tv.apple.com/"
  },
  {
    allowedOrigins: ["https://app.plex.tv"],
    artworkHosts: [],
    authenticationNote:
      "Experimental integration. Account linking, playback, and remote navigation still need qualification.",
    fullscreenOrigins: [],
    id: "plex",
    kind: "experimental",
    mediaKeySystemOrigins: ["https://app.plex.tv"],
    name: "Plex",
    partition: "persist:service-plex",
    playback: null,
    remoteTextEntrySelectors: [],
    remoteTextEntryTriggerSelectors: [],
    rootUrls: ["https://app.plex.tv/desktop/"],
    search: null,
    spatialNavigation: "dom",
    startUrl: "https://app.plex.tv/desktop/"
  },
  {
    allowedOrigins: ["https://www.twitch.tv", "https://passport.twitch.tv"],
    artworkHosts: [],
    authenticationNote:
      "Experimental integration. Sign-in, live playback, and remote navigation still need qualification.",
    fullscreenOrigins: [],
    id: "twitch",
    kind: "experimental",
    mediaKeySystemOrigins: ["https://www.twitch.tv"],
    name: "Twitch",
    partition: "persist:service-twitch",
    playback: null,
    remoteTextEntrySelectors: [],
    remoteTextEntryTriggerSelectors: [],
    rootUrls: ["https://www.twitch.tv/"],
    search: null,
    spatialNavigation: "dom",
    startUrl: "https://www.twitch.tv/"
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
    searchMode: search === null
      ? "none"
      : search.queryParameter === null && search.queryPathSegment !== true
        ? "browse"
        : "query"
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
      fullscreenOrigins: [],
      id: manifest.id,
      kind: "custom",
      mediaKeySystemOrigins: [startUrl.origin],
      name: manifest.name,
      partition: `persist:service-${manifest.id}`,
      playback: null,
      remoteTextEntrySelectors: [],
      remoteTextEntryTriggerSelectors: [],
      rootUrls: [manifest.startUrl],
      search: null,
      spatialNavigation: "dom",
      startUrl: manifest.startUrl
    };
    assertValidServiceDefinition(definition);
    return definition;
  });
}
