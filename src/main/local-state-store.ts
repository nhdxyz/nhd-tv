import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LocalAppState, LocalProfile, ProfilePreferences } from "./contracts";

const STORE_VERSION = 1;
const DEFAULT_PROFILE_ID = "default";
const MAX_PROFILES = 8;
const MAX_PROFILE_NAME_LENGTH = 32;

interface StoredProfile extends LocalProfile {
  createdAt: number;
}

interface StoredLocalState {
  activeProfileId: string;
  preferences: Record<string, ProfilePreferences>;
  profiles: StoredProfile[];
  version: number;
}

function normalizedProfileName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length === 0 ? null : normalized.slice(0, MAX_PROFILE_NAME_LENGTH);
}

function uniqueKnownIds(value: unknown, knownServiceIds: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter(
    (id): id is string => typeof id === "string" && knownServiceIds.has(id)
  ))];
}

function profilePreferences(
  value: unknown,
  knownServiceIds: ReadonlySet<string>,
  defaultEnabledServiceIds: readonly string[]
): ProfilePreferences {
  if (typeof value !== "object" || value === null) {
    return {
      enabledServiceIds: [...defaultEnabledServiceIds],
      favoriteServiceIds: [],
      serviceOrder: [...defaultEnabledServiceIds]
    };
  }

  const candidate = value as Partial<ProfilePreferences>;
  const enabledServiceIds = uniqueKnownIds(candidate.enabledServiceIds, knownServiceIds);
  const favoriteServiceIds = uniqueKnownIds(candidate.favoriteServiceIds, knownServiceIds)
    .filter((id) => enabledServiceIds.includes(id));
  const ordered = uniqueKnownIds(candidate.serviceOrder, knownServiceIds)
    .filter((id) => enabledServiceIds.includes(id));

  return {
    enabledServiceIds,
    favoriteServiceIds,
    serviceOrder: [...ordered, ...enabledServiceIds.filter((id) => !ordered.includes(id))]
  };
}

function publicProfile(profile: StoredProfile): LocalProfile {
  return { id: profile.id, name: profile.name };
}

export class LocalStateStore {
  readonly #defaultEnabledServiceIds: readonly string[];
  readonly #filePath: string;
  readonly #knownServiceIds: ReadonlySet<string>;
  #state: StoredLocalState;
  #writeSequence: Promise<void> = Promise.resolve();

  constructor(
    filePath: string,
    knownServiceIds: readonly string[],
    defaultEnabledServiceIds: readonly string[]
  ) {
    this.#filePath = filePath;
    this.#knownServiceIds = new Set(knownServiceIds);
    this.#defaultEnabledServiceIds = defaultEnabledServiceIds.filter((id) =>
      this.#knownServiceIds.has(id)
    );
    this.#state = this.#defaultState();
  }

  async initialize(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.#filePath, "utf8"));
      if (typeof parsed !== "object" || parsed === null) {
        return;
      }

      const document = parsed as Partial<StoredLocalState>;
      if (document.version !== STORE_VERSION || !Array.isArray(document.profiles)) {
        return;
      }

      const ids = new Set<string>();
      const profiles = document.profiles.flatMap((candidate): StoredProfile[] => {
        if (typeof candidate !== "object" || candidate === null) {
          return [];
        }

        const profile = candidate as Partial<StoredProfile>;
        const name = normalizedProfileName(profile.name);
        if (
          typeof profile.id !== "string" ||
          !/^[a-zA-Z0-9-]{1,64}$/.test(profile.id) ||
          ids.has(profile.id) ||
          name === null
        ) {
          return [];
        }

        ids.add(profile.id);
        return [{
          createdAt: typeof profile.createdAt === "number" ? profile.createdAt : 0,
          id: profile.id,
          name
        }];
      }).slice(0, MAX_PROFILES);

      if (profiles.length === 0) {
        return;
      }

      const storedPreferences = typeof document.preferences === "object" &&
        document.preferences !== null
        ? document.preferences
        : {};
      const preferences = Object.fromEntries(profiles.map((profile) => [
        profile.id,
        profilePreferences(
          storedPreferences[profile.id],
          this.#knownServiceIds,
          this.#defaultEnabledServiceIds
        )
      ]));
      const activeProfileId = typeof document.activeProfileId === "string" &&
        ids.has(document.activeProfileId)
        ? document.activeProfileId
        : profiles[0]?.id ?? DEFAULT_PROFILE_ID;

      this.#state = { activeProfileId, preferences, profiles, version: STORE_VERSION };
    } catch {
      this.#state = this.#defaultState();
    }
  }

  snapshot(): LocalAppState {
    const preferences = this.#state.preferences[this.#state.activeProfileId]
      ?? profilePreferences(null, this.#knownServiceIds, this.#defaultEnabledServiceIds);

    return {
      activeProfileId: this.#state.activeProfileId,
      preferences: {
        enabledServiceIds: [...preferences.enabledServiceIds],
        favoriteServiceIds: [...preferences.favoriteServiceIds],
        serviceOrder: [...preferences.serviceOrder]
      },
      profiles: this.#state.profiles.map(publicProfile)
    };
  }

  async createProfile(nameValue: unknown): Promise<LocalAppState> {
    const name = normalizedProfileName(nameValue);
    if (name === null) {
      throw new TypeError("Profile name must contain at least one character.");
    }

    if (this.#state.profiles.length >= MAX_PROFILES) {
      throw new Error(`NHD-TV supports up to ${MAX_PROFILES} local profiles.`);
    }

    const profile: StoredProfile = { createdAt: Date.now(), id: randomUUID(), name };
    this.#state.profiles.push(profile);
    this.#state.preferences[profile.id] = profilePreferences(
      null,
      this.#knownServiceIds,
      this.#defaultEnabledServiceIds
    );
    this.#state.activeProfileId = profile.id;
    await this.#persist();
    return this.snapshot();
  }

  async selectProfile(profileId: unknown): Promise<LocalAppState> {
    if (
      typeof profileId !== "string" ||
      !this.#state.profiles.some((profile) => profile.id === profileId)
    ) {
      throw new Error("That local profile does not exist.");
    }

    this.#state.activeProfileId = profileId;
    await this.#persist();
    return this.snapshot();
  }

  async updatePreferences(value: unknown): Promise<LocalAppState> {
    const preferences = profilePreferences(
      value,
      this.#knownServiceIds,
      this.#defaultEnabledServiceIds
    );
    this.#state.preferences[this.#state.activeProfileId] = preferences;
    await this.#persist();
    return this.snapshot();
  }

  #defaultState(): StoredLocalState {
    const profile: StoredProfile = {
      createdAt: Date.now(),
      id: DEFAULT_PROFILE_ID,
      name: "Local profile"
    };

    return {
      activeProfileId: profile.id,
      preferences: {
        [profile.id]: profilePreferences(
          null,
          this.#knownServiceIds,
          this.#defaultEnabledServiceIds
        )
      },
      profiles: [profile],
      version: STORE_VERSION
    };
  }

  async #persist(): Promise<void> {
    const snapshot = JSON.stringify(this.#state, null, 2);
    this.#writeSequence = this.#writeSequence.catch(() => undefined).then(async () => {
      const directory = path.dirname(this.#filePath);
      const temporaryPath = `${this.#filePath}.tmp`;
      await mkdir(directory, { recursive: true });
      await writeFile(temporaryPath, `${snapshot}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(temporaryPath, this.#filePath);
    });

    return this.#writeSequence;
  }
}
