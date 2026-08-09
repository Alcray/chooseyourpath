import type { CharacterBible, Scene, StoryTree } from "../types/story.js";

interface StoredStory {
  tree: StoryTree;
  characterBible: CharacterBible;
  environment: string;
}

// In-memory store keyed by story id, populated when a story is generated and
// read by the video routes so the frontend only ever needs to pass
// (storyId, sceneId) — never raw prompt text — to request a scene's video.
// MVP-scoped: process-lifetime only, no persistence/eviction. A production
// deployment would move this to Redis/a database.
const stories = new Map<string, StoredStory>();

export function saveStory(tree: StoryTree, characterBible: CharacterBible, environment: string) {
  stories.set(tree.id, { tree, characterBible, environment });
}

export function getStory(storyId: string): StoredStory | undefined {
  return stories.get(storyId);
}

export function findScene(storyId: string, sceneId: string): Scene | undefined {
  const story = stories.get(storyId);
  if (!story) return undefined;
  const inOpening = story.tree.opening.find((s) => s.id === sceneId);
  if (inOpening) return inOpening;
  for (const branch of story.tree.branches) {
    const found = branch.consequence.find((s) => s.id === sceneId);
    if (found) return found;
  }
  return undefined;
}
