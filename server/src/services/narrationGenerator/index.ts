import { existsSync } from "node:fs";
import { GeminiTtsProvider } from "./providers/geminiTtsProvider.js";
import { OpenAiTtsProvider } from "./providers/openAiTtsProvider.js";
import { GoogleTtsProvider } from "./providers/googleTtsProvider.js";
import { SilentNarrationProvider } from "./providers/silentProvider.js";
import { FallbackNarrationProvider } from "./providers/fallbackNarrationProvider.js";
import type { NarrationProvider } from "./types.js";

const ttsVoice = process.env.GEMINI_TTS_VOICE || "Kore";
const ttsModel = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";

// Vertex AI reuses the Veo credentials — same key, same project/region.
const vertexApiKey = process.env.VEO_API_KEY;
const vertexProjectId = process.env.VEO_PROJECT_ID;
const vertexLocation = process.env.VEO_LOCATION || "us-central1";

const geminiApiKey = process.env.GEMINI_API_KEY;

const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_TTS_MODEL || "tts-1";
const openAiVoice = process.env.OPENAI_TTS_VOICE || "alloy";

const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const hasCloudTtsCredentials = Boolean(credentialsPath && existsSync(credentialsPath));

function buildNarrationGenerator(): NarrationProvider {
  const providers: NarrationProvider[] = [];

  // Preferred: Gemini TTS hosted on Vertex AI, using the same key/project
  // already configured for Veo. Confirmed to draw on a SEPARATE quota pool
  // from the Gemini Developer API (8/8 requests succeeded here while the
  // Developer API was fully exhausted for the day) and to be more reliable
  // in practice, so it goes first.
  if (vertexApiKey && vertexProjectId) {
    providers.push(
      new GeminiTtsProvider({
        name: "vertex-tts",
        url: `https://${vertexLocation}-aiplatform.googleapis.com/v1/projects/${vertexProjectId}/locations/${vertexLocation}/publishers/google/models/${ttsModel}:generateContent`,
        headers: { "x-goog-api-key": vertexApiKey },
        voiceName: ttsVoice,
      })
    );
  }

  // Next: the same models via the Gemini Developer API (AI Studio key).
  // Same voice/quality, but capped at ~100 requests/day per project even
  // when billed.
  if (geminiApiKey) {
    providers.push(
      new GeminiTtsProvider({
        name: "gemini-tts",
        url: `https://generativelanguage.googleapis.com/v1beta/models/${ttsModel}:generateContent`,
        headers: { "x-goog-api-key": geminiApiKey },
        voiceName: ttsVoice,
      })
    );
  }

  // Last resort before silence: OpenAI TTS. Different vendor entirely, so
  // it's unaffected by any Google-side quota. Armenian works but the voices
  // are English-optimized, so pronunciation is measurably less accurate.
  if (openAiApiKey) providers.push(new OpenAiTtsProvider(openAiApiKey, openAiModel, openAiVoice));

  if (providers.length > 1) return new FallbackNarrationProvider(providers);
  if (providers.length === 1) return providers[0];

  // Only used if none of the above is configured at all.
  if (hasCloudTtsCredentials) return new GoogleTtsProvider();
  return new SilentNarrationProvider();
}

export const narrationGenerator: NarrationProvider = buildNarrationGenerator();
