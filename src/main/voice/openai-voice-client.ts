import {
  parseVoiceIntent,
  type VoiceIntent,
  VOICE_INTENT_JSON_SCHEMA
} from "./voice-intent";

const TRANSCRIPTION_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
const RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const MAX_TRANSCRIPT_LENGTH = 500;

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
Use kind=control for direct television controls.
Use kind=media for searches, navigation, and playback.
Use kind=unknown with every other field null when the request is incomplete, only refers to "it" or "that" without naming media, is unrelated to the TV, or is not confidently actionable. Never guess a missing title or creator.
Use mediaType=episode only when both season and episode are explicit.
Use mediaType=recommendation and mediaAction=open for an open-ended movie or show request based on genre, mood, era, actors, themes, or a natural-language description. Put a short provider-search phrase that preserves those constraints in title.
Use mediaType=similar-title and mediaAction=open when the user asks for movies or shows similar to a named title. Put only the named seed title in title.
Recommendation and similar-title intents never use play, creator, season, episode, or recency, and may only use providerHint=netflix when Netflix is explicitly named.
Preserve a spoken release year, edition, language, country, or remake qualifier in the title so the provider can distinguish versions.
Use mediaType=video only for an online video, YouTube request, named YouTuber, or named channel; an ordinary film or show title is not a video intent.
Use mediaType=channel when the user asks to go to, open, or find a YouTuber, creator profile, or YouTube channel.
Use providerHint only when the user names Disney Plus, Netflix, Spotify, or YouTube, or when the media type uniquely implies Spotify or YouTube. Use disney-plus for Disney Plus.
For a creator's latest YouTube video, use mediaType=video, recency=latest, creator=<channel name>, and title=latest video.
For an unspecified video from a named creator, use mediaType=video, creator=<channel name>, and title=video.
Examples: "I want an action movie" is an open recommendation; "movies similar to Inception" is an open similar-title request with title=Inception; "play it" is unknown.
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

export interface OpenAiVoiceClientOptions {
  fetch?: typeof fetch;
  getApiKey: () => string;
  intentModel?: string;
  requestTimeoutMs?: number;
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
  readonly #requestTimeoutMs: number;
  readonly #transcriptionModel: string;

  constructor(options: OpenAiVoiceClientOptions) {
    this.#fetch = options.fetch ?? fetch;
    this.#getApiKey = options.getApiKey;
    this.#intentModel = options.intentModel ?? "gpt-5.6-luna";
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.#transcriptionModel = options.transcriptionModel ?? "gpt-4o-mini-transcribe";
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
    }, signal);
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

    const response = await this.#request(RESPONSES_ENDPOINT, {
      body: JSON.stringify({
        input: transcript,
        instructions: VOICE_INTENT_INSTRUCTIONS,
        max_output_tokens: 400,
        model: this.#intentModel,
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
    }, signal);
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
    signal?: AbortSignal
  ): Promise<{ intent: VoiceIntent; transcript: string }> {
    const transcript = await this.transcribe(clip, signal);
    return { intent: await this.interpret(transcript, signal), transcript };
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
    signal?: AbortSignal
  ): Promise<Response> {
    const timeoutSignal = AbortSignal.timeout(this.#requestTimeoutMs);
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
        throw new OpenAiVoiceError("timeout", "The voice request timed out.");
      }
      throw new OpenAiVoiceError("network", "OpenAI could not be reached.");
    }

    if (!response.ok) {
      throw new OpenAiVoiceError("rejected", rejectedMessage(response.status));
    }
    return response;
  }
}
