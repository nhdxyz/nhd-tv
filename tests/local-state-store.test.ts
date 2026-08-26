import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalStateStore } from "../src/main/local-state-store";

const temporaryDirectories: string[] = [];

async function testStore(): Promise<{ filePath: string; store: LocalStateStore }> {
  const directory = await mkdtemp(path.join(tmpdir(), "nhd-tv-state-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, "local-state.json");
  const store = new LocalStateStore(
    filePath,
    ["netflix", "youtube", "disney-plus", "shaka-demo"],
    ["netflix", "youtube", "disney-plus"]
  );
  await store.initialize();
  return { filePath, store };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("local profile state", () => {
  it("creates a default profile with a curated lineup", async () => {
    const { store } = await testStore();
    expect(store.snapshot()).toEqual({
      activeProfileId: "default",
      preferences: {
        enabledServiceIds: ["netflix", "youtube", "disney-plus"],
        favoriteServiceIds: [],
        serviceOrder: ["netflix", "youtube", "disney-plus"]
      },
      profiles: [{ id: "default", name: "Local profile" }]
    });
  });

  it("creates, selects, and persists separate profile preferences", async () => {
    const { filePath, store } = await testStore();
    const created = await store.createProfile("  Kids   Room  ");
    const childId = created.activeProfileId;
    await store.updatePreferences({
      enabledServiceIds: ["youtube", "unknown", "netflix"],
      favoriteServiceIds: ["youtube", "disney-plus"],
      serviceOrder: ["netflix", "youtube"]
    });
    await store.selectProfile("default");

    const restored = new LocalStateStore(
      filePath,
      ["netflix", "youtube", "disney-plus", "shaka-demo"],
      ["netflix", "youtube", "disney-plus"]
    );
    await restored.initialize();
    expect(restored.snapshot().activeProfileId).toBe("default");
    await restored.selectProfile(childId);
    expect(restored.snapshot()).toMatchObject({
      preferences: {
        enabledServiceIds: ["youtube", "netflix"],
        favoriteServiceIds: ["youtube"],
        serviceOrder: ["netflix", "youtube"]
      },
      profiles: expect.arrayContaining([{ id: childId, name: "Kids Room" }])
    });
    expect(JSON.parse(await readFile(filePath, "utf8")).version).toBe(1);
  });

  it("sanitizes malformed disk state and rejects unknown profiles", async () => {
    const { filePath } = await testStore();
    await writeFile(filePath, JSON.stringify({
      activeProfileId: "missing",
      preferences: { valid: { enabledServiceIds: ["youtube"] } },
      profiles: [
        { createdAt: 1, id: "valid", name: "  Guest  " },
        { createdAt: 2, id: "bad/id", name: "Ignored" }
      ],
      version: 1
    }));
    const restored = new LocalStateStore(filePath, ["youtube"], ["youtube"]);
    await restored.initialize();
    expect(restored.snapshot()).toMatchObject({
      activeProfileId: "valid",
      profiles: [{ id: "valid", name: "Guest" }]
    });
    await expect(restored.selectProfile("missing")).rejects.toThrow("does not exist");
  });
});
