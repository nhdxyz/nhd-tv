const SOUND_PREFERENCE_KEY = "nhd-navigation-sounds";

export function soundEnabledFromPreference(value: string | null): boolean {
  return value !== "off";
}

export type VoiceSoundCue = "attention" | "listening" | "success";

export function voiceSoundCue(
  previousPhase: string | undefined,
  phase: string
): VoiceSoundCue | null {
  if (previousPhase === phase) return null;
  if (phase === "listening") return "listening";
  if (phase === "success") return "success";
  if (phase === "clarification" || phase === "confirmation" || phase === "error") {
    return "attention";
  }
  return null;
}

export class NavigationSounds {
  #context: AudioContext | null = null;
  #enabled: boolean;

  constructor() {
    let preference: string | null = null;

    try {
      preference = localStorage.getItem(SOUND_PREFERENCE_KEY);
    } catch {
      // Sound remains enabled when storage is unavailable.
    }

    this.#enabled = soundEnabledFromPreference(preference);
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;

    try {
      localStorage.setItem(SOUND_PREFERENCE_KEY, enabled ? "on" : "off");
    } catch {
      // The in-memory preference still applies for this session.
    }
  }

  playMove(): void {
    this.#playTone(360, 430, 0.036, 0.026);
  }

  playSelect(): void {
    this.#playTone(470, 590, 0.055, 0.034);
  }

  playVoiceCue(cue: VoiceSoundCue): void {
    switch (cue) {
      case "attention":
        this.#playTone(470, 350, 0.09, 0.029);
        break;
      case "listening":
        this.#playTone(440, 620, 0.075, 0.025);
        break;
      case "success":
        this.#playTone(520, 760, 0.11, 0.03);
        break;
    }
  }

  #playTone(startFrequency: number, endFrequency: number, duration: number, volume: number): void {
    if (!this.#enabled) {
      return;
    }

    const AudioContextConstructor = window.AudioContext;
    this.#context ??= new AudioContextConstructor();
    const context = this.#context;
    const startTime = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    void context.resume();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(startFrequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.01);
  }
}
