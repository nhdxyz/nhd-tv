import type {
  VoiceConfirmationAction,
  VoiceControlAction,
  VoiceCurrentMediaAction,
  VoiceIntent,
  VoiceMediaAction,
  VoiceMediaReference,
  VoicePlaybackRate,
  VoiceProviderDestination,
  VoiceProviderHint,
  VoiceSemanticControlAction
} from "./voice-intent";
import {
  isKnownVoiceAppName,
  normalizeVoiceAppName
} from "./voice-app-matcher";

type VoiceSimpleControlAction = Exclude<VoiceControlAction, "set-volume">;
type VoiceSimpleSemanticControlAction = Exclude<
  VoiceSemanticControlAction,
  "seek-absolute" | "seek-relative" | "set-playback-rate"
>;

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

const CONTROL_PHRASES: Readonly<Record<string, VoiceSimpleControlAction>> = {
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
  "how far in am i": "position",
  "how far into this am i": "position",
  "how far into this are we": "position",
  "how long is this": "duration",
  "how long is this episode": "duration",
  "how long is this movie": "duration",
  "how long is this song": "duration",
  "how long is this video": "duration",
  "how long is left": "time-remaining",
  "how long until this ends": "time-remaining",
  "how much longer": "time-remaining",
  "how much time is left": "time-remaining",
  "what am i watching": "identity",
  "what are we watching": "identity",
  "what episode are we on": "episode",
  "what episode is this": "episode",
  "what is playing": "identity",
  "what is the current timestamp": "position",
  "what is the runtime": "duration",
  "what is the total runtime": "duration",
  "what is this called": "identity",
  "what s the current timestamp": "position",
  "what s the runtime": "duration",
  "what s the total runtime": "duration",
  "what s playing": "identity",
  "what song is playing": "song",
  "what song is this": "song",
  "what time does this end": "end-time",
  "what time will this end": "end-time",
  "what timestamp are we at": "position",
  "what timestamp is this": "position",
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

const PROVIDER_DESTINATION_VERB = "(?:go to|open|show|show me|take me to)";
const PROVIDER_DESTINATION_NAME = "(?:disney|disney plus|netflix|spotify|youtube)";

function providerDestinationShortcut(phrase: string): VoiceIntent | null {
  const prefixed = new RegExp(
    `^${PROVIDER_DESTINATION_VERB} (?:my )?(?:(${PROVIDER_DESTINATION_NAME}) )?(library|subscriptions)$`
  ).exec(phrase);
  const suffixed = new RegExp(
    `^${PROVIDER_DESTINATION_VERB} (?:my )?(library|subscriptions) (?:in|on) (?:the )?(${PROVIDER_DESTINATION_NAME})$`
  ).exec(phrase);
  const destination = (prefixed?.[2] ?? suffixed?.[1]) as VoiceProviderDestination | undefined;
  if (destination === undefined) return null;

  const providerName = prefixed?.[1] ?? suffixed?.[2];
  if (providerName === undefined && destination === "library" && !phrase.includes(" my ")) {
    return null;
  }
  return {
    destination,
    kind: "provider-destination",
    providerHint: providerName === undefined
      ? null
      : REFERENCE_PROVIDER_HINTS[providerName] ?? null
  };
}

const SIMPLE_SEMANTIC_CONTROL_PHRASES: Readonly<
  Record<string, VoiceSimpleSemanticControlAction>
> = {
  "captions off": "captions-off",
  "captions on": "captions-on",
  "disable repeat": "repeat-off",
  "disable shuffle": "shuffle-off",
  "enable shuffle": "shuffle-on",
  "enter full screen": "fullscreen-enter",
  "enter fullscreen": "fullscreen-enter",
  "exit full screen": "fullscreen-exit",
  "exit fullscreen": "fullscreen-exit",
  "go full screen": "fullscreen-enter",
  "go fullscreen": "fullscreen-enter",
  "leave full screen": "fullscreen-exit",
  "leave fullscreen": "fullscreen-exit",
  "loop this song": "repeat-one",
  "loop this track": "repeat-one",
  "make it full screen": "fullscreen-enter",
  "make it fullscreen": "fullscreen-enter",
  "make this full screen": "fullscreen-enter",
  "make this fullscreen": "fullscreen-enter",
  "next episode": "next",
  "next video": "next",
  "play next episode": "next",
  "play next video": "next",
  "play previous episode": "previous",
  "play previous video": "previous",
  "previous episode": "previous",
  "previous video": "previous",
  "repeat all": "repeat-all",
  "repeat everything": "repeat-all",
  "repeat off": "repeat-off",
  "repeat one": "repeat-one",
  "repeat this song": "repeat-one",
  "repeat this track": "repeat-one",
  restart: "restart",
  "restart playback": "restart",
  "restart this": "restart",
  shuffle: "shuffle-on",
  "shuffle off": "shuffle-off",
  "shuffle on": "shuffle-on",
  "skip ad": "skip-ad",
  "skip intro": "skip-intro",
  "skip recap": "skip-recap",
  "skip the ad": "skip-ad",
  "skip the intro": "skip-intro",
  "skip the recap": "skip-recap",
  "start over": "restart",
  "start this over": "restart",
  "stop repeating": "repeat-off",
  "stop shuffling": "shuffle-off",
  "subtitles off": "captions-off",
  "subtitles on": "captions-on",
  "turn captions off": "captions-off",
  "turn captions on": "captions-on",
  "turn off captions": "captions-off",
  "turn off repeat": "repeat-off",
  "turn off shuffle": "shuffle-off",
  "turn off subtitles": "captions-off",
  "turn on captions": "captions-on",
  "turn on repeat": "repeat-all",
  "turn on shuffle": "shuffle-on",
  "turn on subtitles": "captions-on",
  "turn repeat off": "repeat-off",
  "turn repeat on": "repeat-all",
  "turn shuffle off": "shuffle-off",
  "turn shuffle on": "shuffle-on",
  "turn subtitles off": "captions-off",
  "turn subtitles on": "captions-on"
};

const PLAYBACK_RATE_TOKENS: Readonly<Record<string, VoicePlaybackRate>> = {
  "0 point 5": 0.5,
  "0 point 75": 0.75,
  "1": 1,
  "1 point 25": 1.25,
  "1 point 5": 1.5,
  half: 0.5,
  "one and a half": 1.5,
  "one and a quarter": 1.25,
  "one half": 0.5,
  "one point five": 1.5,
  "one point two five": 1.25,
  normal: 1,
  "point five": 0.5,
  "point seven five": 0.75,
  regular: 1,
  "three quarter": 0.75,
  "three quarters": 0.75,
  "zero point five": 0.5,
  "zero point seven five": 0.75
};

const RELATIVE_PLAYBACK_RATE_PHRASES = new Set([
  "decrease playback speed",
  "faster",
  "increase playback speed",
  "make it faster",
  "make it slower",
  "play faster",
  "play slower",
  "slow down",
  "slow it down",
  "slower",
  "speed this up",
  "speed it up"
]);

function playbackRateToken(value: string): VoicePlaybackRate | null {
  const token = value
    .replace(/ (?:times|x)$/, "")
    .trim();
  return PLAYBACK_RATE_TOKENS[token] ?? null;
}

function looksLikePlaybackRate(value: string): boolean {
  return /^(?:(?:\d+)|a|and|eight|five|four|half|nine|normal|one|point|quarter|quarters|regular|seven|six|three|two|zero)(?: (?:(?:\d+)|a|and|eight|five|four|half|nine|normal|one|point|quarter|quarters|regular|seven|six|three|two|zero))*$/.test(
    value
  );
}

function playbackRateIntent(rate: VoicePlaybackRate): VoiceIntent {
  return {
    action: "set-playback-rate",
    kind: "semantic-control",
    offsetSeconds: null,
    playbackRate: rate,
    positionSeconds: null
  };
}

function playbackRateShortcut(phrase: string): VoiceIntent | null {
  if (RELATIVE_PLAYBACK_RATE_PHRASES.has(phrase)) return { kind: "unknown" };
  if (
    /^(?:play|watch) (?!it(?: |$)|this(?: |$)).+ at .+(?: speed| x)$/.test(phrase)
  ) {
    return { kind: "unknown" };
  }
  if (
    /(?:^| )(?:disney|disney plus|netflix|spotify|youtube)(?: |$)/.test(phrase) &&
    /(?:\d|half|normal|point|quarter|regular)(?: [\w]+)* (?:speed|x)(?: |$)/.test(phrase)
  ) {
    return { kind: "unknown" };
  }

  const explicit = /^(?:change|set) (?:the )?(?:playback )?speed (?:at|to) (.+)$/.exec(phrase) ??
    /^set (?:it|this) to (.+) speed$/.exec(phrase);
  if (explicit !== null) {
    const rate = playbackRateToken(explicit[1] ?? "");
    return rate === null ? { kind: "unknown" } : playbackRateIntent(rate);
  }

  const current = /^(?:play|watch)(?: (?:it|this))? at (.+)$/.exec(phrase);
  if (current !== null) {
    const value = current[1] ?? "";
    if (!/(?: speed| x)$/.test(value)) return null;
    const rate = playbackRateToken(value.replace(/ speed$/, ""));
    return rate === null ? { kind: "unknown" } : playbackRateIntent(rate);
  }

  const backToNormal = /^back to (normal|regular) speed$/.exec(phrase);
  if (backToNormal !== null) return playbackRateIntent(1);

  const directSpeed = /^(.+) speed$/.exec(phrase);
  if (directSpeed !== null) {
    const value = directSpeed[1] ?? "";
    const rate = playbackRateToken(value);
    if (rate !== null) return playbackRateIntent(rate);
    return looksLikePlaybackRate(value) ? { kind: "unknown" } : null;
  }

  const directMultiplier = /^(.+) x$/.exec(phrase);
  if (directMultiplier !== null) {
    const value = directMultiplier[1] ?? "";
    const rate = playbackRateToken(value);
    if (rate !== null) return playbackRateIntent(rate);
    return looksLikePlaybackRate(value) ? { kind: "unknown" } : null;
  }
  return null;
}

const SMALL_NUMBER_WORDS: Readonly<Record<string, number>> = {
  a: 1,
  an: 1,
  eight: 8,
  eighteen: 18,
  eleven: 11,
  fifteen: 15,
  five: 5,
  four: 4,
  fourteen: 14,
  nine: 9,
  nineteen: 19,
  one: 1,
  seven: 7,
  seventeen: 17,
  six: 6,
  sixteen: 16,
  ten: 10,
  thirteen: 13,
  three: 3,
  twelve: 12,
  twenty: 20,
  two: 2,
  zero: 0
};

const TENS_NUMBER_WORDS: Readonly<Record<string, number>> = {
  eighty: 80,
  fifty: 50,
  forty: 40,
  ninety: 90,
  seventy: 70,
  sixty: 60,
  thirty: 30
};

function englishInteger(value: string): number | null {
  if (/^\d+$/.test(value)) {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) ? numeric : null;
  }

  const tokens = value.split(" ").filter((token) => token !== "and");
  if (tokens.length === 0) return null;
  let current = 0;
  let total = 0;
  let sawNumber = false;
  for (const token of tokens) {
    const small = SMALL_NUMBER_WORDS[token];
    if (small !== undefined) {
      current += small;
      sawNumber = true;
      continue;
    }
    const tens = TENS_NUMBER_WORDS[token];
    if (tens !== undefined) {
      current += tens;
      sawNumber = true;
      continue;
    }
    if (token === "hundred" && current > 0 && current < 10) {
      current *= 100;
      sawNumber = true;
      continue;
    }
    if (token === "thousand" && current > 0) {
      total += current * 1_000;
      current = 0;
      sawNumber = true;
      continue;
    }
    return null;
  }
  return sawNumber ? total + current : null;
}

