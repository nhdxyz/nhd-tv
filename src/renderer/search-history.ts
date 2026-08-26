import type { ContinueWatchingItem } from "../main/contracts";

export function matchContinueWatching(
  items: readonly ContinueWatchingItem[],
  enabledServiceIds: ReadonlySet<string>,
  rawQuery: string,
  limit = 6
): readonly ContinueWatchingItem[] {
  const query = rawQuery.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  if (query.length === 0 || limit <= 0) {
    return [];
  }

  return items
    .filter((item) => enabledServiceIds.has(item.serviceId))
    .filter((item) => [item.title, item.subtitle, item.serviceName]
      .filter((value): value is string => value !== null)
      .some((value) => value.toLocaleLowerCase().includes(query)))
    .slice(0, limit);
}
