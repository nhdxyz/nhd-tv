import type { CatalogSearchResult } from "./contracts";

const MAX_CATALOG_QUERY_LENGTH = 120;
const MAX_RESULTS = 8;
const TVMAZE_HOST = "www.tvmaze.com";
const TVMAZE_IMAGE_HOST = "static.tvmaze.com";

export interface CatalogSearchCandidate extends Omit<CatalogSearchResult, "imageDataUrl"> {
  imageUrl: string | null;
}

function boundedText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length === 0 ? null : normalized.slice(0, maximum);
}

function safeHttpsUrl(value: unknown, hostname: string, pathPrefix: string): string | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === hostname &&
      url.pathname.startsWith(pathPrefix)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function normalizeCatalogQuery(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const query = value.replace(/\s+/g, " ").trim().slice(0, MAX_CATALOG_QUERY_LENGTH);
  return query.length >= 2 ? query : null;
}

export function parseTvmazeSearchPayload(value: unknown): CatalogSearchCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const results: CatalogSearchCandidate[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const show = (entry as { show?: unknown }).show;
    if (typeof show !== "object" || show === null) {
      continue;
    }
    const record = show as Record<string, unknown>;
    const id = typeof record.id === "number" && Number.isSafeInteger(record.id)
      ? record.id
      : null;
    const title = boundedText(record.name, 120);
    const sourceUrl = safeHttpsUrl(record.url, TVMAZE_HOST, "/shows/");
    if (id === null || title === null || sourceUrl === null) {
      continue;
    }

    const image = typeof record.image === "object" && record.image !== null
      ? record.image as Record<string, unknown>
      : {};
    const networkRecord = typeof record.network === "object" && record.network !== null
      ? record.network as Record<string, unknown>
      : typeof record.webChannel === "object" && record.webChannel !== null
        ? record.webChannel as Record<string, unknown>
        : {};
    const genres = Array.isArray(record.genres)
      ? record.genres
        .map((genre) => boundedText(genre, 32))
        .filter((genre): genre is string => genre !== null)
        .slice(0, 3)
      : [];

    results.push({
      genres,
      id: "tvmaze-" + id,
      imageUrl: safeHttpsUrl(image.medium ?? image.original, TVMAZE_IMAGE_HOST, "/uploads/"),
      network: boundedText(networkRecord.name, 60),
      premiered: boundedText(record.premiered, 10),
      sourceUrl,
      summary: boundedText(record.summary, 260),
      title
    });
    if (results.length >= MAX_RESULTS) {
      break;
    }
  }
  return results;
}
