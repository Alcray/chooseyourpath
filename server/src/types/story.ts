// Core domain types shared by the story generator and video generator abstractions.
// The frontend consumes a subset of this shape (kept in sync manually for the MVP) —
// notably `action` (the English video-prompt description) and `characterBible` never
// leave the backend; they're internal to prompt-building.

export interface Lesson {
  id: string;
  name: string; // Armenian, child-facing
  icon: string;
  color: string; // tailwind gradient classes
  description: string; // Armenian
}

// The "character bible": a fixed, reusable visual description that gets woven into
// every Veo prompt for this character so the hero looks the same across every scene
// and every branch. Kept in English/plain description (not Armenian) because it's
// never shown to the child — it only feeds VeoPromptBuilder.
export interface CharacterBible {
  species: string;
  appearance: string;
  clothing: string;
  personality: string;
  style: string; // shared art-direction string, same across all characters for visual consistency
}

export interface CharacterOption {
  id: string;
  name: string; // Armenian, child-facing, bare form
  nameDef: string; // Armenian definite/subject form, e.g. "Լեոն" / "Ալիքը" — suffix depends on the name's ending, so it's precomputed rather than concatenated
  nameGen: string; // Armenian genitive/possessive form, e.g. "Լեոյի" / "Ալիքի"
  emoji: string;
  color: string;
  bible: CharacterBible;
}

export interface SettingOption {
  id: string;
  name: string; // Armenian, child-facing, bare form
  nameLoc: string; // Armenian locative form ("in the ..."), e.g. "անտառում" — precomputed for the same reason as nameDef/nameGen
  emoji: string;
  color: string;
  decorations: string[]; // extra emoji sprinkled into illustration fallback scenes
  environment: string; // English description of the place, for Veo prompts
}

export interface StoryRequest {
  // Exactly one of these two is expected — a predefined lesson id, or a
  // parent-written free-text description of what the child should learn.
  // Custom lessons can't use the deterministic template provider (there's no
  // template for arbitrary text), so they require an LLM provider to be
  // configured — see storyGenerator/index.ts.
  lessonId?: string;
  customLesson?: string;
  characterId: string;
  settingId: string;
}

export type SceneMood = "happy" | "curious" | "worried" | "excited" | "proud" | "calm";

// A "Scene" is one narration beat. `narration` is the Armenian text shown/spoken to
// the child; `action` is a short English description of what happens visually, used
// only to build the Veo video prompt (see VeoPromptBuilder) — it is intentionally
// kept separate from the Armenian story text and never rendered in the UI.
export interface Scene {
  id: string;
  narration: string; // Armenian
  action: string; // English, internal — video-prompt only
  mood: SceneMood;
}

export interface Choice {
  id: string;
  label: string; // Armenian
  icon: string;
  description: string; // Armenian
  // Generated visual preview of the immediate future on this branch. Optional
  // because the story must remain playable if Vertex is not configured or an
  // individual image request is rejected by the provider.
  imageUrl?: string;
}

export interface ReflectionOption {
  id: string;
  label: string; // Armenian
  icon: string;
}

export interface Reflection {
  question: string; // Armenian
  options: ReflectionOption[];
  insight: string; // Armenian — shown after the child answers, always framed positively
}

export interface StorySummary {
  title: string; // Armenian
  message: string; // Armenian
  moralRecap: string; // Armenian
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
  title: string; // Armenian
  characterName: string; // Armenian
  settingName: string; // Armenian
  opening: Scene[];
  decision: {
    prompt: string; // Armenian
    choices: Choice[];
  };
  branches: Branch[];
  generatedBy: "template" | "anthropic" | "gemini";
}
