import {
  parseVoiceIntent,
  type VoiceIntent,
  type VoiceMediaIntent,
  VOICE_INTENT_JSON_SCHEMA
} from "./voice-intent";
import { voiceTranscriptShortcut } from "./voice-transcript-shortcuts";

const TRANSCRIPTION_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
const RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const MAX_TRANSCRIPT_LENGTH = 500;
const MAX_RECOMMENDATION_TITLE_LENGTH = 120;
const MAX_RECOMMENDATION_REASON_LENGTH = 160;

const VOICE_RECOMMENDATION_SCHEMA = {
  additionalProperties: false,
  properties: {
    recommendations: {
      items: {
        additionalProperties: false,
        properties: {
          mediaType: { enum: ["movie", "show"], type: "string" },
          reason: { maxLength: MAX_RECOMMENDATION_REASON_LENGTH, minLength: 1, type: "string" },
          title: { maxLength: MAX_RECOMMENDATION_TITLE_LENGTH, minLength: 1, type: "string" },
          year: {
            anyOf: [
              { maximum: 3000, minimum: 1800, type: "integer" },
              { type: "null" }
            ]
          }
        },
        required: ["mediaType", "reason", "title", "year"],
        type: "object"
      },
      maxItems: 3,
      minItems: 3,
      type: "array"
    }
  },
  required: ["recommendations"],
  type: "object"
} as const;

const VOICE_RECOMMENDATION_INSTRUCTIONS = `Suggest exactly three established movies or television shows for a television viewer.
Honor every genre, mood, era, actor, theme, and similarity constraint in the request.
For a similarity request, do not return the seed title itself.
Give one short, concrete reason for each suggestion. Do not mention provider availability, URLs, rankings, or unsupported facts.
Return only the supplied JSON schema.`;

export const MAX_VOICE_AUDIO_BYTES = 8 * 1024 * 1024;
export const MAX_VOICE_AUDIO_DURATION_MS = 20_000;
export const MIN_VOICE_AUDIO_DURATION_MS = 150;

const AUDIO_TYPES: ReadonlyMap<string, string> = new Map([
  ["audio/mp4", "m4a"],
  ["audio/mpeg", "mp3"],
  ["audio/ogg", "ogg"],
  ["audio/wav", "wav"],
  ["audio/webm", "webm"],
  ["audio/x-m4a", "m4a"]
] as const);

