import type { CharacterBible, SceneMood } from "../../types/story.js";

export interface PromptContext {
  characterBible: CharacterBible;
  environment: string;
  actionEn: string;
  mood: SceneMood;
}

const MOOD_LIGHTING: Record<SceneMood, string> = {
  happy: "bright warm sunny lighting, cheerful uplifting atmosphere",
  excited: "vivid bright lighting, energetic sparkling atmosphere",
  curious: "soft bright daylight, gentle inquisitive atmosphere",
  worried: "slightly softer lighting with gentle shadows, mild tension but still warm and never scary",
  proud: "golden warm glowing light, triumphant uplifting atmosphere",
  calm: "soft pastel gentle lighting, peaceful soothing atmosphere",
};

// Transforms structured scene information into a single detailed Veo prompt.
// Deliberately kept separate from the Armenian story text (see Scene.action
// vs Scene.narration in types/story.ts) — Veo only ever sees this English,
// visuals-only description; the Armenian is handled entirely by the
// narration/TTS layer. Every character bible + shared style string is reused
// on every call so the hero and art direction stay consistent scene to scene.
export class VeoPromptBuilder {
  build({ characterBible, environment, actionEn, mood }: PromptContext): string {
    const subject = `A ${characterBible.appearance}. ${capitalize(characterBible.clothing)}. Personality: ${characterBible.personality}.`;
    const action = `The character is ${actionEn}.`;
    const setting = `Setting: ${environment}.`;
    const lighting = `Lighting and mood: ${MOOD_LIGHTING[mood]}.`;
    const camera = "Camera: gentle, slow, steady camera movement with simple clear framing — no rapid cuts, no shaky handheld motion.";
    const style = `Animation style: ${characterBible.style}.`;
    const duration = "Duration: a short single continuous clip, about 6 seconds.";
    const safety =
      "The scene must be strictly child-appropriate and wholesome: no violence, no frightening imagery, no weapons, " +
      "no on-screen text or captions, no spoken dialogue.";

    return [
      "Create a short, colorful 3D animated children's cartoon scene.",
      subject,
      action,
      setting,
      lighting,
      camera,
      style,
      duration,
      safety,
    ].join(" ");
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
