import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OpenAiCredentialStatus } from "./contracts";

const MIN_API_KEY_LENGTH = 20;
const MAX_API_KEY_LENGTH = 512;

export interface CredentialCipher {
  decryptString(value: Buffer): string;
  encryptString(value: string): Buffer;
  isEncryptionAvailable(): boolean;
}

function normalizedApiKey(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError("The OpenAI API key must be a string.");
  }

  const normalized = value.trim();
  if (
    normalized.length < MIN_API_KEY_LENGTH ||
    normalized.length > MAX_API_KEY_LENGTH ||
    /\s/.test(normalized)
  ) {
    throw new TypeError("The OpenAI API key format is invalid.");
  }

  return normalized;
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === "ENOENT";
}

export class OpenAiCredentialStore {
  readonly #cipher: CredentialCipher;
  readonly #filePath: string;
  #apiKey: string | null = null;
  #loadFailed = false;
  #writeSequence: Promise<void> = Promise.resolve();

  constructor(filePath: string, cipher: CredentialCipher) {
    this.#filePath = filePath;
    this.#cipher = cipher;
  }

  async initialize(): Promise<OpenAiCredentialStatus> {
    this.#apiKey = null;
    this.#loadFailed = false;

    if (!this.#cipher.isEncryptionAvailable()) {
      return this.status();
    }

    try {
      const encrypted = await readFile(this.#filePath);
      this.#apiKey = normalizedApiKey(this.#cipher.decryptString(encrypted));
    } catch (error) {
      if (!isMissingFile(error)) {
        this.#loadFailed = true;
      }
    }

    return this.status();
  }

  getApiKey(): string {
    if (!this.#cipher.isEncryptionAvailable()) {
      throw new Error("Secure credential storage is unavailable on this computer.");
    }
    if (this.#apiKey === null) {
      throw new Error("An OpenAI API key has not been configured.");
    }
    return this.#apiKey;
  }

  async save(value: unknown): Promise<OpenAiCredentialStatus> {
    if (!this.#cipher.isEncryptionAvailable()) {
      throw new Error("Secure credential storage is unavailable on this computer.");
    }

    const apiKey = normalizedApiKey(value);
    const encrypted = this.#cipher.encryptString(apiKey);
    const directory = path.dirname(this.#filePath);
    const temporaryPath = `${this.#filePath}.tmp`;

    this.#writeSequence = this.#writeSequence.catch(() => undefined).then(async () => {
      await mkdir(directory, { recursive: true });
      await writeFile(temporaryPath, encrypted, { mode: 0o600 });
      await rename(temporaryPath, this.#filePath);
    });
    await this.#writeSequence;

    this.#apiKey = apiKey;
    this.#loadFailed = false;
    return this.status();
  }

  async clear(): Promise<OpenAiCredentialStatus> {
    this.#apiKey = null;
    this.#loadFailed = false;
    this.#writeSequence = this.#writeSequence.catch(() => undefined).then(async () => {
      try {
        await unlink(this.#filePath);
      } catch (error) {
        if (!isMissingFile(error)) {
          throw error;
        }
      }
    });
    await this.#writeSequence;
    return this.status();
  }

  status(): OpenAiCredentialStatus {
    if (!this.#cipher.isEncryptionAvailable()) {
      return {
        detail: "Secure credential storage is unavailable on this computer.",
        state: "unavailable"
      };
    }
    if (this.#loadFailed) {
      return {
        detail: "The saved OpenAI API key could not be decrypted. Save it again to continue.",
        state: "invalid"
      };
    }
    if (this.#apiKey === null) {
      return {
        detail: "Add an OpenAI API key to use voice control.",
        state: "missing"
      };
    }
    return {
      detail: "An OpenAI API key is securely stored on this computer.",
      state: "configured"
    };
  }
}
