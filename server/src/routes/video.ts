import { Router } from "express";
import { findScene, getStory } from "../store/storyStore.js";
import { ensureSceneGeneration, getSceneStatus } from "../services/sceneOrchestrator.js";

export const videoRouter = Router();

videoRouter.post("/scene", async (req, res) => {
  const { storyId, sceneId } = req.body as { storyId?: string; sceneId?: string };
  if (!storyId || !sceneId) {
    return res.status(400).json({ error: "storyId and sceneId are required" });
  }

  const story = getStory(storyId);
  const scene = findScene(storyId, sceneId);
  if (!story || !scene) {
    return res.status(404).json({ error: "Unknown storyId/sceneId" });
  }

  try {
    const job = await ensureSceneGeneration(scene, story.characterBible, story.environment);
    res.json(job);
  } catch (err) {
    console.error(`[POST /api/video/scene] generation failed for scene ${sceneId}:`, err);
    res.status(500).json({ error: "Failed to start scene generation" });
  }
});

videoRouter.get("/status/:sceneKey", async (req, res) => {
  try {
    const job = await getSceneStatus(req.params.sceneKey);
    res.json(job);
  } catch (err) {
    console.error(`[GET /api/video/status] failed for ${req.params.sceneKey}:`, err);
    res.status(500).json({ error: "Failed to check scene status" });
  }
});