const VOICE_INTENT_INSTRUCTIONS = `You extract one command for a television interface.
Return only the supplied JSON schema. Never output a URL, selector, service ID, code, or explanation.
Use kind=control for direct television controls. Use controlAction=set-volume with volumePercent set to an explicit whole-number percent from 0 through 100 only when the user requests an absolute system volume. Use volumePercent=null for every other action. Never guess, round, clamp, or infer a missing volume percent; relative requests such as louder, quieter, volume up, or volume down remain their matching relative control actions.
Use kind=semantic-control for provider-aware playback operations: seek-relative, seek-absolute, set-playback-rate, restart, next, previous, skip-intro, skip-recap, skip-ad, captions-on, captions-off, fullscreen-enter, fullscreen-exit, shuffle-on, shuffle-off, repeat-off, repeat-all, or repeat-one. Convert an explicit time amount to whole seconds; never guess one. A relative seek requires only offsetSeconds, which must be nonzero from -3600 through 3600. Use a negative offset for rewind/back and a positive offset for forward/ahead. An absolute seek requires only positionSeconds from 0 through 86400. For set-playback-rate, set playbackRate to exactly 0.5, 0.75, 1, 1.25, or 1.5; use 1 for normal speed. A playback-rate request must explicitly target the media already loaded on the TV, such as "play this at one-and-a-half speed" or "normal speed". Never round or clamp another rate, infer a rate from faster or slower, combine a named title launch with a rate, or apply a provider-named rate request; use kind=unknown for those requests. Use shuffle and repeat actions only for an explicit requested state of the music currently loaded on Spotify. Never emit a toggle, provider hint, selector, title, URL, service ID, or other model-supplied target for shuffle or repeat. A bare ambiguous "repeat", a request to shuffle a named playlist or library, and any request to add something to a queue use kind=unknown. Every other semantic action requires playbackRate=null, and every simple semantic action requires both timing fields null. Use null for every unrelated field.
Use semantic next or previous only for an explicitly named episode or video. A bare fast-forward or rewind with no amount remains the matching control action. A next/previous song or track remains a track control. Use skip-ad only when the user explicitly asks to skip an ad, and do not confuse Back, a title, or words inside a longer media request with semantic playback controls.
Use kind=confirmation only for a bare answer to an already-pending confirmation question. Use confirmationAction=confirm for "yes", "yeah", "yep", "confirm", or "go ahead"; use confirmationAction=cancel for "no", "nope", "cancel", or "never mind". Use null for every other field. Never reinterpret a media title, playback control, or longer request containing one of those words as a confirmation.
Use kind=current-media only for a read-only question about media already loaded on the TV. Use currentMediaAction=identity for "what am I watching" or a general question about what is playing; episode for the current episode; song for the current song; position for the elapsed playback position or current timestamp; duration for the media's total runtime; time-remaining for how much playback time remains; and end-time for the local clock time when playback will end. Keep position and duration distinct from time-remaining and end-time. Use null for every other field. Never turn a current-media question into a search, playback, or navigation action.
Use kind=app only when the user explicitly names an application or streaming service to open, launch, or switch to. Put the spoken app name in title and use null for every other field. App intents never name a URL or service ID.
Use kind=provider-destination only when the user asks to open the fixed library or subscriptions page, not to search for or play media with those words in its title. Set providerDestination=library or subscriptions. Set providerHint only when the user explicitly names Disney Plus, Netflix, Spotify, or YouTube; otherwise leave it null. Use null for every other field. Never output, infer, or encode a URL, service ID, selector, route, or search query for a provider destination. NHD-TV decides whether that fixed destination is supported and enabled.
Use kind=media for searches, navigation, and playback.
Use kind=media-reference only for an explicit follow-up reference whose target must come from the TV's existing context. Use mediaAction=play, open, lookup, or search and use null for title, mediaType, creator, season, episode, and recency. Never invent the referenced title, creator, candidate, or provider.
Use reference=last-media for "it", "that", or another explicit reference to the last requested media. Use reference=current-media only for "this" or an explicit reference to media currently loaded on the TV. Use reference=candidate for a numbered choice such as "the second one", with ordinal set to its one-based number from 1 through 10. Only candidate references may use ordinal.
For a supported provider correction such as "Netflix instead", use reference=last-media, mediaAction=play, and the corresponding providerHint. A provider hint never supplies a missing reference by itself.
Use kind=unknown with every other field null when the request has no explicit media target or reference, is unrelated to the TV, or is not confidently actionable. Never guess a missing title, creator, or reference.
Use mediaType=episode only when both season and episode are explicit.
Use mediaType=recommendation and mediaAction=open for an open-ended movie or show request based on genre, mood, era, actors, themes, or a natural-language description. Put a short provider-search phrase that preserves those constraints in title.
Use mediaType=similar-title and mediaAction=open when the user asks for movies or shows similar to a named title. Put only the named seed title in title.
Recommendation and similar-title intents never use play, creator, season, episode, or recency, and may only use providerHint=netflix when Netflix is explicitly named.
Preserve a spoken release year, edition, language, country, or remake qualifier in the title so the provider can distinguish versions.
Use mediaType=video only for an online video, YouTube request, named YouTuber, or named channel; an ordinary film or show title is not a video intent.
Use mediaType=channel when the user asks to go to, open, or find a YouTuber, creator profile, or YouTube channel.
Use providerHint when the user names Disney Plus, Netflix, Spotify, or YouTube, and use disney-plus for Disney Plus. For play, open, or lookup, providerHint may also reflect a media type that uniquely implies Spotify or YouTube. For search, leave providerHint null unless the user explicitly names the provider so NHD-TV can prefer the active app.
If a media request explicitly names any other provider or app, use kind=unknown; never discard that provider or substitute a supported one. A request only to open that app may still use kind=app.
Use mediaAction=search when the user asks to search or show search results without opening or playing a particular result. Use lookup only for availability questions such as "where can I watch" or "what service has" a title.
Use controlAction=stop to stop or pause current playback without closing the app. Use controlAction=close-app only for an explicit request to close or exit the current app.
Directional requests such as "move left", "go down", and "select this" use the matching left, down, or select control action.
Use next-track or previous-track only when the user explicitly asks for the next, previous, or current song or track. Never use track controls for a video, episode, intro, or ad.
A bare exact movie, show, or title name such as "Apollo 13" is a play request: use mediaAction=play. Do not reinterpret a bare named title as open or lookup.
For a creator's latest YouTube video, use mediaType=video, recency=latest, creator=<channel name>, and title=latest video.
For an unspecified video from a named creator, use mediaType=video, creator=<channel name>, and title=video.
For an artist-only playback request, such as "play Kanye West on Spotify" or "play a song from Kanye West", use mediaType=artist, mediaAction=play, title=<artist name>, creator=<artist name>, and providerHint=spotify so Spotify can open the exact artist profile and start that artist's own playback. Do not invent a song title.
Examples: "I want an action movie" is an open recommendation; "movies similar to Inception" is an open similar-title request with title=Inception; "open my library" is a provider-destination with providerHint=null; "go to YouTube subscriptions" is a YouTube provider-destination; "play it" is a last-media play reference; "play this" is a current-media play reference; "the third one" is a candidate play reference with ordinal=3.
Use null for every field that does not apply. Do not guess missing season or episode numbers.`;

