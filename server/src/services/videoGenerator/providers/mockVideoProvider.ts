import type { SceneMood } from "../../../types/story.js";
import type { SceneAsset, SceneGenerationRequest, SceneJob, VideoGenerator } from "../types.js";

const MOOD_ANIMATION: Record<SceneMood, Extract<SceneAsset, { type: "illustration" }>["animation"]> = {
  happy: "bounce",
  excited: "bounce",
  proud: "pulse",
  curious: "sway",
  worried: "sway",
  calm: "float",
};

// Deterministic "cartoon" stand-in used when VEO_API_KEY isn't configured, so
// the whole interactive story experience keeps working offline/for free. It
// composes the character's emoji with a couple of setting decorations over a
// gradient background — no AI calls, no cost, instant "ready" status. This is
// the same illustration approach the app shipped with before video support.
export class MockVideoProvider implements VideoGenerator {
  readonly name = "mock";
  private cache = new Map<string, SceneJob>();

  async generateScene(req: SceneGenerationRequest): Promise<SceneJob> {
    const existing = this.cache.get(req.sceneKey);
    if (existing) return existing;

    const asset: SceneAsset = {
      type: "illustration",
      background: pickBackground(req.environment),
      animation: MOOD_ANIMATION[req.mood],
      sprites: [
        { emoji: pickCharacterEmoji(req.characterBible.species), xPct: 50, yPct: 55, sizeRem: 7, delay: 0 },
        { emoji: "✨", xPct: 15, yPct: 20, sizeRem: 2.5, delay: 0.15 },
        { emoji: "🌟", xPct: 82, yPct: 25, sizeRem: 2.5, delay: 0.3 },
        { emoji: "💫", xPct: 78, yPct: 75, sizeRem: 2.25, delay: 0.45 },
      ],
      // Filled in by sceneOrchestrator.combine() — narration is generated
      // independently of video, so the illustration fallback can speak too.
      audioUrl: null,
    };
    const job: SceneJob = { sceneKey: req.sceneKey, status: "ready", asset };
    this.cache.set(req.sceneKey, job);
    return job;
  }

  async getGenerationStatus(sceneKey: string): Promise<SceneJob> {
    // "pending", not "error": this scene just hasn't been requested yet.
    return this.cache.get(sceneKey) ?? { sceneKey, status: "pending" };
  }

  async getVideo(sceneKey: string): Promise<SceneAsset | null> {
    return this.cache.get(sceneKey)?.asset ?? null;
  }
}

const GRADIENTS = [
  "from-green-400 to-emerald-600",
  "from-indigo-500 to-purple-700",
  "from-cyan-400 to-blue-600",
  "from-fuchsia-400 to-pink-600",
  "from-lime-400 to-green-600",
  "from-orange-300 to-rose-500",
];

function pickBackground(environment: string) {
  let sum = 0;
  for (let i = 0; i < environment.length; i++) sum += environment.charCodeAt(i);
  return GRADIENTS[sum % GRADIENTS.length];
}

function pickCharacterEmoji(species: string) {
  if (species.includes("lion")) return "🦁";
  if (species.includes("robot")) return "🤖";
  if (species.includes("fox")) return "🦊";
  if (species.includes("dolphin")) return "🐬";
  if (species.includes("dragon")) return "🐲";
  if (species.includes("bunny")) return "🐰";
  return "🐾";
}
