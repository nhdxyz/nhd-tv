export interface VoiceAppService {
  id: string;
  name: string;
}

export type VoiceAppMatch =
  | { kind: "ambiguous" }
  | { kind: "match"; service: VoiceAppService }
  | { kind: "none" };

const BUILT_IN_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "apple-tv": ["apple tv", "apple tv plus"],
  "disney-plus": ["disney", "disney plus"],
  "hbo-max": ["hbo", "hbo max", "max"],
  hulu: ["hulu"],
  netflix: ["netflix"],
  paramount: ["paramount", "paramount plus"],
  "paramount-plus": ["paramount", "paramount plus"],
  peacock: ["peacock"],
  plex: ["plex"],
  "prime-video": ["amazon prime", "amazon prime video", "amazon video", "prime", "prime video"],
  spotify: ["spotify"],
  twitch: ["twitch"],
  youtube: ["youtube"]
};

export function normalizeVoiceAppName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\+/g, " plus ")
    .toLocaleLowerCase("en-US")
    .replace(/\b(?:app|application)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function serviceNames(service: VoiceAppService): Set<string> {
  return new Set([
    normalizeVoiceAppName(service.id),
    normalizeVoiceAppName(service.name),
    ...(BUILT_IN_ALIASES[service.id] ?? []).map(normalizeVoiceAppName)
  ].filter(Boolean));
}

export function isKnownVoiceAppName(value: string): boolean {
  const requested = normalizeVoiceAppName(value);
  return requested.length > 0 && Object.values(BUILT_IN_ALIASES)
    .some((aliases) => aliases.some((alias) => normalizeVoiceAppName(alias) === requested));
}

export function matchVoiceAppService(
  value: string,
  services: readonly VoiceAppService[]
): VoiceAppMatch {
  const requested = normalizeVoiceAppName(value);
  if (requested.length === 0) return { kind: "none" };
  const matches = services.filter((service) => serviceNames(service).has(requested));
  if (matches.length === 0) return { kind: "none" };
  if (matches.length > 1) return { kind: "ambiguous" };
  return { kind: "match", service: matches[0]! };
}
