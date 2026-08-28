import type { VoiceControlAction, VoiceIntent } from "./voice-intent";
import {
  isKnownVoiceAppName,
  normalizeVoiceAppName
} from "./voice-app-matcher";

const CONTROL_PHRASES: Readonly<Record<string, VoiceControlAction>> = {
  "close app": "close-app",
  "close this app": "close-app",
  continue: "resume",
  "continue playing": "resume",
  "exit app": "close-app",
  "exit this app": "close-app",
  "fast forward": "fast-forward",
  "go back": "back",
  "go down": "down",
  "go home": "home",
  "go left": "left",
  "go right": "right",
  "go up": "up",
  louder: "volume-up",
  "lower the volume": "volume-down",
  mute: "mute",
  "mute the tv": "mute",
  "mute this": "mute",
  "next song": "next-track",
  "next track": "next-track",
  pause: "pause",
  "pause it": "pause",
  "pause playback": "pause",
  "pause the movie": "pause",
  "pause the music": "pause",
  "pause the show": "pause",
  "pause the video": "pause",
  play: "resume",
  "press select": "select",
  "previous song": "previous-track",
  "previous track": "previous-track",
  quieter: "volume-down",
  resume: "resume",
  "resume it": "resume",
  rewind: "rewind",
  select: "select",
  "select this": "select",
  "skip back": "rewind",
  "skip forward": "fast-forward",
  "skip this song": "next-track",
  "skip this track": "next-track",
  stop: "stop",
  "stop playback": "stop",
  "stop playing": "stop",
  "take me back": "back",
  "take me home": "home",
  "turn it down": "volume-down",
  "turn it up": "volume-up",
  unmute: "unmute",
  "unmute the tv": "unmute",
  "unmute this": "unmute",
  "move down": "down",
  "move left": "left",
  "move right": "right",
  "move up": "up",
  "volume down": "volume-down",
  "volume up": "volume-up"
};

const VOICE_MEDIA_PROVIDER_NAMES = new Set([
  "disney",
  "disney plus",
  "netflix",
  "spotify",
  "youtube"
]);

function normalizedPhrase(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function appNameFromPhrase(phrase: string): string | null {
  if (isKnownVoiceAppName(phrase)) return normalizeVoiceAppName(phrase);
  const match = /^(?:go to|launch|open|put on|start|switch to|take me to) (?:the )?(.+)$/.exec(phrase);
  if (match === null) return null;
  const name = match[1] ?? "";
  return isKnownVoiceAppName(name) ? normalizeVoiceAppName(name) : null;
}

function namesUnsupportedMediaProvider(phrase: string): boolean {
  const suffix = /^(?:find|open|play|search(?: for)?|show me|watch)\s+.+\s+(?:in|on|using|with)\s+(?:the\s+)?(.+)$/.exec(
    phrase
  );
  const searchPrefix = /^(?:find|search)(?:\s+on)?\s+(?:the\s+)?(.+?)\s+for\s+.+$/.exec(
    phrase
  );
  const candidate = (suffix?.[1] ?? searchPrefix?.[1] ?? "")
    .replace(/\s+(?:app|application)$/, "");
  if (!isKnownVoiceAppName(candidate)) return false;
  return !VOICE_MEDIA_PROVIDER_NAMES.has(normalizeVoiceAppName(candidate));
}

/**
 * Resolves only closed, unambiguous phrases locally after transcription. This
 * makes common controls faster while every open-ended request still uses the
 * structured intent model.
 */
export function voiceTranscriptShortcut(value: string): VoiceIntent | null {
  const phrase = normalizedPhrase(value);
  if (phrase.length === 0) return null;
  if (namesUnsupportedMediaProvider(phrase)) return { kind: "unknown" };
  const control = CONTROL_PHRASES[phrase];
  if (control !== undefined) return { action: control, kind: "control" };
  const appName = appNameFromPhrase(phrase);
  return appName === null ? null : { kind: "app", title: appName };
}