export type OpenAiVoiceErrorCode =
  | "audio-invalid"
  | "cancelled"
  | "invalid-response"
  | "network"
  | "rejected"
  | "timeout";

export class OpenAiVoiceError extends Error {
  readonly code: OpenAiVoiceErrorCode;

  constructor(code: OpenAiVoiceErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "OpenAiVoiceError";
  }
}

export interface VoiceAudioClip {
  bytes: Uint8Array;
  durationMs: number;
  mimeType: string;
}

export interface VoiceRecommendation {
  mediaType: "movie" | "show";
  reason: string;
  title: string;
  year: number | null;
}

export interface OpenAiVoiceClientOptions {
  fetch?: typeof fetch;
  getApiKey: () => string;
  intentRequestTimeoutMs?: number;
  intentModel?: string;
  requestTimeoutMs?: number;
  transcriptionRequestTimeoutMs?: number;
  transcriptionModel?: string;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizedMimeType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function validateAudioClip(clip: VoiceAudioClip): { extension: string; mimeType: string } {
  const mimeType = normalizedMimeType(clip.mimeType);
  const extension = AUDIO_TYPES.get(mimeType);
  if (
    extension === undefined ||
    clip.bytes.byteLength === 0 ||
    clip.bytes.byteLength > MAX_VOICE_AUDIO_BYTES ||
    !Number.isFinite(clip.durationMs) ||
    clip.durationMs < MIN_VOICE_AUDIO_DURATION_MS ||
    clip.durationMs > MAX_VOICE_AUDIO_DURATION_MS
  ) {
    throw new OpenAiVoiceError("audio-invalid", "The voice recording is empty or unsupported.");
  }
  return { extension, mimeType };
}

function responseOutputText(value: unknown): string | null {
  const response = objectValue(value);
  if (typeof response?.output_text === "string") {
    return response.output_text;
  }
  if (!Array.isArray(response?.output)) {
    return null;
  }

  for (const itemValue of response.output) {
    const item = objectValue(itemValue);
    if (!Array.isArray(item?.content)) {
      continue;
    }
    for (const contentValue of item.content) {
      const content = objectValue(contentValue);
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

function boundedRecommendationText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string" || /(?:https?:\/\/|www\.)/iu.test(value)) return null;
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length > 0 && normalized.length <= maximumLength ? normalized : null;
}

function rejectedMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "The OpenAI API key was rejected.";
  }
  if (status === 413) {
    return "The voice recording is too large.";
  }
  if (status === 429) {
    return "OpenAI is rate limiting voice requests. Try again shortly.";
  }
  return "OpenAI could not process the voice request.";
}

export class OpenAiVoiceClient {
  readonly #fetch: typeof fetch;
  readonly #getApiKey: () => string;
  readonly #intentModel: string;
  readonly #intentRequestTimeoutMs: number;
  readonly #transcriptionRequestTimeoutMs: number;
  readonly #transcriptionModel: string;

