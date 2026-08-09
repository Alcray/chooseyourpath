import type { CharacterBible, StoryRequest, StoryTree } from "../../types/story.js";

export interface StoryGeneratorContext {
  lessonName: string;
  characterName: string; // bare Armenian name, e.g. "Լեո"
  nameDef: string; // Armenian definite/subject form, e.g. "Լեոն"
  nameGen: string; // Armenian genitive/possessive form, e.g. "Լեոյի"
  settingName: string; // bare Armenian name
  placeLoc: string; // Armenian locative form, e.g. "Կախարդական անտառում"
  characterBible: CharacterBible;
  environment: string; // English setting description, for Veo prompts
}

// Any story backend (template-based, Claude, or something else later) implements this.
export interface StoryProvider {
  readonly name: StoryTree["generatedBy"];
  generate(request: StoryRequest, ctx: StoryGeneratorContext): Promise<StoryTree>;
}
