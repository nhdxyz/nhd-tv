import type { LocalAppState, ProfilePreferences } from "../contracts";
import type { ServiceOperationToken } from "../service-operation-owner";
import { removedEnabledServiceIds } from "./voice-execution-scope";

export interface VoiceProfilePreferenceCoordinatorOptions {
  beginServiceBarrier: () => ServiceOperationToken | undefined;
  cancelDiscovery: () => void;
  cancelVoice: () => void;
  closeActiveService: (operation: ServiceOperationToken | undefined) => Promise<void>;
  getActiveServiceId: () => string | null;
  getCurrentPreferences: () => ProfilePreferences;
  previewPreferences: (value: unknown) => ProfilePreferences;
  setAuthorityUpdateInProgress: (inProgress: boolean) => void;
  updatePreferences: (preferences: ProfilePreferences) => Promise<LocalAppState>;
}

/**
 * Serializes profile settings and establishes a synchronous revocation barrier
 * before removing any service authority from the shared TV.
 */
export class VoiceProfilePreferenceCoordinator {
  readonly #options: VoiceProfilePreferenceCoordinatorOptions;
  #sequence: Promise<void> = Promise.resolve();

  constructor(options: VoiceProfilePreferenceCoordinatorOptions) {
    this.#options = options;
  }

  update(value: unknown): Promise<LocalAppState> {
    const execution = this.#sequence.then(() => this.#update(value));
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

    const removed = new Set(removedServiceIds);
    this.#options.setAuthorityUpdateInProgress(true);
    try {
      // Supersede the provider operation before aborting the phone signal. This
      // prevents an old abort callback from closing a still-enabled provider.
      const barrier = this.#options.beginServiceBarrier();
      this.#options.cancelDiscovery();
      this.#options.cancelVoice();

      const activeServiceId = this.#options.getActiveServiceId();
      if (activeServiceId !== null && removed.has(activeServiceId)) {
        await this.#options.closeActiveService(barrier);
      }

      const remainingActiveServiceId = this.#options.getActiveServiceId();
      if (remainingActiveServiceId !== null && removed.has(remainingActiveServiceId)) {
        throw new Error("A disabled service could not be closed safely.");
      }

      // LocalStateStore mutates its in-memory snapshot before awaiting disk I/O,
      // so this must remain the final step after any removed view is gone.
      return await this.#options.updatePreferences(nextPreferences);
    } finally {
      this.#options.setAuthorityUpdateInProgress(false);
    }
  }
}
