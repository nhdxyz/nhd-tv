import type { RemoteAction, VoicePlaybackMode } from "../contracts";
import type {
  VoiceControlAction,
  VoiceIntent,
  VoiceMediaIntent,
  VoiceProviderHint
} from "./voice-intent";

const VOICE_SERVICE_IDS = ["netflix", "spotify", "youtube"] as const;

export type VoiceServiceId = (typeof VOICE_SERVICE_IDS)[number];

export interface VoiceCommandContext {
  activeServiceId: string | null;
  enabledServiceIds: readonly string[];
  muted: boolean | null;
  playbackMode: VoicePlaybackMode;
  playing: boolean | null;
  serviceOrder: readonly string[];
}

export type VoiceCommandPlan =
  | { action: RemoteAction; kind: "remote-action" }
  | { detail: string; kind: "no-op" }
  | { kind: "close-service" }
  | {
    candidateServiceIds: VoiceServiceId[];
    confirmationRequired: boolean;
    intent: VoiceMediaIntent;
    kind: "resolve-media";
    launchAllowed: boolean;
  };

function supportedEnabledServices(
  enabledServiceIds: readonly string[],
  serviceOrder: readonly string[]
): VoiceServiceId[] {
  const enabled = new Set(enabledServiceIds);
  const ordered = [...serviceOrder, ...VOICE_SERVICE_IDS];
  return ordered.filter((serviceId, index): serviceId is VoiceServiceId =>
    VOICE_SERVICE_IDS.includes(serviceId as VoiceServiceId) &&
    enabled.has(serviceId) &&
    ordered.indexOf(serviceId) === index
  );
}

function impliedProvider(intent: VoiceMediaIntent): VoiceProviderHint | null {
  if (intent.mediaType === "recommendation" || intent.mediaType === "similar-title") {
    return "netflix";
  }
  if (["album", "artist", "playlist", "song"].includes(intent.mediaType)) {
    return "spotify";
  }
  if (intent.mediaType === "channel" || intent.mediaType === "video") {
    return "youtube";
  }
  return intent.providerHint;
}

function remoteActionPlan(action: RemoteAction): VoiceCommandPlan {
  return { action, kind: "remote-action" };
}

function controlPlan(
  action: VoiceControlAction,
  context: VoiceCommandContext
): VoiceCommandPlan {
  switch (action) {
    case "back":
    case "fast-forward":
    case "home":
    case "mute":
    case "play-pause":
    case "rewind":
    case "volume-down":
    case "volume-up":
      return remoteActionPlan(action);
    case "pause":
      if (context.activeServiceId === null || context.playing === false) {
        return { detail: "Playback is already paused.", kind: "no-op" };
      }
      return remoteActionPlan("play-pause");
    case "resume":
      if (context.activeServiceId === null) {
        return { detail: "Open something before resuming playback.", kind: "no-op" };
      }
      if (context.playing === true) {
        return { detail: "Playback is already running.", kind: "no-op" };
      }
      return remoteActionPlan("play-pause");
    case "unmute":
      if (context.muted === false) {
        return { detail: "Audio is already unmuted.", kind: "no-op" };
      }
      return remoteActionPlan("mute");
    case "stop":
      return context.activeServiceId === null
        ? { detail: "Nothing is currently open.", kind: "no-op" }
        : { kind: "close-service" };
  }
}

function mediaPlan(
  intent: VoiceMediaIntent,
  context: VoiceCommandContext
): VoiceCommandPlan {
  const enabled = supportedEnabledServices(context.enabledServiceIds, context.serviceOrder);
  const provider = impliedProvider(intent);
  const candidateServiceIds = provider === null
    ? enabled
    : enabled.includes(provider)
      ? [provider]
      : [];
  const isPlayback = intent.action === "play";

  return {
    candidateServiceIds,
    confirmationRequired: isPlayback && context.playbackMode === "confirm",
    intent,
    kind: "resolve-media",
    launchAllowed: intent.action !== "lookup" && candidateServiceIds.length > 0
  };
}

export function planVoiceCommand(
  intent: VoiceIntent,
  context: VoiceCommandContext
): VoiceCommandPlan {
  if (intent.kind === "unknown") {
    return {
      detail: "Please name what you want to watch, play, open, or control.",
      kind: "no-op"
    };
  }
  return intent.kind === "control"
    ? controlPlan(intent.action, context)
    : mediaPlan(intent, context);
}
