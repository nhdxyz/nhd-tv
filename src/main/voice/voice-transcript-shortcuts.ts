import type {
  VoiceConfirmationAction,
  VoiceControlAction,
  VoiceCurrentMediaAction,
  VoiceIntent,
  VoiceMediaAction,
  VoiceMediaReference,
  VoiceProviderHint
} from "./voice-intent";
import {
  isKnownVoiceAppName,
  normalizeVoiceAppName
} from "./voice-app-matcher";

const CONFIRMATION_PHRASES: Readonly<Record<string, VoiceConfirmationAction>> = {
  cancel: "cancel",
  confirm: "confirm",
  "go ahead": "confirm",
  "never mind": "cancel",
  no: "cancel",
  nope: "cancel",
  yeah: "confirm",
  yep: "confirm",
  yes: "confirm"
};

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

const CURRENT_MEDIA_PHRASES: Readonly<Record<string, VoiceCurrentMediaAction>> = {
  "how long is left": "time-remaining",
  "how long until this ends": "time-remaining",
  "how much longer": "time-remaining",
  "how much time is left": "time-remaining",
  "what am i watching": "identity",
  "what are we watching": "identity",
  "what episode are we on": "episode",
  "what episode is this": "episode",
  "what is playing": "identity",
  "what is this called": "identity",
  "what s playing": "identity",
  "what song is playing": "song",
  "what song is this": "song",
  "what time does this end": "end-time",
  "what time will this end": "end-time",
  "when does this end": "end-time",
  "when will this end": "end-time",
  "which episode is this": "episode",
  "which song is this": "song"
};

const VOICE_MEDIA_PROVIDER_NAMES = new Set([
  "disney",
  "disney plus",
  "netflix",
  "spotify",
  "youtube"
]);

const MEDIA_REFERENCE_PHRASES: Readonly<Record<string, {
  action: VoiceMediaAction;
  ordinal: number | null;
  reference: VoiceMediaReference;
}>> = {
  "open it": { action: "open", ordinal: null, reference: "last-media" },
  "play it": { action: "play", ordinal: null, reference: "last-media" },
  "play this": { action: "play", ordinal: null, reference: "current-media" },
  "put that on": { action: "play", ordinal: null, reference: "last-media" },
  "the eighth one": { action: "play", ordinal: 8, reference: "candidate" },
  "the fifth one": { action: "play", ordinal: 5, reference: "candidate" },
  "the first one": { action: "play", ordinal: 1, reference: "candidate" },
  "the fourth one": { action: "play", ordinal: 4, reference: "candidate" },
  "the ninth one": { action: "play", ordinal: 9, reference: "candidate" },
  "the second one": { action: "play", ordinal: 2, reference: "candidate" },
  "the seventh one": { action: "play", ordinal: 7, reference: "candidate" },
  "the sixth one": { action: "play", ordinal: 6, reference: "candidate" },
  "the tenth one": { action: "play", ordinal: 10, reference: "candidate" },
  "the third one": { action: "play", ordinal: 3, reference: "candidate" },
  "what service has it": { action: "lookup", ordinal: null, reference: "last-media" },
  "where can i watch it": { action: "lookup", ordinal: null, reference: "last-media" }
};

const REFERENCE_PROVIDER_HINTS: Readonly<Record<string, VoiceProviderHint>> = {
  disney: "disney-plus",
  "disney plus": "disney-plus",
  netflix: "netflix",
  spotify: "spotify",
  youtube: "youtube"
};

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
  const currentMediaAction = CURRENT_MEDIA_PHRASES[phrase];
  if (currentMediaAction !== undefined) {
    return { action: currentMediaAction, kind: "current-media" };
  }
  const control = CONTROL_PHRASES[phrase];
  if (control !== undefined) return { action: control, kind: "control" };
  const confirmation = CONFIRMATION_PHRASES[phrase];
  if (confirmation !== undefined) {
    return { action: confirmation, kind: "confirmation" };
  }
  const mediaReference = MEDIA_REFERENCE_PHRASES[phrase];
  if (mediaReference !== undefined) {
    return {
      ...mediaReference,
      kind: "media-reference",
      providerHint: null
    };
  }
  const providerCorrection = /^(?:on )?(.+) instead$/.exec(phrase);
  const providerHint = providerCorrection === null
    ? undefined
    : REFERENCE_PROVIDER_HINTS[providerCorrection[1] ?? ""];
  if (providerHint !== undefined) {
    return {
      action: "play",
      kind: "media-reference",
      ordinal: null,
      providerHint,
      reference: "last-media"
    };
  }
  const appName = appNameFromPhrase(phrase);
  return appName === null ? null : { kind: "app", title: appName };
}