  constructor(options: OpenAiVoiceClientOptions) {
    this.#fetch = options.fetch ?? fetch;
    this.#getApiKey = options.getApiKey;
    this.#intentModel = options.intentModel ?? "gpt-5.6-luna";
    this.#intentRequestTimeoutMs = options.intentRequestTimeoutMs ??
      options.requestTimeoutMs ?? 8_000;
    this.#transcriptionRequestTimeoutMs = options.transcriptionRequestTimeoutMs ??
      options.requestTimeoutMs ?? 12_000;
    this.#transcriptionModel = options.transcriptionModel ?? "gpt-transcribe";
  }

  async transcribe(clip: VoiceAudioClip, signal?: AbortSignal): Promise<string> {
    const { extension, mimeType } = validateAudioClip(clip);
    const form = new FormData();
    const bytes = new Uint8Array(clip.bytes);
    form.append("file", new Blob([bytes], { type: mimeType }), `voice-command.${extension}`);
    form.append("language", "en");
    form.append("model", this.#transcriptionModel);
    form.append("response_format", "json");

    const response = await this.#request(TRANSCRIPTION_ENDPOINT, {
      body: form,
      method: "POST"
    }, signal, this.#transcriptionRequestTimeoutMs, "Transcription took too long. Try again.");
    const result = objectValue(await this.#json(response));
    const transcript = typeof result?.text === "string"
      ? result.text.replace(/\s+/g, " ").trim()
      : "";
    if (transcript.length === 0 || transcript.length > MAX_TRANSCRIPT_LENGTH) {
      throw new OpenAiVoiceError("invalid-response", "OpenAI returned an invalid transcript.");
    }
    return transcript;
  }

  async interpret(transcriptValue: string, signal?: AbortSignal): Promise<VoiceIntent> {
    const transcript = transcriptValue.replace(/\s+/g, " ").trim();
    if (transcript.length === 0 || transcript.length > MAX_TRANSCRIPT_LENGTH) {
      throw new OpenAiVoiceError("invalid-response", "The voice transcript is invalid.");
    }
    const shortcut = voiceTranscriptShortcut(transcript);
    if (shortcut !== null) return shortcut;

    const response = await this.#request(RESPONSES_ENDPOINT, {
      body: JSON.stringify({
        input: transcript,
        instructions: VOICE_INTENT_INSTRUCTIONS,
        max_output_tokens: 300,
        model: this.#intentModel,
        reasoning: { effort: "none" },
        store: false,
        text: {
          format: {
            name: "nhd_tv_voice_intent",
            schema: VOICE_INTENT_JSON_SCHEMA,
            strict: true,
            type: "json_schema"
          }
        }
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    }, signal, this.#intentRequestTimeoutMs, "Understanding took too long. Try again.");
    const outputText = responseOutputText(await this.#json(response));
    if (outputText === null) {
      throw new OpenAiVoiceError("invalid-response", "OpenAI returned no voice intent.");
    }

    try {
      return parseVoiceIntent(JSON.parse(outputText));
    } catch {
      throw new OpenAiVoiceError("invalid-response", "OpenAI returned an invalid voice intent.");
    }
  }

  async understand(
    clip: VoiceAudioClip,
    signal?: AbortSignal,
    onTranscript?: (transcript: string) => void
  ): Promise<{ intent: VoiceIntent; transcript: string }> {
    const transcript = await this.transcribe(clip, signal);
    onTranscript?.(transcript);
    return { intent: await this.interpret(transcript, signal), transcript };
  }

  async recommend(
    intent: Pick<VoiceMediaIntent, "mediaType" | "title">,
    signal?: AbortSignal
  ): Promise<readonly VoiceRecommendation[]> {
    if (intent.mediaType !== "recommendation" && intent.mediaType !== "similar-title") {
      throw new OpenAiVoiceError("invalid-response", "That request is not a recommendation.");
    }
    const input = intent.mediaType === "similar-title"
      ? `Recommend titles similar to: ${intent.title}`
      : `Recommend titles matching: ${intent.title}`;
    const response = await this.#request(RESPONSES_ENDPOINT, {
      body: JSON.stringify({
        input,
        instructions: VOICE_RECOMMENDATION_INSTRUCTIONS,
        max_output_tokens: 700,
        model: this.#intentModel,
        reasoning: { effort: "none" },
        store: false,
        text: {
          format: {
            name: "nhd_tv_voice_recommendations",
            schema: VOICE_RECOMMENDATION_SCHEMA,
            strict: true,
            type: "json_schema"
          }
        }
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    }, signal, this.#intentRequestTimeoutMs, "Recommendations took too long. Try again.");
    const outputText = responseOutputText(await this.#json(response));
    if (outputText === null) {
      throw new OpenAiVoiceError("invalid-response", "OpenAI returned no recommendations.");
    }

    try {
      const parsed = objectValue(JSON.parse(outputText));
      if (parsed === null || !Array.isArray(parsed.recommendations)) throw new Error();
      const recommendations: VoiceRecommendation[] = [];
      const titles = new Set<string>();
      for (const value of parsed.recommendations.slice(0, 3)) {
        const candidate = objectValue(value);
        const title = boundedRecommendationText(
          candidate?.title,
          MAX_RECOMMENDATION_TITLE_LENGTH
        );
        const reason = boundedRecommendationText(
          candidate?.reason,
          MAX_RECOMMENDATION_REASON_LENGTH
        );
        const mediaType = candidate?.mediaType;
        const year = candidate?.year;
        const titleKey = title?.toLocaleLowerCase();
        if (
          title === null ||
          reason === null ||
          (mediaType !== "movie" && mediaType !== "show") ||
          (year !== null &&
            (typeof year !== "number" || !Number.isInteger(year) || year < 1800 || year > 3000)) ||
          titleKey === undefined ||
          titles.has(titleKey)
        ) {
          throw new Error();
        }
        titles.add(titleKey);
        recommendations.push({ mediaType, reason, title, year: year as number | null });
      }
      if (recommendations.length !== 3) throw new Error();
      return recommendations;
    } catch {
      throw new OpenAiVoiceError("invalid-response", "OpenAI returned invalid recommendations.");
    }
  }

  async #json(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new OpenAiVoiceError("invalid-response", "OpenAI returned an unreadable response.");
    }
  }

  async #request(
    url: string,
    init: RequestInit,
    signal: AbortSignal | undefined,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<Response> {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const requestSignal = signal === undefined
      ? timeoutSignal
      : AbortSignal.any([signal, timeoutSignal]);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.#getApiKey()}`);

    let response: Response;
    try {
      response = await this.#fetch(url, { ...init, headers, signal: requestSignal });
    } catch {
      if (signal?.aborted === true) {
        throw new OpenAiVoiceError("cancelled", "The voice request was cancelled.");
      }
      if (timeoutSignal.aborted) {
        throw new OpenAiVoiceError("timeout", timeoutMessage);
      }
      throw new OpenAiVoiceError("network", "OpenAI could not be reached.");
    }

    if (!response.ok) {
      throw new OpenAiVoiceError("rejected", rejectedMessage(response.status));
    }
    return response;
  }
}
