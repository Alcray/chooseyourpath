import { existsSync } from "node:fs";
import { GeminiTtsProvider } from "./providers/geminiTtsProvider.js";
import { OpenAiTtsProvider } from "./providers/openAiTtsProvider.js";
import { GoogleTtsProvider } from "./providers/googleTtsProvider.js";
import { SilentNarrationProvider } from "./providers/silentProvider.js";
import { FallbackNarrationProvider } from "./providers/fallbackNarrationProvider.js";
import type { NarrationProvider } from "./types.js";

const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const geminiVoice = process.env.GEMINI_TTS_VOICE || "Kore";

const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_TTS_MODEL || "tts-1";
const openAiVoice = process.env.OPENAI_TTS_VOICE || "alloy";

const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const hasCloudTtsCredentials = Boolean(credentialsPath && existsSync(credentialsPath));

function buildNarrationGenerator(): NarrationProvider {
  const providers: NarrationProvider[] = [];

  // Preferred: Gemini's native TTS accepts a plain API key (no service
  // account setup), is confirmed to support Armenian well, and is cheaper —
  // but caps at ~100 requests/day even when billed (confirmed via testing).
  if (geminiApiKey) providers.push(new GeminiTtsProvider(geminiApiKey, geminiModel, geminiVoice));
  // Fallback: OpenAI TTS. Different quota system entirely, so it picks up
  // exactly when Gemini's daily cap is hit. Armenian works but pronunciation
  // is measurably less accurate (English-optimized voices) — kept as
  // fallback, not primary, for that reason.
  if (openAiApiKey) providers.push(new OpenAiTtsProvider(openAiApiKey, openAiModel, openAiVoice));

  if (providers.length > 1) return new FallbackNarrationProvider(providers);
  if (providers.length === 1) return providers[0];

  // Only used if neither Gemini nor OpenAI is configured at all.
  if (hasCloudTtsCredentials) return new GoogleTtsProvider();
  return new SilentNarrationProvider();
}

export const narrationGenerator: NarrationProvider = buildNarrationGenerator();
