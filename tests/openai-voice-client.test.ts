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
    confirmationAction: null,
    currentMediaAction: null,
    controlAction: null,
    semanticControlAction: null,
    offsetSeconds: null,
    positionSeconds: null,
    playbackRate: null,
    volumePercent: null,
    mediaAction: "play",
    reference: null,
    ordinal: null,
    mediaType: "title",
    title: "Apollo 13",
    creator: null,
    season: null,
    episode: null,
    providerHint: null,
    providerDestination: null,
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
      expect(form.get("model")).toBe("gpt-transcribe");
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
        max_output_tokens: 300,
        model: "gpt-5.6-luna",
        reasoning: { effort: "none" },
        store: false,
        text: { format: { strict: true, type: "json_schema" } }
      });
      expect(body.text.format.schema.additionalProperties).toBe(false);
      expect(body.instructions).toContain("mediaType=recommendation");
      expect(body.instructions).toContain("mediaType=similar-title");
      expect(body.instructions).toContain('"play it" is a last-media play reference');
      expect(body.instructions).toContain("reference=next-candidate");
      expect(body.instructions).toContain("Never invent the referenced title");
      expect(body.instructions).toContain("Only candidate references may use ordinal");
      expect(body.instructions).toContain("Use kind=confirmation only for a bare answer");
      expect(body.instructions).toContain(
        "Never reinterpret a media title, playback control, or longer request"
      );
      expect(body.instructions).toContain("Use kind=semantic-control");
      expect(body.instructions).toContain("set-playback-rate");
      expect(body.instructions).toContain("0.5, 0.75, 1, 1.25, or 1.5");
      expect(body.instructions).toContain("Never round or clamp another rate");
      expect(body.instructions).toContain("combine a named title launch with a rate");
      expect(body.instructions).toContain("provider-named rate request");
      expect(body.instructions).toContain("shuffle-on");
      expect(body.instructions).toContain("repeat-one");
      expect(body.instructions).toContain("explicit requested state");
      expect(body.instructions).toContain("Never emit a toggle, provider hint, selector");
      expect(body.instructions).toContain('A bare ambiguous "repeat"');
      expect(body.instructions).toContain("any request to add something to a queue");
      expect(body.instructions).toContain("controlAction=set-volume");
      expect(body.instructions).toContain("volumePercent set to an explicit whole-number percent");
      expect(body.instructions).toContain("Never guess, round, clamp, or infer");
      expect(body.instructions).toContain("A relative seek requires only offsetSeconds");
      expect(body.instructions).toContain("A bare fast-forward or rewind with no amount remains");
      expect(body.instructions).toContain('A bare exact movie, show, or title name such as "Apollo 13"');
      expect(body.instructions).toContain("Use kind=app");
      expect(body.instructions).toContain("Use kind=provider-destination");
      expect(body.instructions).toContain("Never output, infer, or encode a URL");
      expect(body.instructions).toContain("Use kind=current-media");
      expect(body.instructions).toContain("currentMediaAction=identity");
      expect(body.instructions).toContain("position for the elapsed playback position");
      expect(body.instructions).toContain("duration for the media's total runtime");
      expect(body.instructions).toContain("Keep position and duration distinct");
      expect(body.instructions).toContain("Use mediaAction=search");
      expect(body.instructions).toContain("Use controlAction=close-app");
      expect(body.instructions).toContain("Use next-track or previous-track only");
      expect(body.instructions).toContain(
        "For search, leave providerHint null unless the user explicitly names the provider"
      );
      expect(body.instructions).toContain(
        "never discard that provider or substitute a supported one"
      );
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

  it("routes closed common controls and app launches without a second AI request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const voiceClient = client(fetchMock);

    await expect(voiceClient.interpret("Pause the movie")).resolves.toEqual({
      action: "pause",
      kind: "control"
    });
    await expect(voiceClient.interpret("Open Netflix")).resolves.toEqual({
      kind: "app",
      title: "netflix"
    });
    await expect(voiceClient.interpret("Skip this song")).resolves.toEqual({
      action: "next-track",
      kind: "control"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["Open my library", "library", null],
    ["Go to Spotify library", "library", "spotify"],
    ["Show my subscriptions", "subscriptions", null],
    ["Take me to YouTube subscriptions", "subscriptions", "youtube"]
  ] as const)(
    "routes the fixed provider destination %s locally",
    async (phrase, destination, providerHint) => {
      const fetchMock = vi.fn<typeof fetch>();
      await expect(client(fetchMock).interpret(phrase)).resolves.toEqual({
        destination,
        kind: "provider-destination",
        providerHint
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("accepts a structured provider destination outside the local phrase set", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({
      output_text: JSON.stringify(outputIntent({
        kind: "provider-destination",
        mediaAction: null,
        mediaType: null,
        providerDestination: "library",
        providerHint: "youtube",
        title: null
      }))
    }));

    await expect(client(fetchMock).interpret("Could you display my YouTube library"))
      .resolves.toEqual({
        destination: "library",
        kind: "provider-destination",
        providerHint: "youtube"
      });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    ["Set volume to twenty percent", 20],
    ["Turn the TV volume down to 0%", 0],
    ["Volume at one hundred percent", 100]
  ] as const)("routes the bounded absolute volume %s locally", async (phrase, volumePercent) => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(client(fetchMock).interpret(phrase)).resolves.toEqual({
      action: "set-volume",
      kind: "control",
      volumePercent
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a structured absolute-volume intent outside the local phrase set", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({
      output_text: JSON.stringify(outputIntent({
        controlAction: "set-volume",
        kind: "control",
        mediaAction: null,
        mediaType: null,
        title: null,
        volumePercent: 35
      }))
    }));

    await expect(client(fetchMock).interpret("Please make the sound level 35 percent"))
      .resolves.toEqual({
        action: "set-volume",
        kind: "control",
        volumePercent: 35
      });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    ["Yes", "confirm"],
    ["yeah", "confirm"],
    ["go ahead", "confirm"],
    ["No", "cancel"],
    ["cancel", "cancel"],
    ["never mind", "cancel"]
  ] as const)("routes the bare confirmation answer %s locally", async (phrase, action) => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(client(fetchMock).interpret(phrase)).resolves.toEqual({
      action,
      kind: "confirmation"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["Rewind thirty seconds", "seek-relative", -30, null],
    ["Skip ahead two minutes", "seek-relative", 120, null],
    ["Go to 12:34", "seek-absolute", null, 754],
    ["Start over", "restart", null, null],
    ["Next episode", "next", null, null],
    ["Turn captions on", "captions-on", null, null],
    ["Exit fullscreen", "fullscreen-exit", null, null],
    ["Shuffle on", "shuffle-on", null, null],
    ["Turn shuffle off", "shuffle-off", null, null],
    ["Repeat everything", "repeat-all", null, null],
    ["Repeat this song", "repeat-one", null, null],
    ["Turn repeat off", "repeat-off", null, null]
  ] as const)(
    "routes the semantic playback request %s locally",
    async (phrase, action, offsetSeconds, positionSeconds) => {
      const fetchMock = vi.fn<typeof fetch>();
      await expect(client(fetchMock).interpret(phrase)).resolves.toEqual({
        action,
        kind: "semantic-control",
        offsetSeconds,
        playbackRate: null,
        positionSeconds
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["Half speed", 0.5],
    ["Play this at three-quarter speed", 0.75],
    ["Normal speed", 1],
    ["Set playback speed to 1.25x", 1.25],
    ["Play this at one-and-a-half speed", 1.5]
  ] as const)("routes the explicit playback-rate request %s locally", async (phrase, playbackRate) => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(client(fetchMock).interpret(phrase)).resolves.toEqual({
      action: "set-playback-rate",
      kind: "semantic-control",
      offsetSeconds: null,
      playbackRate,
      positionSeconds: null
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "Faster",
    "Set playback speed to 1.3x",
    "Play this at 1.5x on Netflix",
    "Play Breaking Bad at 1.5x"
  ])("fails the unsafe local playback-rate request %s closed", async (phrase) => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(client(fetchMock).interpret(phrase)).resolves.toEqual({ kind: "unknown" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["Play it", "play", "last-media", null, null],
    ["Open it", "open", "last-media", null, null],
    ["Where can I watch it?", "lookup", "last-media", null, null],
    ["Play this", "play", "current-media", null, null],
    ["The third one", "play", "candidate", 3, null],
    ["Netflix instead", "play", "last-media", null, "netflix"]
  ] as const)(
    "routes the shared-context reference %s locally",
    async (phrase, action, reference, ordinal, providerHint) => {
      const fetchMock = vi.fn<typeof fetch>();
      await expect(client(fetchMock).interpret(phrase)).resolves.toEqual({
        action,
        kind: "media-reference",
        ordinal,
        providerHint,
        reference
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["What am I watching?", "identity"],
    ["What episode is this?", "episode"],
    ["What song is this?", "song"],
    ["How far into this am I?", "position"],
    ["What timestamp are we at?", "position"],
    ["How long is this?", "duration"],
    ["What's the runtime?", "duration"],
    ["How much time is left?", "time-remaining"],
    ["What time will this end?", "end-time"]
  ] as const)("routes the current-media question %s locally", async (phrase, action) => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(client(fetchMock).interpret(phrase)).resolves.toEqual({
      action,
      kind: "current-media"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("defines a bare exact title as a playback request", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.input).toBe("Apollo 13");
      expect(body.instructions).toContain("mediaAction=play");
      expect(body.instructions).toContain("Do not reinterpret a bare named title as open or lookup");
      return Response.json({ output_text: JSON.stringify(outputIntent()) });
    });

    await expect(client(fetchMock).interpret("Apollo 13")).resolves.toMatchObject({
      action: "play",
      title: "Apollo 13"
    });
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

  it("reports the final transcript before intent interpretation can fail", async () => {
    const onTranscript = vi.fn();
    let request = 0;
    const fetchMock = vi.fn<typeof fetch>(async () => {
      request += 1;
      return request === 1
        ? Response.json({ text: "Play a song from Kanye West" })
        : new Response(null, { status: 500 });
    });

    await expect(client(fetchMock).understand(audioClip(), undefined, onTranscript))
      .rejects.toMatchObject({ code: "rejected" });
    expect(onTranscript).toHaveBeenCalledOnce();
    expect(onTranscript).toHaveBeenCalledWith("Play a song from Kanye West");
  });

  it("defines unspecified artist playback without inventing a song title", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.input).toBe("Play Kanye West on Spotify");
      expect(body.instructions).toContain('"play Kanye West on Spotify"');
      return Response.json({ output_text: JSON.stringify(outputIntent({
        creator: "Kanye West",
        mediaType: "artist",
        providerHint: "spotify",
        title: "Kanye West"
      })) });
    });

    await expect(client(fetchMock).interpret("Play Kanye West on Spotify")).resolves
      .toMatchObject({
        action: "play",
        creator: "Kanye West",
        mediaType: "artist",
        providerHint: "spotify",
        title: "Kanye West"
      });
  });

  it("returns three bounded recommendation choices with concise reasons", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        input: "Recommend titles matching: tense action movies with a clever lead",
        max_output_tokens: 700,
        model: "gpt-5.6-luna",
        store: false,
        text: { format: { name: "nhd_tv_voice_recommendations", strict: true } }
      });
      expect(body.instructions).toContain("exactly three");
      expect(body.instructions).toContain("Do not mention provider availability");
      return Response.json({
        output_text: JSON.stringify({
          recommendations: [
            { mediaType: "movie", reason: "A contained chase with tactical turns.", title: "Inside Man", year: 2006 },
            { mediaType: "movie", reason: "A resourceful lead outthinks a larger threat.", title: "Enemy of the State", year: 1998 },
            { mediaType: "show", reason: "A clever fugitive stays ahead of investigators.", title: "The Day of the Jackal", year: 2024 }
          ]
        })
      });
    });

    await expect(client(fetchMock).recommend({
      mediaType: "recommendation",
      title: "tense action movies with a clever lead"
    })).resolves.toHaveLength(3);
  });

  it("rejects duplicate or URL-shaped recommendation output", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({
      output_text: JSON.stringify({
        recommendations: [
          { mediaType: "movie", reason: "See https://example.com", title: "Arrival", year: 2016 },
          { mediaType: "movie", reason: "Thoughtful science fiction.", title: "Arrival", year: 2016 },
          { mediaType: "movie", reason: "Memory and identity collide.", title: "Memento", year: 2000 }
        ]
      })
    }));
    await expect(client(fetchMock).recommend({
      mediaType: "similar-title",
      title: "Inception"
    })).rejects.toMatchObject({ code: "invalid-response" });
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
    await expect(client(fetchMock).interpret("pause after this scene", controller.signal)).rejects.toEqual(
      expect.objectContaining<Partial<OpenAiVoiceError>>({ code: "cancelled" })
    );
  });

  it("caps the post-transcript intent wait below the old thirty-second stall", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => new Promise<Response>(
      (_resolve, reject) => init?.signal?.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
        { once: true }
      )
    ));
    const voiceClient = new OpenAiVoiceClient({
      fetch: fetchMock,
      getApiKey: () => API_KEY,
      intentRequestTimeoutMs: 5
    });
    await expect(voiceClient.interpret("Pause after this scene")).rejects.toEqual(
      expect.objectContaining<Partial<OpenAiVoiceError>>({
        code: "timeout",
        message: "Understanding took too long. Try again."
      })
    );
  });
});
