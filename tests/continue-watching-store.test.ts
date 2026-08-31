import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    subtitle: "S1 E2 · An Example",
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
      subtitle: "S1 E2 · An Example",
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
    expect(await store.updateArtwork(first?.id ?? "", image, 341)).toBe(true);
    await store.upsert(checkpoint({ positionSeconds: 1_200 }));
    expect(store.list()[0]).toMatchObject({ artworkDataUrl: image, positionSeconds: 1_200 });

    await store.upsert(checkpoint({ positionSeconds: 2_300 }));
    expect(store.list()).toEqual([]);
  });

  it("replaces cached artwork only with a higher-resolution image", async () => {
    const { store } = await testStore();
    const item = await store.upsert(checkpoint());
    const lowResolution = "data:image/jpeg;base64,bG93";
    const highResolution = "data:image/jpeg;base64,aGlnaA==";

    expect(await store.updateArtwork(item?.id ?? "", lowResolution, 341)).toBe(true);
    expect(await store.updateArtwork(item?.id ?? "", highResolution, 320)).toBe(false);
    expect(await store.updateArtwork(item?.id ?? "", highResolution, 848)).toBe(true);
    expect(store.list()[0]).toMatchObject({ artworkDataUrl: highResolution });
    expect(store.list()[0]).not.toHaveProperty("artworkPixelWidth");
  });

  it("drops legacy artwork that was not bound to its captured title", async () => {
    const { filePath } = await testStore();
    await writeFile(filePath, JSON.stringify({
      items: [{
        artworkDataUrl: "data:image/jpeg;base64,dW5yZWxhdGVk",
        artworkPixelWidth: 1_280,
        durationSeconds: 6_480,
        id: "legacy-mismatched-artwork",
        positionSeconds: 1_200,
        serviceId: "netflix",
        serviceName: "Netflix",
        subtitle: null,
        title: "2 Fast 2 Furious",
        updatedAt: 1,
        watchUrl: "https://www.netflix.com/watch/60027713"
      }],
      version: 3
    }));

    const restored = new ContinueWatchingStore(filePath);
    await restored.initialize();

    expect(restored.list()).toEqual([expect.objectContaining({
      artworkDataUrl: null,
      id: "legacy-mismatched-artwork",
      positionSeconds: 1_200,
      title: "2 Fast 2 Furious"
    })]);
    expect(restored.resumeTarget("legacy-mismatched-artwork")).toEqual({
      serviceId: "netflix",
      watchUrl: "https://www.netflix.com/watch/60027713"
    });
  });

  it("does not replace a real title with a generic provider title", async () => {
    const { store } = await testStore();
    await store.upsert(checkpoint({ title: "Facing El Chapo" }));
    await store.upsert(checkpoint({ positionSeconds: 900, title: "Netflix" }));

    expect(store.list()[0]).toMatchObject({
      positionSeconds: 900,
      title: "Facing El Chapo"
    });
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

  it("removes one local item without changing any other service history", async () => {
    const { store } = await testStore();
    const netflix = await store.upsert(checkpoint());
    const youtube = await store.upsert(checkpoint({
      serviceId: "youtube",
      serviceName: "YouTube",
      subtitle: null,
      title: "Another Video",
      watchUrl: "https://www.youtube.com/watch?v=abc"
    }));

    expect(await store.remove(netflix?.id)).toBe(true);
    expect(await store.remove(netflix?.id)).toBe(false);
    expect(await store.remove(null)).toBe(false);
    expect(store.list().map((item) => item.id)).toEqual([youtube?.id]);
  });

  it("loads version-one history with a null subtitle", async () => {
    const { filePath } = await testStore();
    await writeFile(filePath, JSON.stringify({
      items: [{
        artworkDataUrl: null,
        durationSeconds: 2_400,
        id: "legacy-item",
        positionSeconds: 600,
        serviceId: "netflix",
        serviceName: "Netflix",
        title: "Legacy Show",
        updatedAt: 1,
        watchUrl: "https://www.netflix.com/watch/123"
      }],
      version: 1
    }));

    const restored = new ContinueWatchingStore(filePath);
    await restored.initialize();
    expect(restored.list()).toEqual([expect.objectContaining({
      id: "legacy-item",
      subtitle: null,
      title: "Legacy Show"
    })]);
  });
});
