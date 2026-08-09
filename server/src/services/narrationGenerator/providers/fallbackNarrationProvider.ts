import type { NarrationProvider, NarrationRequest } from "../types.js";

// Tries each provider in order, moving to the next whenever one returns null
// (every NarrationProvider already treats failure as "return null", never
// throws — see GeminiTtsProvider/OpenAiTtsProvider) — e.g. Gemini TTS first
// (cheaper, better Armenian pronunciation), falling back to OpenAI TTS if
// Gemini's daily quota is exhausted or it's otherwise unavailable.
export class FallbackNarrationProvider implements NarrationProvider {
  readonly name: string;

  constructor(private providers: NarrationProvider[]) {
    this.name = providers.map((p) => p.name).join("->");
  }

  async synthesize(req: NarrationRequest): Promise<string | null> {
    for (const provider of this.providers) {
      const audioUrl = await provider.synthesize(req);
      if (audioUrl) return audioUrl;
      console.warn(`[fallbackNarrationProvider] ${provider.name} produced no audio for ${req.sceneKey}, trying next provider`);
    }
    return null;
  }
}
