import type { CharacterBible, StoryTree } from "../../types/story.js";
import { DisabledChoiceImageProvider } from "./providers/disabledProvider.js";
import { VertexNanoBananaProvider } from "./providers/vertexNanoBananaProvider.js";
import type { ChoiceImageGenerator } from "./types.js";

// Prefer explicit shared Vertex names, but reuse the existing Veo credentials
// so current deployments gain choice previews without duplicating secrets.
const vertexApiKey = process.env.VERTEX_API_KEY || process.env.VEO_API_KEY;
const vertexProjectId = process.env.VERTEX_PROJECT_ID || process.env.VEO_PROJECT_ID;
const vertexLocation = process.env.VERTEX_LOCATION || "global";
const choiceImageModel = process.env.CHOICE_IMAGE_MODEL || "gemini-3.1-flash-image";

function buildChoiceImageGenerator(): ChoiceImageGenerator {
  if (!vertexApiKey || !vertexProjectId) return new DisabledChoiceImageProvider();
  return new VertexNanoBananaProvider(vertexApiKey, choiceImageModel, vertexProjectId, vertexLocation);
}

export const choiceImageGenerator = buildChoiceImageGenerator();

// Generate both branch previews concurrently. Image failure is deliberately
// isolated per choice: the child still receives the story and the UI falls
// back to a large visual icon instead of exposing a broken image or text.
export async function addChoiceImages(tree: StoryTree, characterBible: CharacterBible, environment: string): Promise<StoryTree> {
  if (choiceImageGenerator.name === "disabled") return tree;

  const choices = await Promise.all(
    tree.decision.choices.map(async (choice) => {
      const consequence = tree.branches.find((branch) => branch.choiceId === choice.id)?.consequence;
      if (!consequence) return choice;

      try {
        const imageUrl = await choiceImageGenerator.generate({ choice, consequence, characterBible, environment });
        return imageUrl ? { ...choice, imageUrl } : choice;
      } catch (err) {
        console.error(`[choiceImageGenerator] choice ${choice.id} failed:`, err);
        return choice;
      }
    })
  );

  return { ...tree, decision: { ...tree.decision, choices } };
}
