import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AMBIENT_CLOCK_STYLES,
  type AmbientClockStyle,
  type DevicePreferences,
  type CustomServiceManifest,
  type LocalAppState,
  type LocalProfile,
  type ProfilePreferences,
  type VoicePlaybackMode,
  VOICE_PLAYBACK_MODES
} from "./contracts";

const STORE_VERSION = 7;
const DEFAULT_PROFILE_ID = "default";
const MAX_PROFILES = 8;
const MAX_PROFILE_NAME_LENGTH = 32;
const MAX_RECENT_SERVICES = 12;

function isAmbientClockStyle(value: unknown): value is AmbientClockStyle {
  return AMBIENT_CLOCK_STYLES.some((style) => style === value);
}

function isVoicePlaybackMode(value: unknown): value is VoicePlaybackMode {
  return VOICE_PLAYBACK_MODES.some((mode) => mode === value);
}

interface StoredProfile extends LocalProfile {
  createdAt: number;
}

interface StoredLocalState {
  activeProfileId: string;
  customServices: CustomServiceManifest[];
  devicePreferences: DevicePreferences;
  preferences: Record<string, ProfilePreferences>;
  profiles: StoredProfile[];
  recentServiceIds: Record<string, string[]>;
  version: number;
}

function customServiceManifest(value: unknown): CustomServiceManifest | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Partial<CustomServiceManifest>;
  const name = normalizedProfileName(candidate.name);
  if (
    typeof candidate.id !== "string" ||
    !/^custom-[a-f0-9-]{36}$/.test(candidate.id) ||
    name === null ||
    typeof candidate.startUrl !== "string"
  ) {
    return null;
  }

  try {
    const url = new URL(candidate.startUrl);
    if (
      url.protocol !== "https:" ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      return null;
    }
    url.hash = "";
    return { id: candidate.id, name, startUrl: url.toString() };
  } catch {
    return null;
  }
}

function devicePreferences(value: unknown): DevicePreferences {
  const candidate = typeof value === "object" && value !== null
    ? value as Partial<DevicePreferences>
    : {};
  return {
    ambientClockStyle: isAmbientClockStyle(candidate.ambientClockStyle)
      ? candidate.ambientClockStyle
      : AMBIENT_CLOCK_STYLES[0],
    ambientDisplayDelayMinutes: candidate.ambientDisplayDelayMinutes === 5 ||
      candidate.ambientDisplayDelayMinutes === 30
      ? candidate.ambientDisplayDelayMinutes
      : 10,
    ambientDisplayEnabled: candidate.ambientDisplayEnabled !== false,
    autoApproveFirstRemote: candidate.autoApproveFirstRemote !== false,
    fullscreen: candidate.fullscreen !== false,
    reducedMotion: candidate.reducedMotion === true,
    safeArea: candidate.safeArea === "compact" || candidate.safeArea === "wide"
      ? candidate.safeArea
      : "standard",
    selectedDisplayId: typeof candidate.selectedDisplayId === "string"
      ? candidate.selectedDisplayId
      : null,
    voiceControlEnabled: candidate.voiceControlEnabled === true,
    voiceRegion: normalizedVoiceRegion(candidate.voiceRegion),
    youtubeTvModeEnabled: candidate.youtubeTvModeEnabled !== false,
    youtubeTvScale: candidate.youtubeTvScale === "compact" || candidate.youtubeTvScale === "large"
      ? candidate.youtubeTvScale
      : "standard"
  };
}

function normalizedVoiceRegion(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
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
      serviceOrder: [...defaultEnabledServiceIds],
      voicePlaybackMode: "confirm"
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
    serviceOrder: [...ordered, ...enabledServiceIds.filter((id) => !ordered.includes(id))],
    voicePlaybackMode: isVoicePlaybackMode(candidate.voicePlaybackMode)
      ? candidate.voicePlaybackMode
      : "confirm"
  };
}

function publicProfile(profile: StoredProfile): LocalProfile {
  return { id: profile.id, name: profile.name };
}

export class LocalStateStore {
  readonly #defaultEnabledServiceIds: readonly string[];
  readonly #filePath: string;
  readonly #knownServiceIds: Set<string>;
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
      if (
        ![1, 2, 3, 4, 5, 6, STORE_VERSION].includes(document.version ?? -1) ||
        !Array.isArray(document.profiles)
      ) {
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

      const customServices = Array.isArray(document.customServices)
        ? document.customServices
          .map(customServiceManifest)
          .filter((service): service is CustomServiceManifest => service !== null)
        : [];
      for (const service of customServices) {
        this.#knownServiceIds.add(service.id);
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
      const storedRecentServiceIds = typeof document.recentServiceIds === "object" &&
        document.recentServiceIds !== null
        ? document.recentServiceIds
        : {};
      const recentServiceIds = Object.fromEntries(profiles.map((profile) => [
        profile.id,
        uniqueKnownIds(storedRecentServiceIds[profile.id], this.#knownServiceIds)
          .slice(0, MAX_RECENT_SERVICES)
      ]));

      this.#state = {
        activeProfileId,
        customServices,
        devicePreferences: devicePreferences(document.devicePreferences),
        preferences,
        profiles,
        recentServiceIds,
        version: STORE_VERSION
      };
    } catch {
      this.#state = this.#defaultState();
    }
  }

