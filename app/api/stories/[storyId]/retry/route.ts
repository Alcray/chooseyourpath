import { eq } from "drizzle-orm";
import { getDb, getRawDb } from "../../../../../db";
import { clips, stories } from "../../../../../db/schema";
import { apiErrorResponse, GoogleApiError } from "../../../../lib/google";
import { validateStoryPackage } from "../../../../lib/story-compiler";
import {
  LEGACY_STORY_RECOMPILE_MESSAGE,
  classifyStoryPackageCompatibility,
} from "../../../../lib/story-migrations";
import {
  inspectStoredPlaybackMedia,
  summarizeCanonicalClipWorkflow,
} from "../../../../lib/story-media";
import {
  getOwnedStory,
  parseStoredStoryBrief,
  requestOwnerId,
  validateStoryPackageMatchesBrief,
} from "../../../../lib/story-store";

export async function POST(request: Request, context: { params: Promise<{ storyId: string }> }) {
  try {
    const { storyId } = await context.params;
    const ownerUserId = requestOwnerId(request);
    const story = await getOwnedStory(storyId, ownerUserId);
    if (!story) return Response.json({ error: "Story not found." }, { status: 404 });
    const brief = parseStoredStoryBrief(story.briefJson);

    let storedPlan: unknown;
    try {
      storedPlan = JSON.parse(story.planJson);
    } catch {
      throw new GoogleApiError("The stored story blueprint could not be read.", 422);
    }
    const compatibility = classifyStoryPackageCompatibility(storedPlan);
    if (
      compatibility.status === "legacy_requires_recompile" ||
      compatibility.status === "unversioned_requires_recompile"
    ) {
      throw new GoogleApiError(
        LEGACY_STORY_RECOMPILE_MESSAGE,
        409,
        false,
        "STORY_RECOMPILE_REQUIRED",
      );
    }
    if (compatibility.status === "incompatible") {
      throw new GoogleApiError("The stored story blueprint is incompatible or malformed.", 422);
    }
    const plan = validateStoryPackage(compatibility.storyPackage, { requireParentApproval: true });
    validateStoryPackageMatchesBrief(plan, brief);

    const db = getDb();
    const initialClips = await db.select().from(clips).where(eq(clips.storyId, storyId));
    const initialWorkflow = summarizeCanonicalClipWorkflow(initialClips, plan);
    if (!initialWorkflow) throw new GoogleApiError("The stored clip workflow is incomplete or malformed.", 422);
    const mediaInspection = await inspectStoredPlaybackMedia(storyId, initialClips, plan);
    const missingReadySlots = new Set(mediaInspection.missingSlots);
    const restartableClips = [...initialWorkflow.bySlot.values()].filter(
      (clip) => clip.status === "failed" || missingReadySlots.has(clip.slot as (typeof plan.clips)[number]["id"]),
    );

    const d1 = getRawDb();
    const claimResults = restartableClips.length > 0
      ? await d1.batch(
          restartableClips.map((clip, index) =>
            d1
              .prepare(
                "UPDATE clips SET status = ?, provider_job_id = NULL, extension_count = 0, r2_key = NULL, mime_type = NULL, error_message = NULL, updated_at = ? WHERE id = ? AND status = ? AND updated_at = ?",
              )
              .bind("starting", index, clip.id, clip.status, clip.updatedAt),
          ),
        )
      : [];
    const restartedCount = claimResults.filter(
      (result: { meta?: { changes?: number } }) => Number(result.meta?.changes ?? 0) === 1,
    ).length;

    const storedClips = await db.select().from(clips).where(eq(clips.storyId, storyId));
    const workflow = summarizeCanonicalClipWorkflow(storedClips, plan);
    if (!workflow) throw new GoogleApiError("The stored clip workflow is incomplete or malformed.", 422);
    const { status } = workflow;
    await db.update(stories).set({ status, updatedAt: Date.now() }).where(eq(stories.id, storyId));
    return Response.json({ ok: true, restartedCount }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
