import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ContinueWatchingStore,
  type PlaybackCheckpoint
} from "../src/main/continue-watching-store";

const temporaryDirectories: string[] = [];

async function testStore(): Promise<{ filePath: string; store: ContinueWatchingStore }> {
  const directory = await mkdtemp(path.join(tmpdir(), "nhd-tv-continue-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, "continue-watching.json");
  const store = new ContinueWatchingStore(filePath);
  await store.initialize();
  return { filePath, store };
}

function checkpoint(overrides: Partial<PlaybackCheckpoint> = {}): PlaybackCheckpoint {
  return {
    durationSeconds: 2_400,
    ended: false,
    positionSeconds: 600,
    serviceId: "netflix",
    serviceName: "Netflix",
    title: "Example Show",
    watchUrl: "https://www.netflix.com/watch/123",
    ...overrides
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("Continue Watching store", () => {
  it("persists safe public metadata without exposing resume URLs to the renderer", async () => {
    const { filePath, store } = await testStore();
    const saved = await store.upsert(checkpoint());

    expect(saved).toMatchObject({
      artworkDataUrl: null,
      durationSeconds: 2_400,
      positionSeconds: 600,
      serviceId: "netflix",
      title: "Example Show"
    });
    expect(saved).not.toHaveProperty("watchUrl");
    expect(store.resumeTarget(saved?.id)).toEqual({
      serviceId: "netflix",
      watchUrl: "https://www.netflix.com/watch/123"
    });

    const restored = new ContinueWatchingStore(filePath);
    await restored.initialize();
    expect(restored.list()).toHaveLength(1);
    expect(restored.list()[0]).not.toHaveProperty("watchUrl");
    expect(await readFile(filePath, "utf8")).not.toContain("token=");
  });

  it("updates progress, caches artwork, and removes completed playback", async () => {
    const { store } = await testStore();
    const first = await store.upsert(checkpoint());
    expect(first).not.toBeNull();

    const image = "data:image/jpeg;base64,ZmFrZQ==";
    expect(await store.updateArtwork(first?.id ?? "", image)).toBe(true);
    await store.upsert(checkpoint({ positionSeconds: 1_200 }));
    expect(store.list()[0]).toMatchObject({ artworkDataUrl: image, positionSeconds: 1_200 });

    await store.upsert(checkpoint({ positionSeconds: 2_300 }));
    expect(store.list()).toEqual([]);
  });

  it("keeps different service URLs as separate newest-first items", async () => {
    const { store } = await testStore();
    const first = await store.upsert(checkpoint());
    const second = await store.upsert(checkpoint({
      serviceId: "youtube",
      serviceName: "YouTube",
      title: "Another Video",
      watchUrl: "https://www.youtube.com/watch?v=abc"
    }));

    expect(store.list().map((item) => item.id)).toEqual([second?.id, first?.id]);
  });
});
