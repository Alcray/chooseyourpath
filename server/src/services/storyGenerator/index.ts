import type { StoryRequest, StoryTree } from "../../types/story.js";
import { TemplateStoryProvider } from "./providers/templateProvider.js";
import { AnthropicStoryProvider } from "./providers/anthropicProvider.js";
import { GeminiStoryProvider } from "./providers/geminiStoryProvider.js";
import type { StoryGeneratorContext, StoryProvider } from "./types.js";

const templateProvider = new TemplateStoryProvider();

// LLM_API_KEY is accepted as an alias so .env.example can use the generic name
// while the SDK underneath is specifically Anthropic's.
const anthropicApiKey = process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY;
const anthropicProvider = anthropicApiKey ? new AnthropicStoryProvider(anthropicApiKey) : null;

// Preferred when available: reuses the same GEMINI_API_KEY already used for
// narration, so one key covers both story text and voice.
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiStoryModel = process.env.GEMINI_STORY_MODEL || "gemini-2.5-flash";
const geminiProvider = geminiApiKey ? new GeminiStoryProvider(geminiApiKey, geminiStoryModel) : null;

const llmProvider: StoryProvider | null = geminiProvider ?? anthropicProvider;

// Exposed so routes/index.ts can report whether custom (parent-written)
// lessons are actually usable right now, without duplicating the provider
// selection logic.
export const storyAiEnabled = llmProvider !== null;

// Thrown (and caught by routes/story.ts) when a parent-written custom lesson
// is requested but no LLM is configured — the template provider has no way
// to handle arbitrary free text, so there's no safe fallback for this case.
export class CustomLessonRequiresAiError extends Error {
  constructor() {
    super("Custom lessons require an LLM provider (GEMINI_API_KEY or ANTHROPIC_API_KEY/LLM_API_KEY) to be configured.");
    this.name = "CustomLessonRequiresAiError";
  }
}

// Single entry point the routes call. Prefers the real AI provider when an
// API key is configured, but always has the deterministic template provider
// as a safety net for predefined lessons so the app never breaks a child's
// story mid-flow. Custom (parent-written) lessons always require the LLM —
// there is no template to fall back to for arbitrary text.
export async function generateStory(request: StoryRequest, ctx: StoryGeneratorContext): Promise<StoryTree> {
  const isCustomLesson = !request.lessonId && Boolean(request.customLesson);

  if (isCustomLesson) {
    if (!llmProvider) throw new CustomLessonRequiresAiError();
    return llmProvider.generate(request, ctx);
  }

  if (llmProvider) {
    try {
      return await llmProvider.generate(request, ctx);
    } catch (err) {
      console.error(`[storyGenerator] ${llmProvider.name} provider failed, falling back to template:`, err);
    }
  }
  return templateProvider.generate(request, ctx);
}
