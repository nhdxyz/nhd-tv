import type { VoiceServiceId } from "./voice-command-router";

export interface VoiceExecutionProfileState {
  activeProfileId: string;
  enabledServiceIds: readonly string[];
  profileRevision: number;
}

export interface VoiceExecutionScope {
  activeProfileId: string;
  profileRevision: number;
}

export function captureVoiceExecutionScope(
  state: VoiceExecutionProfileState
): VoiceExecutionScope {
  return {
    activeProfileId: state.activeProfileId,
    profileRevision: state.profileRevision
  };
}

/**
 * Revalidates a media command against the same profile generation that created
 * it. Lineup changes may only remove candidates from the original plan; a
 * service enabled after the command began never gains authority to launch.
 */
export function revalidateVoiceCandidateServiceIds(
  scope: VoiceExecutionScope,
  state: VoiceExecutionProfileState,
  plannedServiceIds: readonly VoiceServiceId[]
): VoiceServiceId[] | null {
  if (
    state.activeProfileId !== scope.activeProfileId ||
    state.profileRevision !== scope.profileRevision
  ) {
    return null;
  }

  const enabled = new Set(state.enabledServiceIds);
  const seen = new Set<VoiceServiceId>();
  return plannedServiceIds.filter((serviceId) => {
    if (!enabled.has(serviceId) || seen.has(serviceId)) return false;
    seen.add(serviceId);
    return true;
  });
}
