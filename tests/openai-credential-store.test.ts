import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type CredentialCipher,
  OpenAiCredentialStore
} from "../src/main/openai-credential-store";

const temporaryDirectories: string[] = [];

class TestCipher implements CredentialCipher {
  constructor(private readonly available = true) {}

  decryptString(value: Buffer): string {
    const decoded = Buffer.from(value.toString("utf8"), "base64").toString("utf8");
    if (!decoded.startsWith("encrypted:")) {
      throw new Error("Invalid ciphertext");
    }
    return decoded.slice("encrypted:".length);
  }

  encryptString(value: string): Buffer {
    return Buffer.from(Buffer.from(`encrypted:${value}`, "utf8").toString("base64"));
  }

  isEncryptionAvailable(): boolean {
    return this.available;
  }
}

async function testStore(cipher: CredentialCipher = new TestCipher()) {
  const directory = await mkdtemp(path.join(tmpdir(), "nhd-tv-openai-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, "openai-credential.bin");
  return { filePath, store: new OpenAiCredentialStore(filePath, cipher) };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("OpenAI credential store", () => {
  it("reports a missing credential without creating a file", async () => {
    const { store } = await testStore();
    await expect(store.initialize()).resolves.toEqual({
      detail: "Add an OpenAI API key to use voice control.",
      state: "missing"
    });
    expect(() => store.getApiKey()).toThrow("has not been configured");
  });

  it("persists only encrypted bytes and restores the key", async () => {
    const apiKey = "sk-test-abcdefghijklmnopqrstuvwxyz";
    const { filePath, store } = await testStore();
    await store.initialize();
    await expect(store.save(`  ${apiKey}  `)).resolves.toMatchObject({ state: "configured" });

    const encrypted = await readFile(filePath);
    expect(encrypted.toString("utf8")).not.toContain(apiKey);

    const restored = new OpenAiCredentialStore(filePath, new TestCipher());
    await expect(restored.initialize()).resolves.toMatchObject({ state: "configured" });
    expect(restored.getApiKey()).toBe(apiKey);
  });

  it("rejects malformed keys before writing", async () => {
    const { store } = await testStore();
    await store.initialize();
    await expect(store.save("too short")).rejects.toThrow("format is invalid");
    await expect(store.save(`sk-${"x".repeat(600)}`)).rejects.toThrow("format is invalid");
  });

  it("fails closed when OS encryption is unavailable", async () => {
    const { store } = await testStore(new TestCipher(false));
    await expect(store.initialize()).resolves.toMatchObject({ state: "unavailable" });
    await expect(store.save("sk-test-abcdefghijklmnopqrstuvwxyz")).rejects.toThrow(
      "Secure credential storage is unavailable"
    );
  });

  it("does not expose a corrupt saved credential", async () => {
    const { filePath, store } = await testStore();
    await store.initialize();
    await store.save("sk-test-abcdefghijklmnopqrstuvwxyz");
    await writeFile(filePath, "not ciphertext");

    const restored = new OpenAiCredentialStore(filePath, new TestCipher());
    await expect(restored.initialize()).resolves.toMatchObject({ state: "invalid" });
    expect(() => restored.getApiKey()).toThrow("has not been configured");
  });

  it("clears the saved credential idempotently", async () => {
    const { store } = await testStore();
    await store.initialize();
    await store.save("sk-test-abcdefghijklmnopqrstuvwxyz");
    await expect(store.clear()).resolves.toMatchObject({ state: "missing" });
    await expect(store.clear()).resolves.toMatchObject({ state: "missing" });
  });
});
