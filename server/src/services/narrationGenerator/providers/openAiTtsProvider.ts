import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NarrationProvider, NarrationRequest } from "../types.js";

const GENERATED_DIR = path.resolve(process.cwd(), "public", "generated");
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fallback narration option, used when Gemini TTS is unavailable or its
// (fairly low, ~100/day even when billed) quota is exhausted. Simple
// Bearer-token auth, and — unlike Gemini's raw PCM — returns ready-to-play
// MP3 bytes directly, no container wrapping needed. Armenian is supported
// (Whisper-derived language list) but the voices are English-optimized, so
// pronunciation accuracy is measurably lower than Gemini's — this is
// deliberately the fallback, not the default, whenever Gemini is available.
export class OpenAiTtsProvider implements NarrationProvider {
  readonly name = "openai-tts";
  private cache = new Map<string, string>();

  constructor(
    private apiKey: string,
    private model: string,
    private voice: string
  ) {}

  async synthesize({ sceneKey, textHy }: NarrationRequest): Promise<string | null> {
    const cached = this.cache.get(sceneKey);
    if (cached) return cached;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const audioUrl = await this.synthesizeOnce(sceneKey, textHy);
        this.cache.set(sceneKey, audioUrl);
        return audioUrl;
      } catch (err) {
        const isLastAttempt = attempt === MAX_ATTEMPTS;
        console.warn(
          `[openAiTtsProvider] narration synthesis attempt ${attempt}/${MAX_ATTEMPTS} failed for ${sceneKey}` + (isLastAttempt ? ", giving up for now:" : ", retrying:"),
          err
        );
        if (isLastAttempt) return null;
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
    return null;
  }

  private async synthesizeOnce(sceneKey: string, textHy: string): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, input: textHy, voice: this.voice, response_format: "mp3" }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenAI TTS failed: ${res.status} ${errText}`);
    }

    const bytes = Buffer.from(await res.arrayBuffer());
    await mkdir(GENERATED_DIR, { recursive: true });
    const filename = `${sceneKey}.mp3`;
    await writeFile(path.join(GENERATED_DIR, filename), bytes);

    return `/generated/${filename}`;
  }
}
