import type { StoryBrief, StoryPackage } from "./story";
import { getCharacterPair } from "./story";

export type VideoReferenceImage = {
  characterId: string;
  bytes: Uint8Array;
  mimeType: "image/png";
};

export function canonicalCharacterReferenceKey(storyId: string, characterId: string) {
  if (!/^[a-z0-9_]{3,50}$/.test(characterId)) throw new Error("Invalid character reference ID.");
  return `stories/${storyId}/references/${characterId}.png`;
}

export function buildCharacterReferencePrompt(
  plan: StoryPackage,
  brief: StoryBrief,
  characterId: string,
) {
  const pair = getCharacterPair(brief.characterPairId);
  const character = pair.characters.find((candidate) => candidate.id === characterId);
  if (!character || !plan.canon.characterIds.includes(characterId)) {
    throw new Error("Character reference does not match locked canon.");
  }
  return [
    `Create the locked production reference image for character ID ${character.id}.`,
    `${character.name} is ${character.description}.`,
    `Render exactly one character in ${plan.canon.visualStyle}.`,
    "Centered full-body front three-quarter view, neutral friendly pose, entire silhouette visible, clean softly lit neutral background.",
    "Preserve the exact colors, face, proportions, clothing, and accessories described above. This image will be reused as an asset reference for every video scene.",
    "No other characters, no scene props, no text, no letters, no logo, no watermark, no border, no humans, no photorealism.",
  ].join(" ");
}
