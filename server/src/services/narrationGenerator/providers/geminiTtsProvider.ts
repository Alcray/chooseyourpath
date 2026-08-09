import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NarrationProvider, NarrationRequest } from "../types.js";
import { pcmToWav } from "../wav.js";

const GENERATED_DIR = path.resolve(process.cwd(), "public", "generated");
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Thrown for a 429 quota/rate-limit response. Distinguished from other
// failures because retrying against an exhausted DAILY quota is pointless —
// see synthesize() below, which fails fast on this instead of burning through
// its retry budget, so a fallback provider (if configured) can take over
// immediately instead of waiting out ~4.5s of futile backoff first.
export class QuotaExhaustedError extends Error {}

export interface GeminiTtsConfig {
  name: string;
  url: string; // full generateContent endpoint
  headers: Record<string, string>;
  voiceName: string;
}

// Gemini's native TTS. Both Google surfaces that host these models take an
// identical request/response shape (`generateContent` with
// responseModalities:["AUDIO"], returning raw headerless 16-bit PCM at 24kHz),
// and differ only in URL and auth — so one implementation serves both:
//
//   • Vertex AI (aiplatform.googleapis.com, needs project+region in the path).
//     Accepts a Vertex API key. Confirmed to use a SEPARATE, much healthier
//     quota pool than the Developer API, and empirically more reliable.
//   • Gemini Developer API (generativelanguage.googleapis.com). Accepts an AI
//     Studio key, but caps at ~100 requests/day per project even when billed.
//
// Both are preferred over Google Cloud Text-to-Speech, which refuses plain API
// keys entirely (demands OAuth2/service-account auth — see GoogleTtsProvider).
// See narrationGenerator/index.ts for how these are chained.
export class GeminiTtsProvider implements NarrationProvider {
  readonly name: string;
  // Only ever stores successful results. A failed attempt is NOT cached —
  // bulk pre-generation fires every scene's narration within a few seconds
  // of each other, which can trip transient rate limits; permanently caching
  // that as "no audio" would silently and permanently mute that scene. Not
  // caching failures lets the next call (e.g. the player reaching that scene
  // later) retry for real.
  private cache = new Map<string, string>();

  constructor(private config: GeminiTtsConfig) {
    this.name = config.name;
  }

  async synthesize({ sceneKey, textHy }: NarrationRequest): Promise<string | null> {
    const cached = this.cache.get(sceneKey);
    if (cached) return cached;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const audioUrl = await this.synthesizeOnce(sceneKey, textHy);
        this.cache.set(sceneKey, audioUrl);
        return audioUrl;
      } catch (err) {
        if (err instanceof QuotaExhaustedError) {
          // Retrying against an exhausted daily quota can't succeed — fail
          // fast so a fallback provider (if configured) takes over
          // immediately instead of waiting out ~4.5s of futile backoff.
          console.warn(`[${this.name}] daily quota exhausted for ${sceneKey}, not retrying:`, err.message);
          return null;
        }
        const isLastAttempt = attempt === MAX_ATTEMPTS;
        console.warn(
          `[${this.name}] narration synthesis attempt ${attempt}/${MAX_ATTEMPTS} failed for ${sceneKey}` + (isLastAttempt ? ", giving up for now:" : ", retrying:"),
          err
        );
        if (isLastAttempt) return null;
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
    return null;
  }

  private async synthesizeOnce(sceneKey: string, textHy: string): Promise<string> {
    const res = await fetch(this.config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.config.headers },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: textHy }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.config.voiceName } } },
        },
      }),
    });

    if (res.status === 429) {
      const errText = await res.text().catch(() => "");
      throw new QuotaExhaustedError(`${this.name} quota exceeded: ${errText}`);
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`${this.name} failed: ${res.status} ${errText}`);
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[];
    };
    const inline = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inline) throw new Error(`${this.name} response had no audio data`);

    const sampleRate = Number(/rate=(\d+)/.exec(inline.mimeType)?.[1] ?? 24000);
    const pcm = Buffer.from(inline.data, "base64");
    const wav = pcmToWav(pcm, sampleRate);

    await mkdir(GENERATED_DIR, { recursive: true });
    const filename = `${sceneKey}.wav`;
    await writeFile(path.join(GENERATED_DIR, filename), wav);

    return `/generated/${filename}`;
  }
}
