import type { CharacterBible, Choice, Scene } from "../../types/story.js";

export interface ChoiceImageRequest {
  choice: Choice;
  consequence: Scene[];
  characterBible: CharacterBible;
  environment: string;
}

export interface ChoiceImageGenerator {
  readonly name: "nano-banana-2" | "disabled";
  generate(request: ChoiceImageRequest): Promise<string | null>;
}
