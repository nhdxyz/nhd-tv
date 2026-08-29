import type { ContinueWatchingItem } from "../main/contracts";

export interface ContinueWatchingPresentation {
  subtitle: string | null;
  title: string;
}

export function normalizeMediaLabel(rawValue: string): string {
  let value = rawValue.replace(/\s+/g, " ").trim();
  const duplicatedPhrase = value.match(/^(.{3,}?)\s+\1$/i);

  if (duplicatedPhrase?.[1] !== undefined) {
    value = duplicatedPhrase[1].trim();
  }

  return value
    .replace(/([A-Za-z])((?:S\d{1,2})?E\d{1,3})(?=[A-Z.…])/g, "$1 · $2 · ")
    .replace(/\s*·\s*/g, " · ")
    .replace(/(?:\s*·\s*){2,}/g, " · ")
    .replace(/^[·\s]+|[·\s]+$/g, "")
    .trim();
}

export function presentContinueWatching(
  item: ContinueWatchingItem
): ContinueWatchingPresentation {
  const title = normalizeMediaLabel(item.title) || item.serviceName;
  const normalizedSubtitle = item.subtitle === null
    ? ""
    : normalizeMediaLabel(item.subtitle);
  const subtitle = normalizedSubtitle.length === 0 ||
      normalizedSubtitle.toLocaleLowerCase() === title.toLocaleLowerCase()
    ? null
    : normalizedSubtitle;

  return { subtitle, title };
}
