import { createHash } from "node:crypto";
import type { CharacterBible } from "../../types/story.js";

// Stable content-addressed key: same character + setting + action + narration
// always maps to the same key, so re-visiting a branch (e.g. via "what if I
// chose differently?") reuses the already-generated clip instead of paying
// for a new Veo generation.
export function computeSceneKey(params: {
  characterBible: CharacterBible;
  environment: string;
  actionEn: string;
  narrationHy: string;
  mood: string;
}) {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(params));
  return hash.digest("hex").slice(0, 24);
}
