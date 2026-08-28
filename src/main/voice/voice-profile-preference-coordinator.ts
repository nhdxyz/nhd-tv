import type {
  DevicePreferences,
  LocalAppState,
  ProfilePreferences
} from "../contracts";
import type { VoiceAuthoritySuspensionToken } from "../remote/voice-authority-gate";
import type { ServiceOperationToken } from "../service-operation-owner";
import { removedEnabledServiceIds } from "./voice-execution-scope";

export interface VoiceProfilePreferenceCoordinatorOptions {
  beginServiceBarrier: () => ServiceOperationToken | undefined;
  cancelConfirmations: () => Promise<void>;
  cancelDiscovery: () => void;
  cancelPendingCapture: () => Promise<void>;
  cancelVoice: () => void;
  closeActiveService: (operation: ServiceOperationToken | undefined) => Promise<void>;
  getActiveServiceId: () => string | null;
  getCurrentDevicePreferences: () => DevicePreferences;
  getCurrentPreferences: () => ProfilePreferences;
  previewDevicePreferencePatch: (value: unknown) => DevicePreferences;
  previewPreferences: (value: unknown) => ProfilePreferences;
  resumeVoiceAuthority: (token: VoiceAuthoritySuspensionToken) => void;
  setAuthorityUpdateInProgress: (inProgress: boolean) => void;
  suspendVoiceAuthority: () => VoiceAuthoritySuspensionToken;
  updateDevicePreferences: (preferences: DevicePreferences) => Promise<LocalAppState>;
  updatePreferences: (preferences: ProfilePreferences) => Promise<LocalAppState>;
}

/**
 * Serializes voice-affecting settings and establishes a synchronous revocation
 * barrier before profile, service, device, or credential authority is removed
 * from the shared TV.
 */
export class VoiceProfilePreferenceCoordinator {
  readonly #options: VoiceProfilePreferenceCoordinatorOptions;
  #sequence: Promise<void> = Promise.resolve();

  constructor(options: VoiceProfilePreferenceCoordinatorOptions) {
    this.#options = options;
  }

  update(value: unknown): Promise<LocalAppState> {
    return this.#enqueue(() => this.#update(value));
  }

  changeProfile(operation: () => Promise<LocalAppState>): Promise<LocalAppState> {
    return this.#enqueue(() => this.#withRevokedAuthority({
      closeEveryService: true,
      commit: operation,
      removedServiceIds: this.#options.getCurrentPreferences().enabledServiceIds
    }));
  }

  removeService(
    serviceId: string,
    prepare: () => Promise<void>,
    commit: () => Promise<LocalAppState>
  ): Promise<LocalAppState> {
    return this.#enqueue(() => this.#withRevokedAuthority({
      closeEveryService: false,
      commit,
      prepare,
      removedServiceIds: [serviceId]
    }));
  }

  updateDevicePreferences(value: unknown): Promise<LocalAppState> {
    return this.#enqueue(() => {
      const current = this.#options.getCurrentDevicePreferences();
      const next = this.#options.previewDevicePreferencePatch(value);
      const commit = () => this.#options.updateDevicePreferences(next);
      return current.voiceControlEnabled && !next.voiceControlEnabled
        ? this.#withRevokedAuthority({
            closeEveryService: false,
            commit,
            removedServiceIds: []
          })
        : commit();
    });
  }

  coordinateAuthorityChange<T>(
    shouldRevoke: () => boolean,
    commit: () => Promise<T>
  ): Promise<T> {
    return this.#enqueue(() => shouldRevoke()
      ? this.#withRevokedAuthority({
          closeEveryService: false,
          commit,
          removedServiceIds: []
        })
      : commit());
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const execution = this.#sequence.then(operation);
    this.#sequence = execution.then(() => undefined, () => undefined);
    return execution;
  }

  async #update(value: unknown): Promise<LocalAppState> {
    const nextPreferences = this.#options.previewPreferences(value);
    const currentPreferences = this.#options.getCurrentPreferences();
    const removedServiceIds = removedEnabledServiceIds(
      currentPreferences.enabledServiceIds,
      nextPreferences.enabledServiceIds
    );

    // Additions, ordering, favorites, and playback-mode changes cannot grant an
    // already-running command new authority, because its candidates are frozen.
    if (removedServiceIds.length === 0) {
      return this.#options.updatePreferences(nextPreferences);
    }

    return this.#withRevokedAuthority({
      closeEveryService: false,
      commit: () => this.#options.updatePreferences(nextPreferences),
      removedServiceIds
    });
  }

  async #withRevokedAuthority<T>(options: {
    closeEveryService: boolean;
    commit: () => Promise<T>;
    prepare?: () => Promise<void>;
    removedServiceIds: readonly string[];
  }): Promise<T> {
    const removed = new Set(options.removedServiceIds);
    this.#options.setAuthorityUpdateInProgress(true);
    const suspension = this.#options.suspendVoiceAuthority();
    try {
      const pendingCaptureCancellation = this.#options.cancelPendingCapture();
      let barrier = this.#options.beginServiceBarrier();
      this.#options.cancelDiscovery();
      this.#options.cancelVoice();
      await Promise.all([
        pendingCaptureCancellation,
        this.#options.cancelConfirmations()
      ]);
      await this.#closeForbiddenService(removed, options.closeEveryService, barrier);

      if (options.prepare !== undefined) {
        await options.prepare();
      }

      // A non-voice shell action can supersede the first barrier during an
      // asynchronous preparation (such as clearing a custom partition).
      // Re-establish ownership and close once more immediately before commit.
      barrier = this.#options.beginServiceBarrier();
      await this.#closeForbiddenService(removed, options.closeEveryService, barrier);

      // LocalStateStore mutates its in-memory snapshot before awaiting disk I/O,
      // so this must remain the final step after any removed view is gone.
      return await options.commit();
    } finally {
      this.#options.resumeVoiceAuthority(suspension);
      this.#options.setAuthorityUpdateInProgress(false);
    }
  }

  async #closeForbiddenService(
    removed: ReadonlySet<string>,
    closeEveryService: boolean,
    barrier: ServiceOperationToken | undefined
  ): Promise<void> {
    const activeServiceId = this.#options.getActiveServiceId();
    if (
      activeServiceId !== null &&
      (closeEveryService || removed.has(activeServiceId))
    ) {
      await this.#options.closeActiveService(barrier);
    }

    const remainingActiveServiceId = this.#options.getActiveServiceId();
    if (
      remainingActiveServiceId !== null &&
      (closeEveryService || removed.has(remainingActiveServiceId))
    ) {
      throw new Error("A revoked service could not be closed safely.");
    }
  }
}
