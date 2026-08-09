import type { CharacterBible, SceneMood } from "../../types/story.js";

// Everything a provider needs to generate (or look up) one scene's visuals.
// `sceneKey` is a stable cache key derived from everything that affects the
// output (character + setting + action + narration) — see cacheKey.ts.
export interface SceneGenerationRequest {
  sceneKey: string;
  narrationHy: string; // Armenian narration — used for the narration/TTS layer, not the video prompt
  actionEn: string; // English scene-action phrase — used for the video prompt
  mood: SceneMood;
  characterBible: CharacterBible;
  environment: string; // English setting description
}

export type GenerationStatus = "pending" | "processing" | "ready" | "error";

// Discriminated union so the frontend (and SceneStage) can render either a
// real generated video+narration pair, or the illustration fallback, through
// the same code path.
export type SceneAsset =
  | {
      type: "video";
      videoUrl: string;
      audioUrl: string | null; // narration track; null if TTS wasn't available/configured
    }
  | {
      type: "illustration";
      background: string; // tailwind gradient classes
      animation: "float" | "bounce" | "pulse" | "sway";
      sprites: { emoji: string; xPct: number; yPct: number; sizeRem: number; delay: number }[];
      audioUrl: string | null; // narration track; the offline/mock fallback can still speak if TTS is configured
    };

export interface SceneJob {
  sceneKey: string;
  status: GenerationStatus;
  asset?: SceneAsset;
  error?: string;
}

// Any video backend (instant illustration mock, or real Veo) implements this.
// The story engine never talks to Veo directly — it only knows this interface.
export interface VideoGenerator {
  readonly name: string;
  /** Kick off generation (or return the cached/in-flight job) for one scene. */
  generateScene(req: SceneGenerationRequest): Promise<SceneJob>;
  /** Poll the status of a previously requested scene. */
  getGenerationStatus(sceneKey: string): Promise<SceneJob>;
  /** Convenience accessor: the ready asset, or null if not ready yet. */
  getVideo(sceneKey: string): Promise<SceneAsset | null>;
}
