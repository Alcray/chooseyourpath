import { and, eq } from "drizzle-orm";
import { getDb, getRawDb } from "../../../../../db";
import { clips, stories } from "../../../../../db/schema";
import { apiErrorResponse } from "../../../../lib/google";
import { CLIP_IDS, isClipId } from "../../../../lib/story";
import { getOwnedStory, requestOwnerId } from "../../../../lib/story-store";

export async function POST(request: Request, context: { params: Promise<{ storyId: string }> }) {
  try {
    const { storyId } = await context.params;
    const ownerUserId = requestOwnerId(request);
    const story = await getOwnedStory(storyId, ownerUserId);
    if (!story) return Response.json({ error: "Story not found." }, { status: 404 });

    const db = getDb();
    const failedClips = await db.select().from(clips).where(and(eq(clips.storyId, storyId), eq(clips.status, "failed")));
    const validFailedClips = failedClips.filter((clip) => isClipId(clip.slot));

    const d1 = getRawDb();
    const claimResults = validFailedClips.length > 0
      ? await d1.batch(
          validFailedClips.map((clip, index) =>
            d1
              .prepare(
                "UPDATE clips SET status = ?, provider_job_id = NULL, extension_count = 0, r2_key = NULL, mime_type = NULL, error_message = NULL, updated_at = ? WHERE id = ? AND status = ?",
              )
              .bind("starting", index, clip.id, "failed"),
          ),
        )
      : [];
    const restartedCount = claimResults.filter(
      (result: { meta?: { changes?: number } }) => Number(result.meta?.changes ?? 0) === 1,
    ).length;

    const storedClips = await db.select().from(clips).where(eq(clips.storyId, storyId));
    const readyCount = storedClips.filter((clip) => clip.status === "ready").length;
    const activeCount = storedClips.filter((clip) =>
      clip.status === "starting" || clip.status === "rendering" || clip.status === "extension_retry" || clip.status === "extending" || clip.status === "ingesting"
    ).length;
    const failedCount = storedClips.filter((clip) => clip.status === "failed").length;
    const status = readyCount === CLIP_IDS.length ? "ready" : activeCount > 0 ? "rendering" : failedCount > 0 ? "partial" : "starting";
    await db.update(stories).set({ status, updatedAt: Date.now() }).where(eq(stories.id, storyId));
    return Response.json({ ok: true, restartedCount }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
