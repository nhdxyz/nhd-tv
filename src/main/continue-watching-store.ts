import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ContinueWatchingItem } from "./contracts";

const STORE_VERSION = 4;
const MAX_ITEMS = 18;
const MAX_TITLE_LENGTH = 180;

export interface PlaybackCheckpoint {
  durationSeconds: number;
  ended: boolean;
  positionSeconds: number;
  serviceId: string;
  serviceName: string;
  subtitle: string | null;
  title: string;
  watchUrl: string;
}

interface StoredContinueWatchingItem extends ContinueWatchingItem {
  artworkPixelWidth: number;
  watchUrl: string;
}

interface StoredContinueWatchingDocument {
  items: StoredContinueWatchingItem[];
  version: number;
}

function itemId(serviceId: string, watchUrl: string): string {
  return createHash("sha256")
    .update(`${serviceId}:${watchUrl}`)
    .digest("hex")
    .slice(0, 24);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizedText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length === 0 ? null : normalized.slice(0, MAX_TITLE_LENGTH);
}

function storedItem(
  value: unknown,
  preserveCachedArtwork = true
): StoredContinueWatchingItem | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const item = value as Partial<StoredContinueWatchingItem>;
  if (
    typeof item.id !== "string" ||
    typeof item.serviceId !== "string" ||
    typeof item.serviceName !== "string" ||
    typeof item.title !== "string" ||
    typeof item.watchUrl !== "string" ||
    !(item.artworkDataUrl === null || (
      typeof item.artworkDataUrl === "string" &&
      item.artworkDataUrl.startsWith("data:image/jpeg;base64,")
    )) ||
    !finiteNonNegative(item.durationSeconds) ||
    !finiteNonNegative(item.positionSeconds) ||
    !finiteNonNegative(item.updatedAt)
  ) {
    return null;
  }

  return {
    artworkDataUrl: preserveCachedArtwork ? item.artworkDataUrl : null,
    artworkPixelWidth: preserveCachedArtwork && finiteNonNegative(item.artworkPixelWidth)
      ? item.artworkPixelWidth
      : 0,
    durationSeconds: item.durationSeconds,
    id: item.id,
    positionSeconds: item.positionSeconds,
    serviceId: item.serviceId,
    serviceName: item.serviceName,
    subtitle: normalizedText(item.subtitle),
    title: normalizedText(item.title) ?? item.serviceName,
    updatedAt: item.updatedAt,
    watchUrl: item.watchUrl
  };
}

function publicItem(item: StoredContinueWatchingItem): ContinueWatchingItem {
  const {
    artworkPixelWidth: _artworkPixelWidth,
    watchUrl: _watchUrl,
    ...safeItem
  } = item;
  return safeItem;
}

export class ContinueWatchingStore {
  readonly #filePath: string;
  #items: StoredContinueWatchingItem[] = [];
  #writeSequence: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.#filePath = filePath;
  }

  async initialize(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.#filePath, "utf8"));

      if (
        typeof parsed === "object" &&
        parsed !== null &&
        ([1, 2, 3, STORE_VERSION] as readonly unknown[]).includes(
          (parsed as Partial<StoredContinueWatchingDocument>).version
        ) &&
        Array.isArray((parsed as Partial<StoredContinueWatchingDocument>).items)
      ) {
        const storedVersion = (parsed as Partial<StoredContinueWatchingDocument>).version;
        this.#items = (parsed as StoredContinueWatchingDocument).items
          // Versions before 4 did not bind cached artwork to the captured
          // title. Drop those images once rather than promote an unrelated
          // tile as the Home hero; resume metadata remains intact.
          .map((item) => storedItem(item, storedVersion === STORE_VERSION))
          .filter((item): item is StoredContinueWatchingItem => item !== null)
          .sort((left, right) => right.updatedAt - left.updatedAt)
          .slice(0, MAX_ITEMS);
      }
    } catch {
      this.#items = [];
    }
  }

  list(): readonly ContinueWatchingItem[] {
    return this.#items.map(publicItem);
  }

  resumeTarget(id: unknown): { serviceId: string; watchUrl: string } | null {
    if (typeof id !== "string") {
      return null;
    }

    const item = this.#items.find((candidate) => candidate.id === id);
    return item === undefined
      ? null
      : { serviceId: item.serviceId, watchUrl: item.watchUrl };
  }

  async remove(id: unknown): Promise<boolean> {
    if (typeof id !== "string") {
      return false;
    }

    const nextItems = this.#items.filter((item) => item.id !== id);
    if (nextItems.length === this.#items.length) {
      return false;
    }

    this.#items = nextItems;
    await this.#persist();
    return true;
  }

  async upsert(checkpoint: PlaybackCheckpoint): Promise<ContinueWatchingItem | null> {
    const id = itemId(checkpoint.serviceId, checkpoint.watchUrl);
    const existing = this.#items.find((item) => item.id === id);
    const durationSeconds = Math.max(0, checkpoint.durationSeconds);
    const positionSeconds = Math.min(
      Math.max(0, checkpoint.positionSeconds),
      durationSeconds
    );
    const progress = durationSeconds === 0 ? 0 : positionSeconds / durationSeconds;

    if (checkpoint.ended || progress >= 0.95) {
      if (existing !== undefined) {
        this.#items = this.#items.filter((item) => item.id !== id);
        await this.#persist();
      }

      return null;
    }

    const title = normalizedText(checkpoint.title);
    const genericTitle = title?.toLocaleLowerCase() === checkpoint.serviceName.toLocaleLowerCase();
    const preservedTitle = existing !== undefined &&
      existing.title.toLocaleLowerCase() !== existing.serviceName.toLocaleLowerCase()
      ? existing.title
      : null;
    const item: StoredContinueWatchingItem = {
      artworkDataUrl: existing?.artworkDataUrl ?? null,
      artworkPixelWidth: existing?.artworkPixelWidth ?? 0,
      durationSeconds,
      id,
      positionSeconds,
      serviceId: checkpoint.serviceId,
      serviceName: checkpoint.serviceName,
      subtitle: normalizedText(checkpoint.subtitle),
      title: genericTitle ? preservedTitle ?? checkpoint.serviceName : title ?? checkpoint.serviceName,
      updatedAt: Date.now(),
      watchUrl: checkpoint.watchUrl
    };

    this.#items = [item, ...this.#items.filter((candidate) => candidate.id !== id)]
      .slice(0, MAX_ITEMS);
    await this.#persist();
    return publicItem(item);
  }

  async updateArtwork(
    id: string,
    artworkDataUrl: string,
    artworkPixelWidth: number
  ): Promise<boolean> {
    const item = this.#items.find((candidate) => candidate.id === id);

    if (
      item === undefined ||
      !Number.isInteger(artworkPixelWidth) ||
      artworkPixelWidth < 1 ||
      (item.artworkDataUrl !== null && artworkPixelWidth <= item.artworkPixelWidth)
    ) {
      return false;
    }

    item.artworkDataUrl = artworkDataUrl;
    item.artworkPixelWidth = artworkPixelWidth;
    await this.#persist();
    return true;
  }

  async #persist(): Promise<void> {
    const snapshot: StoredContinueWatchingDocument = {
      items: this.#items,
      version: STORE_VERSION
    };

    this.#writeSequence = this.#writeSequence.catch(() => undefined).then(async () => {
      const directory = path.dirname(this.#filePath);
      const temporaryPath = `${this.#filePath}.tmp`;
      await mkdir(directory, { recursive: true });
      await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600
      });
      await rename(temporaryPath, this.#filePath);
    });

    return this.#writeSequence;
  }
}
