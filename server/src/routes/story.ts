import { Router } from "express";
import { findCharacter, findLesson, findSetting } from "../data/options.js";
import { CustomLessonRequiresAiError, generateStory } from "../services/storyGenerator/index.js";
import { addChoiceImages } from "../services/choiceImageGenerator/index.js";
import { ensureSceneGeneration, getSceneStatus, sceneKeyFor } from "../services/sceneOrchestrator.js";
import { getStory, saveStory } from "../store/storyStore.js";
import type { CharacterBible, Scene, StoryRequest, StoryTree } from "../types/story.js";

const CUSTOM_LESSON_MAX_LENGTH = 300;

export const storyRouter = Router();

// The `action` field on every scene is an internal, English, video-prompt-only
// description (see types/story.ts) — it's never shown to the child, so it's
// stripped before the story JSON leaves the server.
function stripActions(tree: StoryTree) {
  const publicScene = ({ action, ...rest }: Scene) => rest;
  return {
    ...tree,
    opening: tree.opening.map(publicScene),
    branches: tree.branches.map((b) => ({ ...b, consequence: b.consequence.map(publicScene) })),
  };
}

const PREGENERATION_STAGGER_MS = 500;

// Kicks off generation for EVERY scene in the story — both branches, not just
// the one the child ends up picking — the moment the story is created, so
// there's no per-scene wait once playback starts. Fire-and-forget: the child
// doesn't wait on this, only on however far generation has gotten by the time
// they reach a given scene. Requests are staggered slightly to avoid bursting
// past Veo's per-minute quota. This does mean generating some clips that may
// never be watched (whichever branch isn't chosen) — an intentional latency-
// for-cost tradeoff per product decision.
function pregenerateAllScenes(tree: StoryTree, characterBible: CharacterBible, environment: string) {
  const allScenes = [...tree.opening, ...tree.branches.flatMap((b) => b.consequence)];
  allScenes.forEach((scene, i) => {
    setTimeout(() => {
      ensureSceneGeneration(scene, characterBible, environment).catch((err) => {
        console.error(`[pregenerate] scene ${scene.id} failed:`, err);
      });
    }, i * PREGENERATION_STAGGER_MS);
  });
}

storyRouter.post("/", async (req, res) => {
  const { lessonId, customLesson, characterId, settingId } = req.body as Partial<StoryRequest>;

  const trimmedCustomLesson = customLesson?.trim();
  if (!characterId || !settingId || (!lessonId && !trimmedCustomLesson) || (lessonId && trimmedCustomLesson)) {
    return res.status(400).json({ error: "Provide exactly one of lessonId or customLesson, plus characterId and settingId." });
  }
  if (trimmedCustomLesson && trimmedCustomLesson.length > CUSTOM_LESSON_MAX_LENGTH) {
    return res.status(400).json({ error: `customLesson must be ${CUSTOM_LESSON_MAX_LENGTH} characters or fewer.`, code: "CUSTOM_LESSON_TOO_LONG" });
  }

  const lesson = lessonId ? findLesson(lessonId) : undefined;
  const character = findCharacter(characterId);
  const setting = findSetting(settingId);

  if ((lessonId && !lesson) || !character || !setting) {
    return res.status(404).json({ error: "Unknown lessonId, characterId, or settingId" });
  }

  try {
    const generatedStory = await generateStory(
      { lessonId, customLesson: trimmedCustomLesson, characterId, settingId },
      {
        lessonName: lesson?.name ?? trimmedCustomLesson!,
        characterName: character.name,
        nameDef: character.nameDef,
        nameGen: character.nameGen,
        settingName: setting.name,
        placeLoc: setting.nameLoc,
        characterBible: character.bible,
        environment: setting.environment,
      }
    );
    // Scene generation must never wait on optional choice artwork. Start Veo
    // immediately, then enrich the response with whatever Nano Banana can
    // produce; a second save updates the stored tree with the image URLs.
    saveStory(generatedStory, character.bible, setting.environment);
    pregenerateAllScenes(generatedStory, character.bible, setting.environment);
    const story = await addChoiceImages(generatedStory, character.bible, setting.environment);
    saveStory(story, character.bible, setting.environment);
    res.json(stripActions(story));
  } catch (err) {
    if (err instanceof CustomLessonRequiresAiError) {
      return res.status(422).json({ error: "Custom lessons need AI to be enabled.", code: "CUSTOM_LESSON_REQUIRES_AI" });
    }
    console.error("[POST /api/story] generation failed:", err);
    res.status(500).json({ error: "Failed to generate story" });
  }
});

// Lets the player show one upfront "preparing your movie" screen and wait
// until every scene (both branches) is generated before starting playback,
// instead of hitting a per-scene wait at the decision point — see
// pregenerateAllScenes above for why generation is already underway by the
// time this is polled.
storyRouter.get("/:storyId/progress", async (req, res) => {
  const story = getStory(req.params.storyId);
  if (!story) return res.status(404).json({ error: "Unknown storyId" });

  const allScenes = [...story.tree.opening, ...story.tree.branches.flatMap((b) => b.consequence)];
  const scenes = await Promise.all(
    allScenes.map(async (scene) => {
      const sceneKey = sceneKeyFor(scene, story.characterBible, story.environment);
      const job = await getSceneStatus(sceneKey);
      return { sceneId: scene.id, status: job.status };
    })
  );

  const ready = scenes.filter((s) => s.status === "ready").length;
  const errored = scenes.filter((s) => s.status === "error").length;
  res.json({ total: scenes.length, ready, errored, scenes });
});