function boundedVolumePercent(value: string): number | null {
  const amount = value.replace(/ (?:per cent|percent)$/, "").trim();
  if (/^\d{1,3}$/.test(amount)) {
    const numeric = Number(amount);
    return numeric >= 0 && numeric <= 100 ? numeric : null;
  }

  const oneToNineteen = "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)";
  const oneToNine = "(?:one|two|three|four|five|six|seven|eight|nine)";
  const tens = "(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)";
  const naturalPercent = new RegExp(
    `^(?:${oneToNineteen}|${tens}(?: ${oneToNine})?|(?:a|one) hundred)$`
  );
  if (!naturalPercent.test(amount)) return null;
  const numeric = englishInteger(amount);
  return numeric !== null && numeric >= 0 && numeric <= 100 ? numeric : null;
}

function absoluteVolumeShortcut(phrase: string): VoiceIntent | null {
  const explicit = /^(?:set|turn|put) (?:the )?(?:tv )?volume(?: (?:up|down))? (?:to|at) (.+)$/.exec(
    phrase
  );
  const direct = /^volume (?:to|at) (.+)$/.exec(phrase);
  const amount = explicit?.[1] ?? direct?.[1];
  if (amount === undefined) return null;
  const volumePercent = boundedVolumePercent(amount);
  return volumePercent === null
    ? { kind: "unknown" }
    : {
      action: "set-volume",
      kind: "control",
      volumePercent
    };
}

