import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { clips, stories } from "../../../../../db/schema";
import { apiErrorResponse } from "../../../../lib/google";
import { isClipId, type StoryPlan } from "../../../../lib/story";
import { clipPrompt, getOwnedStory, requestOwnerId } from "../../../../lib/story-store";
import { startVeoClip } from "../../../../lib/veo";

export async function POST(request: Request, context: { params: Promise<{ storyId: string }> }) {
  try {
    const { storyId } = await context.params;
    const ownerUserId = requestOwnerId(request);
    const story = await getOwnedStory(storyId, ownerUserId);
    if (!story) return Response.json({ error: "Story not found." }, { status: 404 });

    const db = getDb();
    const failedClips = await db.select().from(clips).where(and(eq(clips.storyId, storyId), eq(clips.status, "failed")));
    const plan = JSON.parse(story.planJson) as StoryPlan;

    const results = await Promise.allSettled(
      failedClips.filter((clip) => isClipId(clip.slot)).map(async (clip) => {
        if (!isClipId(clip.slot)) throw new Error("Invalid clip role.");
        return {
          id: clip.id,
          operationName: await startVeoClip(clipPrompt(plan, clip.slot), plan.continuitySeed),
        };
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        await db.update(clips).set({ status: "rendering", providerJobId: result.value.operationName, errorMessage: null, updatedAt: Date.now() }).where(eq(clips.id, result.value.id));
      }
    }
    await db.update(stories).set({ status: "rendering", updatedAt: Date.now() }).where(eq(stories.id, storyId));
    return Response.json({ ok: true }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
