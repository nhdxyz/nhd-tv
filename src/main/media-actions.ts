import {
  MEDIA_ACTIONS,
  type MediaAction,
  type RemoteAction
} from "./contracts";

export interface MediaKeyInput {
  alt: boolean;
  control: boolean;
  key: string;
  meta: boolean;
  shift: boolean;
}

const HARDWARE_MEDIA_KEYS: Readonly<Record<string, MediaAction>> = {
  AudioVolumeDown: "volume-down",
  AudioVolumeMute: "mute",
  AudioVolumeUp: "volume-up",
  MediaFastForward: "fast-forward",
  MediaPause: "play-pause",
  MediaPlay: "play-pause",
  MediaPlayPause: "play-pause",
  MediaRewind: "rewind",
  VolumeDown: "volume-down",
  VolumeMute: "mute",
  VolumeUp: "volume-up"
};

const FALLBACK_MEDIA_KEYS: Readonly<Record<string, MediaAction>> = {
  " ": "play-pause",
  "+": "volume-up",
  "-": "volume-down",
  "=": "volume-up",
  ArrowLeft: "rewind",
  ArrowRight: "fast-forward",
  m: "mute",
  M: "mute"
};

const NATIVE_MEDIA_KEYS: Readonly<Record<MediaAction, string>> = {
  "fast-forward": "Right",
  mute: "VolumeMute",
  "play-pause": "MediaPlayPause",
  rewind: "Left",
  "volume-down": "VolumeDown",
  "volume-up": "VolumeUp"
};

export function isMediaAction(action: RemoteAction): action is MediaAction {
  return (MEDIA_ACTIONS as readonly string[]).includes(action);
}

export function mediaActionForKeyInput(input: MediaKeyInput): MediaAction | null {
  const hardwareAction = HARDWARE_MEDIA_KEYS[input.key];
  if (hardwareAction !== undefined) {
    return hardwareAction;
  }

  if (
    input.alt ||
    !input.shift ||
    (!input.control && !input.meta)
  ) {
    return null;
  }

  return FALLBACK_MEDIA_KEYS[input.key] ?? null;
}

export function nativeMediaKeyCode(action: MediaAction): string {
  return NATIVE_MEDIA_KEYS[action];
}
