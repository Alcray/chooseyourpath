import { and, asc, eq } from "drizzle-orm";
import { clips, stories } from "../../db/schema";
import { getDb } from "../../db";
import { CLIP_IDS, type ClipId, type StoryBrief, type StoryPlan } from "./story";
import { GoogleApiError } from "./google";

export type StoredClip = typeof clips.$inferSelect;
export type StoredStory = typeof stories.$inferSelect;

export function requestOwnerId(request: Request) {
  const ownerId = request.headers.get("oai-authenticated-user-id");
  if (ownerId) return ownerId;
  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") return "local-preview-user";
  throw new GoogleApiError("Please sign in to use the parent story studio.", 401);
}

export async function getOwnedStory(storyId: string, ownerUserId: string) {
  const [story] = await getDb()
    .select()
    .from(stories)
    .where(and(eq(stories.id, storyId), eq(stories.ownerUserId, ownerUserId)))
    .limit(1);
  return story ?? null;
}

export async function getStoryClips(storyId: string) {
  return getDb().select().from(clips).where(eq(clips.storyId, storyId)).orderBy(asc(clips.createdAt));
}

export function storyPayload(story: StoredStory, storedClips: StoredClip[]) {
  const plan = JSON.parse(story.planJson) as StoryPlan;
  const brief = JSON.parse(story.briefJson) as StoryBrief;
  const bySlot = new Map(storedClips.map((clip) => [clip.slot, clip]));

  return {
    id: story.id,
    status: story.status,
    createdAt: story.createdAt,
    plan,
    brief,
    clips: CLIP_IDS.map((slot) => {
      const clip = bySlot.get(slot);
      return {
        slot,
        status: clip?.status ?? "starting",
        extensionCount: clip?.extensionCount ?? 0,
        error: clip?.errorMessage ?? null,
        mediaUrl: clip?.status === "ready" ? `/api/stories/${story.id}/clips/${slot}` : null,
      };
    }),
  };
}

export function clipPrompt(plan: StoryPlan, slot: ClipId) {
  const clip = plan.clips.find((candidate) => candidate.id === slot);
  if (!clip) throw new Error(`Missing ${slot} prompt.`);
  return clip.prompt;
}
