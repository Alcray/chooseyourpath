import { and, asc, eq, inArray, lt, or } from "drizzle-orm";
import { getDb, getRawDb } from "../../../../db";
import { clips, stories } from "../../../../db/schema";
import { apiErrorResponse, getMediaBucket } from "../../../lib/google";
import { isClipId, type StoryPlan } from "../../../lib/story";
import { clipPrompt, getOwnedStory, getStoryClips, requestOwnerId, storyPayload } from "../../../lib/story-store";
import { decodeBase64Video, pollVeoClip, startVeoClip } from "../../../lib/veo";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ storyId: string }> }) {
  try {
    const { storyId } = await context.params;
    const ownerUserId = requestOwnerId(request);
    const story = await getOwnedStory(storyId, ownerUserId);
    if (!story) return Response.json({ error: "Story not found." }, { status: 404 });

    const db = getDb();
    const staleIngestionBefore = Date.now() - 2 * 60 * 1000;
    const [nextClip] = await db
      .select()
      .from(clips)
      .where(
        and(
          eq(clips.storyId, storyId),
          or(
            inArray(clips.status, ["starting", "rendering"]),
            and(eq(clips.status, "ingesting"), lt(clips.updatedAt, staleIngestionBefore)),
          ),
        ),
      )
      .orderBy(asc(clips.updatedAt))
      .limit(1);

    if (nextClip && isClipId(nextClip.slot)) {
      if (!nextClip.providerJobId) {
        const plan = JSON.parse(story.planJson) as StoryPlan;
        try {
          const operationName = await startVeoClip(clipPrompt(plan, nextClip.slot), plan.continuitySeed);
          await db.update(clips).set({ status: "rendering", providerJobId: operationName, errorMessage: null, updatedAt: Date.now() }).where(eq(clips.id, nextClip.id));
        } catch (startError) {
          const message = startError instanceof Error ? startError.message : "Video generation could not start.";
          await db.update(clips).set({ status: "failed", errorMessage: message.slice(0, 500), updatedAt: Date.now() }).where(eq(clips.id, nextClip.id));
        }
      } else {
        const result = await pollVeoClip(nextClip.providerJobId);
        if (!result.done) {
          await db.update(clips).set({ status: "rendering", updatedAt: Date.now() }).where(eq(clips.id, nextClip.id));
        } else if (result.video) {
          const claimTime = Date.now();
          const claim = await getRawDb()
            .prepare(
              "UPDATE clips SET status = ?, updated_at = ? WHERE id = ? AND (status = ? OR (status = ? AND updated_at = ?))",
            )
            .bind("ingesting", claimTime, nextClip.id, "rendering", "ingesting", nextClip.updatedAt)
            .run();
          if ((claim.meta.changes ?? 0) === 0) {
            return Response.json(
              { story: storyPayload(story, await getStoryClips(storyId)) },
              { headers: { "Cache-Control": "no-store" } },
            );
          }
          const r2Key = `stories/${storyId}/${nextClip.slot}.mp4`;
          await getMediaBucket().put(r2Key, decodeBase64Video(result.video.base64), {
            httpMetadata: { contentType: result.video.mimeType, contentDisposition: "inline" },
          });
          await db.update(clips).set({ status: "ready", r2Key, mimeType: result.video.mimeType, errorMessage: null, updatedAt: Date.now() }).where(eq(clips.id, nextClip.id));
        } else {
          await db.update(clips).set({ status: "failed", errorMessage: (result.error ?? "Video generation failed.").slice(0, 500), updatedAt: Date.now() }).where(eq(clips.id, nextClip.id));
        }
      }
    }

    const storedClips = await getStoryClips(storyId);
    const readyCount = storedClips.filter((clip) => clip.status === "ready").length;
    const activeCount = storedClips.filter((clip) => clip.status === "starting" || clip.status === "rendering" || clip.status === "ingesting").length;
    const failedCount = storedClips.filter((clip) => clip.status === "failed").length;
    const status = readyCount === 4 ? "ready" : activeCount > 0 ? "rendering" : failedCount > 0 ? "partial" : "starting";
    await db.update(stories).set({ status, updatedAt: Date.now() }).where(eq(stories.id, storyId));
    const refreshedStory = { ...story, status, updatedAt: Date.now() };

    return Response.json(
      { story: storyPayload(refreshedStory, storedClips) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
