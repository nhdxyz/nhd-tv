import { describe, expect, it, vi } from "vitest";
import {
  MAX_VOICE_AUDIO_BYTES,
  OpenAiVoiceClient,
  OpenAiVoiceError,
  type VoiceAudioClip
} from "../src/main/voice/openai-voice-client";

const API_KEY = "sk-test-abcdefghijklmnopqrstuvwxyz";

function audioClip(overrides: Partial<VoiceAudioClip> = {}): VoiceAudioClip {
  return {
    bytes: new Uint8Array([1, 2, 3, 4]),
    durationMs: 1_000,
    mimeType: "audio/webm;codecs=opus",
    ...overrides
  };
}

function outputIntent(overrides: Record<string, unknown> = {}) {
  return {
    kind: "media",
    controlAction: null,
    mediaAction: "play",
    mediaType: "title",
    title: "Apollo 13",
    creator: null,
    season: null,
    episode: null,
    providerHint: null,
    recency: null,
    ...overrides
  };
}

function client(fetchMock: typeof fetch): OpenAiVoiceClient {
  return new OpenAiVoiceClient({ fetch: fetchMock, getApiKey: () => API_KEY });
}

describe("OpenAI voice client", () => {
  it("uploads a bounded audio file for English transcription", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${API_KEY}`);
      expect(init?.body).toBeInstanceOf(FormData);
      const form = init?.body as FormData;
      expect(form.get("language")).toBe("en");
      expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
      const file = form.get("file") as File;
      expect(file.name).toBe("voice-command.webm");
      expect(file.type).toBe("audio/webm");
      return Response.json({ text: "  Play   Apollo 13  " });
    });

    await expect(client(fetchMock).transcribe(audioClip())).resolves.toBe("Play Apollo 13");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/transcriptions",
      expect.any(Object)
    );
  });

  it("uses non-stored Structured Outputs and validates the result", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        input: "Play Apollo 13",
        model: "gpt-5.6-luna",
        store: false,
        text: { format: { strict: true, type: "json_schema" } }
      });
      expect(body.text.format.schema.additionalProperties).toBe(false);
      expect(body.instructions).toContain("mediaType=recommendation");
      expect(body.instructions).toContain("mediaType=similar-title");
      expect(body.instructions).toContain('"play it" is unknown');
      return Response.json({ output_text: JSON.stringify(outputIntent()) });
    });

    await expect(client(fetchMock).interpret("Play Apollo 13")).resolves.toMatchObject({
      kind: "media",
      title: "Apollo 13"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.any(Object)
    );
  });

  it("accepts nested output text from the Responses API", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({
      output: [{
        content: [{ type: "output_text", text: JSON.stringify(outputIntent({
          mediaType: "episode",
          title: "Breaking Bad",
          season: 1,
          episode: 3,
          providerHint: "netflix"
        })) }]
      }]
    }));
    await expect(client(fetchMock).interpret("Breaking Bad season 1 episode 3")).resolves
      .toMatchObject({ episode: 3, season: 1 });
  });

  it("rejects oversized, short, and unsupported recordings before a request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const voiceClient = client(fetchMock);
    await expect(voiceClient.transcribe(audioClip({
      bytes: new Uint8Array(MAX_VOICE_AUDIO_BYTES + 1)
    }))).rejects.toMatchObject({ code: "audio-invalid" });
    await expect(voiceClient.transcribe(audioClip({ durationMs: 100 }))).rejects
      .toMatchObject({ code: "audio-invalid" });
    await expect(voiceClient.transcribe(audioClip({ mimeType: "text/plain" }))).rejects
      .toMatchObject({ code: "audio-invalid" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed model output after JSON parsing", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({
      output_text: JSON.stringify(outputIntent({ url: "https://evil.example" }))
    }));
    await expect(client(fetchMock).interpret("play something")).rejects.toMatchObject({
      code: "invalid-response"
    });
  });

  it("maps HTTP failures to sanitized messages without reading the response body", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      `server echoed ${API_KEY}`,
      { status: 401 }
    ));
    const request = client(fetchMock).interpret("Play Apollo 13");
    await expect(request).rejects.toEqual(expect.objectContaining({
      code: "rejected",
      message: "The OpenAI API key was rejected."
    }));
    await expect(request).rejects.not.toThrow(API_KEY);
  });

  it("distinguishes user cancellation from other network failures", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>(async () => {
      controller.abort();
      throw new Error("aborted");
    });
    await expect(client(fetchMock).interpret("pause", controller.signal)).rejects.toEqual(
      expect.objectContaining<Partial<OpenAiVoiceError>>({ code: "cancelled" })
    );
  });
});
