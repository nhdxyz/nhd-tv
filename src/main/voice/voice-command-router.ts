import type { RemoteAction, VoicePlaybackMode } from "../contracts";
import type {
  VoiceAppIntent,
  VoiceControlAction,
  VoiceCurrentMediaIntent,
  VoiceIntent,
  VoiceMediaIntent,
  VoiceProviderHint,
  VoiceSemanticControlIntent
} from "./voice-intent";
import type { VoiceSemanticControlRequest } from "./voice-semantic-control";
import {
  matchVoiceAppService,
  type VoiceAppService
} from "./voice-app-matcher";

const VOICE_SERVICE_IDS = ["disney-plus", "netflix", "spotify", "youtube"] as const;

export type VoiceServiceId = (typeof VOICE_SERVICE_IDS)[number];

export interface VoiceCommandContext {
  activeServiceId: string | null;
  enabledServiceIds: readonly string[];
  muted: boolean | null;
  playbackMode: VoicePlaybackMode;
  playing: boolean | null;
  services: readonly VoiceAppService[];
  serviceOrder: readonly string[];
}

export type VoiceCommandPlan =
  | { action: RemoteAction; kind: "remote-action" }
  | { action: VoiceCurrentMediaIntent["action"]; kind: "query-current-media" }
  | { kind: "semantic-control"; request: VoiceSemanticControlRequest }
  | { detail: string; handled?: boolean; kind: "no-op" }
  | { kind: "close-service" }
  | { kind: "launch-service"; serviceId: string; serviceName: string }
  | { kind: "set-system-muted"; muted: boolean }
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
  if (intent.action === "search" && intent.providerHint !== null) {
    return intent.providerHint;
  }
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
    case "down":
    case "fast-forward":
    case "home":
    case "left":
    case "play-pause":
    case "right":
    case "rewind":
    case "select":
    case "up":
    case "volume-down":
    case "volume-up":
      return remoteActionPlan(action);
    case "mute":
      return context.muted === true
        ? { detail: "Audio is already muted.", kind: "no-op" }
        : { kind: "set-system-muted", muted: true };
    case "next-track":
      return context.activeServiceId === "spotify"
        ? remoteActionPlan("fast-forward")
        : {
          detail: "Track skipping is available only while Spotify is open.",
          handled: false,
          kind: "no-op"
        };
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
    case "previous-track":
      return context.activeServiceId === "spotify"
        ? remoteActionPlan("rewind")
        : {
          detail: "Previous track is available only while Spotify is open.",
          handled: false,
          kind: "no-op"
        };
    case "unmute":
      if (context.muted === false) {
        return { detail: "Audio is already unmuted.", kind: "no-op" };
      }
      return { kind: "set-system-muted", muted: false };
    case "stop":
      return context.activeServiceId === null || context.playing !== true
        ? { detail: "Nothing is currently playing.", kind: "no-op" }
        : remoteActionPlan("play-pause");
    case "close-app":
      return context.activeServiceId === null
        ? { detail: "Nothing is currently open.", kind: "no-op" }
        : { kind: "close-service" };
  }
}

function appPlan(
  intent: VoiceAppIntent,
  context: VoiceCommandContext
): VoiceCommandPlan {
  const match = matchVoiceAppService(intent.title, context.services);
  if (match.kind === "none") {
    return {
      detail: `I couldn't find an app named ${intent.title}.`,
      handled: false,
      kind: "no-op"
    };
  }
  if (match.kind === "ambiguous") {
    return {
      detail: `More than one app matches ${intent.title}.`,
      handled: false,
      kind: "no-op"
    };
  }
  if (!context.enabledServiceIds.includes(match.service.id)) {
    return {
      detail: `${match.service.name} is not enabled in this profile.`,
      handled: false,
      kind: "no-op"
    };
  }
  return {
    kind: "launch-service",
    serviceId: match.service.id,
    serviceName: match.service.name
  };
}

function mediaPlan(
  intent: VoiceMediaIntent,
  context: VoiceCommandContext
): VoiceCommandPlan {
  const enabled = supportedEnabledServices(context.enabledServiceIds, context.serviceOrder);
  const activeSearchService = intent.action === "search" && intent.providerHint === null
    ? enabled.find((serviceId) => serviceId === context.activeServiceId)
    : undefined;
  const provider = intent.action === "search"
    ? intent.providerHint ?? activeSearchService ?? null
    : impliedProvider(intent);
  const eligible = provider === null && intent.action !== "search"
    ? enabled.filter((serviceId) => serviceId !== "spotify")
    : enabled;
  const candidateServiceIds = provider === null
    ? eligible
    : eligible.includes(provider)
      ? [provider]
      : [];
  const isPlayback = intent.action === "play";

  return {
    candidateServiceIds,
    confirmationRequired: isPlayback &&
      candidateServiceIds.length > 0 &&
      context.playbackMode === "confirm",
    intent,
    kind: "resolve-media",
    launchAllowed: intent.action !== "lookup" && candidateServiceIds.length > 0
  };
}

function semanticControlPlan(
  intent: VoiceSemanticControlIntent
): VoiceCommandPlan {
  if (intent.action === "seek-relative") {
    if (intent.offsetSeconds === null || intent.offsetSeconds === 0) {
      return { detail: "Please say how far to skip.", handled: false, kind: "no-op" };
    }
    return {
      kind: "semantic-control",
      request: { action: intent.action, offsetSeconds: intent.offsetSeconds }
    };
  }
  if (intent.action === "seek-absolute") {
    if (intent.positionSeconds === null) {
      return { detail: "Please say where to move playback.", handled: false, kind: "no-op" };
    }
    return {
      kind: "semantic-control",
      request: { action: intent.action, positionSeconds: intent.positionSeconds }
    };
  }
  return { kind: "semantic-control", request: { action: intent.action } };
}

export function planVoiceCommand(
  intent: VoiceIntent,
  context: VoiceCommandContext
): VoiceCommandPlan {
  if (intent.kind === "unknown") {
    return {
      detail: "Please name what you want to watch, play, open, or control.",
      handled: false,
      kind: "no-op"
    };
  }
  if (intent.kind === "app") return appPlan(intent, context);
  if (intent.kind === "current-media") {
    return { action: intent.action, kind: "query-current-media" };
  }
  if (intent.kind === "confirmation") {
    return {
      detail: "There isn't a voice confirmation waiting right now.",
      handled: false,
      kind: "no-op"
    };
  }
  if (intent.kind === "semantic-control") return semanticControlPlan(intent);
  if (intent.kind === "media-reference") {
    return {
      detail: "I lost track of what that referred to. Please name it again.",
      handled: false,
      kind: "no-op"
    };
  }
  return intent.kind === "control"
    ? controlPlan(intent.action, context)
    : mediaPlan(intent, context);
}
