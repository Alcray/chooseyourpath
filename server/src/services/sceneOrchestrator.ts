import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { videoGenerator } from "./videoGenerator/index.js";
import { narrationGenerator } from "./narrationGenerator/index.js";
import { computeSceneKey } from "./videoGenerator/cacheKey.js";
import type { SceneAsset, SceneJob } from "./videoGenerator/types.js";
import type { CharacterBible, Scene } from "../types/story.js";

// Narration is generated independently of video (see narrationGenerator) and
// combined here at the orchestration layer — this is what lets the video and
// audio layers be swapped out independently, per the architecture brief.
// Shared across both the eager bulk-pregeneration (story creation) and the
// on-demand per-scene requests from the player, so either path warms the
// same cache.
//
// Only successful narration results are stored here — see
// ensureSceneGeneration below for why a failure must NOT be cached.
const narrationCache = new Map<string, string>();

// Same reasoning as VeoVideoProvider.rehydrateFromDisk(): the in-memory cache
// doesn't survive a restart, but the generated audio files do.
function rehydrateNarrationCache() {
  const dir = path.resolve(process.cwd(), "public", "generated");
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((f) => f.endsWith(".wav") || f.endsWith(".mp3"));
  for (const file of files) {
    const ext = path.extname(file);
    const sceneKey = file.slice(0, -ext.length);
    narrationCache.set(sceneKey, `/generated/${file}`);
  }
  if (files.length > 0) console.log(`[sceneOrchestrator] rehydrated ${files.length} previously generated narration file(s) from disk`);
}
rehydrateNarrationCache();

function combine(job: SceneJob): SceneJob {
  if (!job.asset) return job;
  const audioUrl = narrationCache.get(job.sceneKey) ?? null;
  const asset: SceneAsset = { ...job.asset, audioUrl };
  return { ...job, asset };
}

export function sceneKeyFor(scene: Scene, characterBible: CharacterBible, environment: string) {
  return computeSceneKey({
    characterBible,
    environment,
    actionEn: scene.action,
    narrationHy: scene.narration,
    mood: scene.mood,
  });
}

// Kicks off (or returns the cached/in-flight) generation for one scene. Both
// narration and video generation calls are themselves cheap/idempotent
// (content-addressed by sceneKey), so calling this repeatedly for the same
// scene — from the bulk pre-generation pass AND the player's on-demand
// request — is safe and just reuses whatever's already in flight or ready.
export async function ensureSceneGeneration(scene: Scene, characterBible: CharacterBible, environment: string): Promise<SceneJob> {
  const sceneKey = sceneKeyFor(scene, characterBible, environment);
  console.log(`[sceneOrchestrator] ensureSceneGeneration scene=${scene.id} key=${sceneKey}`);

  // Deliberately not caching a null/failed result: if narration fails here
  // (e.g. a transient rate limit during the bulk pre-generation burst), the
  // NEXT call for this same scene — the player reaching it, or a later
  // pre-generation retry — should try again instead of staying silent
  // forever.
  if (!narrationCache.has(sceneKey)) {
    const audioUrl = await narrationGenerator.synthesize({ sceneKey, textHy: scene.narration });
    if (audioUrl) narrationCache.set(sceneKey, audioUrl);
  }

  const job = await videoGenerator.generateScene({
    sceneKey,
    narrationHy: scene.narration,
    actionEn: scene.action,
    mood: scene.mood,
    characterBible,
    environment,
  });

  return combine(job);
}

export async function getSceneStatus(sceneKey: string): Promise<SceneJob> {
  const job = await videoGenerator.getGenerationStatus(sceneKey);
  return combine(job);
}