function durationSeconds(value: string): number | null {
  const tokens = value.trim().split(" ");
  const factors: Readonly<Record<string, number>> = {
    hour: 3_600,
    hours: 3_600,
    minute: 60,
    minutes: 60,
    second: 1,
    seconds: 1
  };
  let segmentStart = 0;
  let previousFactor = Number.POSITIVE_INFINITY;
  let total = 0;
  let sawUnit = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const factor = factors[tokens[index] ?? ""];
    if (factor === undefined) continue;
    const amount = englishInteger(tokens.slice(segmentStart, index).join(" "));
    if (amount === null || amount < 0 || factor >= previousFactor) return null;
    total += amount * factor;
    previousFactor = factor;
    segmentStart = index + 1;
    sawUnit = true;
  }
  return sawUnit && segmentStart === tokens.length ? total : null;
}

function absolutePositionSeconds(value: string): number | null {
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (clock !== null) {
    const first = Number(clock[1]);
    const second = Number(clock[2]);
    const third = clock[3] === undefined ? null : Number(clock[3]);
    if (second >= 60 || (third !== null && third >= 60)) return null;
    const total = third === null
      ? first * 60 + second
      : first * 3_600 + second * 60 + third;
    return total <= 86_400 ? total : null;
  }
  const total = durationSeconds(value.replace(/ (?:in|mark)$/, ""));
  return total !== null && total <= 86_400 ? total : null;
}

