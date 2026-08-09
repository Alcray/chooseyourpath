// Mirrors server/src/types/story.ts + videoGenerator/types.ts.
// Kept as a hand-synced copy for MVP simplicity (no shared package yet).

export interface Lesson {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

export interface CharacterOption {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export interface SettingOption {
  id: string;
  name: string;
  emoji: string;
  color: string;
  decorations: string[];
}

export type SceneMood = "happy" | "curious" | "worried" | "excited" | "proud" | "calm";

// Note: no `action` field here — that's an internal, English, video-prompt-only
// field the backend strips before sending the story JSON to the client.
export interface Scene {
  id: string;
  narration: string;
  mood: SceneMood;
}

export interface Choice {
  id: string;
  label: string;
  icon: string;
  description: string;
  imageUrl?: string;
}

export interface ReflectionOption {
  id: string;
  label: string;
  icon: string;
}

export interface Reflection {
  question: string;
  options: ReflectionOption[];
  insight: string;
}

export interface StorySummary {
  title: string;
  message: string;
  moralRecap: string;
  stars: 1 | 2 | 3;
}

export interface Branch {
  choiceId: string;
  consequence: Scene[];
  reflection: Reflection;
  summary: StorySummary;
}

export interface StoryTree {
  id: string;
  lessonId: string;
  title: string;
  characterName: string;
  settingName: string;
  opening: Scene[];
  decision: {
    prompt: string;
    choices: Choice[];
  };
  branches: Branch[];
  generatedBy: "template" | "anthropic" | "gemini";
}

export interface OptionsResponse {
  lessons: Lesson[];
  characters: CharacterOption[];
  settings: SettingOption[];
}

// --- Scene video/audio generation (POST /api/video/scene, GET /api/video/status/:sceneKey) ---

export type GenerationStatus = "pending" | "processing" | "ready" | "error";

export type SceneAsset =
  | { type: "video"; videoUrl: string; audioUrl: string | null }
  | {
      type: "illustration";
      background: string;
      animation: "float" | "bounce" | "pulse" | "sway";
      sprites: { emoji: string; xPct: number; yPct: number; sizeRem: number; delay: number }[];
      audioUrl: string | null;
    };

export interface SceneJob {
  sceneKey: string;
  status: GenerationStatus;
  asset?: SceneAsset;
  error?: string;
}

// --- Whole-story generation progress (GET /api/story/:id/progress) ---

export interface StoryProgress {
  total: number;
  ready: number;
  errored: number;
  scenes: { sceneId: string; status: GenerationStatus }[];
}
