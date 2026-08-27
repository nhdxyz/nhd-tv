import type { DevicePreferences } from "./contracts";

export const AMBIENT_IDLE_POLL_MS = 1_000;

export interface AmbientDisplayPolicyInput {
  appIdleMilliseconds: number;
  playbackActive: boolean;
  preferences: Pick<
    DevicePreferences,
    "ambientDisplayDelayMinutes" | "ambientDisplayEnabled"
  >;
  presentationBlocked: boolean;
  systemIdleSeconds: number;
  windowVisible: boolean;
}

export function shouldActivateAmbientDisplay(
  input: AmbientDisplayPolicyInput
): boolean {
  if (
    !input.preferences.ambientDisplayEnabled ||
    !input.windowVisible ||
    input.playbackActive ||
    input.presentationBlocked
  ) {
    return false;
  }

  const delayMilliseconds = input.preferences.ambientDisplayDelayMinutes * 60_000;
  return input.appIdleMilliseconds >= delayMilliseconds &&
    input.systemIdleSeconds * 1_000 >= delayMilliseconds;
}