function semanticControlShortcut(phrase: string): VoiceIntent | null {
  const playbackRate = playbackRateShortcut(phrase);
  if (playbackRate !== null) return playbackRate;

  const simpleAction = SIMPLE_SEMANTIC_CONTROL_PHRASES[phrase];
  if (simpleAction !== undefined) {
    return {
      action: simpleAction,
      kind: "semantic-control",
      offsetSeconds: null,
      playbackRate: null,
      positionSeconds: null
    };
  }

  const forward = /^(?:fast forward|go forward|jump ahead|move forward|skip ahead|skip forward) (?:by )?(.+)$/.exec(
    phrase
  );
  const backward = /^(?:go back|jump back|move back|rewind|skip back) (?:by )?(.+)$/.exec(
    phrase
  );
  const relative = forward ?? backward;
  if (relative !== null) {
    const seconds = durationSeconds(relative[1] ?? "");
    if (seconds !== null && seconds > 0 && seconds <= 3_600) {
      return {
        action: "seek-relative",
        kind: "semantic-control",
        offsetSeconds: forward === null ? -seconds : seconds,
        playbackRate: null,
        positionSeconds: null
      };
    }
  }

  const absolute = /^(?:go|jump|seek|skip) to (?:the )?(?:(?:position|time|timestamp) )?(.+)$/.exec(
    phrase
  );
  if (absolute !== null) {
    const positionSeconds = absolutePositionSeconds(absolute[1] ?? "");
    if (positionSeconds !== null) {
      return {
        action: "seek-absolute",
        kind: "semantic-control",
        offsetSeconds: null,
        playbackRate: null,
        positionSeconds
      };
    }
  }
  return null;
}

function normalizedPhrase(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/(^|[\s:(])[-\u2212]\s*(?=\d)/g, "$1minus ")
    .replace(/(\d)\.(?=\d)/g, "$1 point ")
    .replace(/(\d)x\b/g, "$1 x")
    .replace(/[^a-z0-9+:]+/g, " ")
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
  const absoluteVolume = absoluteVolumeShortcut(phrase);
  if (absoluteVolume !== null) return absoluteVolume;
  const providerDestination = providerDestinationShortcut(phrase);
  if (providerDestination !== null) return providerDestination;
  const currentMediaAction = CURRENT_MEDIA_PHRASES[phrase];
  if (currentMediaAction !== undefined) {
    return { action: currentMediaAction, kind: "current-media" };
  }
  const control = CONTROL_PHRASES[phrase];
  if (control !== undefined) return { action: control, kind: "control" };
  const semanticControl = semanticControlShortcut(phrase);
  if (semanticControl !== null) return semanticControl;
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