  snapshot(): LocalAppState {
    const preferences = this.#state.preferences[this.#state.activeProfileId]
      ?? profilePreferences(null, this.#knownServiceIds, this.#defaultEnabledServiceIds);

    return {
      activeProfileId: this.#state.activeProfileId,
      customServices: this.#state.customServices.map((service) => ({ ...service })),
      devicePreferences: { ...this.#state.devicePreferences },
      preferences: {
        enabledServiceIds: [...preferences.enabledServiceIds],
        favoriteServiceIds: [...preferences.favoriteServiceIds],
        serviceOrder: [...preferences.serviceOrder],
        voicePlaybackMode: preferences.voicePlaybackMode
      },
      profiles: this.#state.profiles.map(publicProfile),
      recentServiceIds: [
        ...(this.#state.recentServiceIds[this.#state.activeProfileId] ?? [])
      ]
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
    this.#state.recentServiceIds[profile.id] = [];
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
    const preferences = this.previewPreferences(value);
    this.#state.preferences[this.#state.activeProfileId] = preferences;
    await this.#persist();
    return this.snapshot();
  }

  /** Normalizes profile preferences without mutating or persisting state. */
  previewPreferences(value: unknown): ProfilePreferences {
    return profilePreferences(
      value,
      this.#knownServiceIds,
      this.#defaultEnabledServiceIds
    );
  }

  async updateDevicePreferences(value: unknown): Promise<LocalAppState> {
    this.#state.devicePreferences = devicePreferences(value);
    await this.#persist();
    return this.snapshot();
  }

  async recordServiceLaunch(serviceId: unknown): Promise<LocalAppState> {
    if (typeof serviceId !== "string" || !this.#knownServiceIds.has(serviceId)) {
      throw new Error("That service cannot be added to recent apps.");
    }

    const profileId = this.#state.activeProfileId;
    const recent = this.#state.recentServiceIds[profileId] ?? [];
    this.#state.recentServiceIds[profileId] = [
      serviceId,
      ...recent.filter((id) => id !== serviceId)
    ].slice(0, MAX_RECENT_SERVICES);
    await this.#persist();
    return this.snapshot();
  }

  async addCustomService(nameValue: unknown, startUrlValue: unknown): Promise<LocalAppState> {
    const manifest = customServiceManifest({
      id: `custom-${randomUUID()}`,
      name: nameValue,
      startUrl: startUrlValue
    });
    if (manifest === null) {
      throw new TypeError("Custom services require a name and an HTTPS start URL without credentials.");
    }

    if (this.#state.customServices.some((service) => service.startUrl === manifest.startUrl)) {
      throw new Error("That custom service URL is already in the Store.");
    }

    this.#state.customServices.push(manifest);
    this.#knownServiceIds.add(manifest.id);
    const preferences = this.#state.preferences[this.#state.activeProfileId];
    if (preferences !== undefined) {
      preferences.enabledServiceIds.push(manifest.id);
      preferences.serviceOrder.push(manifest.id);
    }
    await this.#persist();
    return this.snapshot();
  }

  async removeCustomService(serviceId: unknown): Promise<LocalAppState> {
    if (
      typeof serviceId !== "string" ||
      !this.#state.customServices.some((service) => service.id === serviceId)
    ) {
      throw new Error("That custom service does not exist.");
    }

    this.#state.customServices = this.#state.customServices.filter(
      (service) => service.id !== serviceId
    );
    this.#knownServiceIds.delete(serviceId);
    for (const preferences of Object.values(this.#state.preferences)) {
      preferences.enabledServiceIds = preferences.enabledServiceIds.filter((id) => id !== serviceId);
      preferences.favoriteServiceIds = preferences.favoriteServiceIds.filter((id) => id !== serviceId);
      preferences.serviceOrder = preferences.serviceOrder.filter((id) => id !== serviceId);
    }
    for (const [profileId, recent] of Object.entries(this.#state.recentServiceIds)) {
      this.#state.recentServiceIds[profileId] = recent.filter((id) => id !== serviceId);
    }
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
      customServices: [],
      devicePreferences: devicePreferences(null),
      preferences: {
        [profile.id]: profilePreferences(
          null,
          this.#knownServiceIds,
          this.#defaultEnabledServiceIds
        )
      },
      profiles: [profile],
      recentServiceIds: { [profile.id]: [] },
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
