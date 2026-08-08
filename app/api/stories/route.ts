import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, getRawDb } from "../../../db";
import { blueprints, stories } from "../../../db/schema";
import { apiErrorResponse, GoogleApiError } from "../../lib/google";
import {
  AGE_BANDS,
  CHARACTER_PAIRS,
  CLIP_IDS,
  LANGUAGES,
  SETTINGS,
  type StoryBrief,
  type StoryPlan,
} from "../../lib/story";
import { getStoryClips, requestOwnerId, storyPayload } from "../../lib/story-store";
import { startVeoClip } from "../../lib/veo";

const BLUEPRINT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const STORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_NEW_STORIES_PER_WINDOW = 3;

type StartBody = { blueprintId: string; idempotencyKey: string };

function authenticatedOwnerId(request: Request) {
  try {
    return requestOwnerId(request);
  } catch {
    throw new GoogleApiError("Please sign in to use the parent story studio.", 401);
  }
}

function validateBody(value: unknown): StartBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GoogleApiError("A valid story request is required.", 400);
  }

  const body = value as Record<string, unknown>;
  if (typeof body.blueprintId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.blueprintId)) {
    throw new GoogleApiError("A valid blueprint is required.", 400);
  }
  if (
    typeof body.idempotencyKey !== "string" ||
    !/^[A-Za-z0-9._:-]{8,100}$/.test(body.idempotencyKey)
  ) {
    throw new GoogleApiError("A valid request key is required.", 400);
  }

  return { blueprintId: body.blueprintId, idempotencyKey: body.idempotencyKey };
}

function boundedString(value: unknown, name: string, min: number, max: number) {
  if (typeof value !== "string") throw new GoogleApiError(`The blueprint has an invalid ${name}.`, 422);
  const result = value.trim();
  if (result.length < min || result.length > max) {
    throw new GoogleApiError(`The blueprint has an invalid ${name}.`, 422);
  }
  return result;
}

function validateStoredBrief(value: unknown): StoryBrief {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GoogleApiError("The stored story brief is invalid.", 422);
  }
  const brief = value as Record<string, unknown>;
  const lesson = boundedString(brief.lesson, "lesson", 8, 500);
  const characterPairId = boundedString(brief.characterPairId, "character pair", 1, 50);
  const settingId = boundedString(brief.settingId, "setting", 1, 50);
  const ageBand = boundedString(brief.ageBand, "age band", 1, 20);
  const language = boundedString(brief.language, "language", 1, 30);

  if (!CHARACTER_PAIRS.some((pair) => pair.id === characterPairId)) {
    throw new GoogleApiError("The stored character pair is invalid.", 422);
  }
  if (!SETTINGS.some((setting) => setting.id === settingId)) {
    throw new GoogleApiError("The stored setting is invalid.", 422);
  }
  if (!AGE_BANDS.some((age) => age.id === ageBand)) {
    throw new GoogleApiError("The stored age band is invalid.", 422);
  }
  if (!LANGUAGES.some((option) => option.id === language)) {
    throw new GoogleApiError("The stored language is invalid.", 422);
  }

  return { lesson, characterPairId, settingId, ageBand, language };
}

function validateStoredPlan(value: unknown): StoryPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GoogleApiError("The stored story blueprint is invalid.", 422);
  }
  const plan = value as Record<string, unknown>;
  if (!Number.isInteger(plan.continuitySeed) || (plan.continuitySeed as number) < 0 || (plan.continuitySeed as number) > 0xffff_ffff) {
    throw new GoogleApiError("The blueprint continuity seed is invalid.", 422);
  }
  if (!Array.isArray(plan.clips) || plan.clips.length !== CLIP_IDS.length) {
    throw new GoogleApiError("The blueprint must contain exactly four clips.", 422);
  }

  const byId = new Map<string, Record<string, unknown>>();
  for (const candidate of plan.clips) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new GoogleApiError("The blueprint contains an invalid clip.", 422);
    }
    const clip = candidate as Record<string, unknown>;
    if (typeof clip.id !== "string" || !CLIP_IDS.includes(clip.id as (typeof CLIP_IDS)[number]) || byId.has(clip.id)) {
      throw new GoogleApiError("The blueprint clip roles must be exact and unique.", 422);
    }
    byId.set(clip.id, clip);
  }
  if (!CLIP_IDS.every((id) => byId.has(id))) {
    throw new GoogleApiError("The blueprint is missing a required clip role.", 422);
  }

  const positiveChoice = plan.positiveChoice;
  const negativeChoice = plan.negativeChoice;
  if (
    !positiveChoice ||
    typeof positiveChoice !== "object" ||
    Array.isArray(positiveChoice) ||
    !negativeChoice ||
    typeof negativeChoice !== "object" ||
    Array.isArray(negativeChoice)
  ) {
    throw new GoogleApiError("The blueprint choices are invalid.", 422);
  }

  const positive = positiveChoice as Record<string, unknown>;
  const negative = negativeChoice as Record<string, unknown>;
  return {
    title: boundedString(plan.title, "title", 1, 120),
    parentSummary: boundedString(plan.parentSummary, "parent summary", 1, 600),
    childIntro: boundedString(plan.childIntro, "child introduction", 1, 500),
    choiceQuestion: boundedString(plan.choiceQuestion, "choice question", 1, 300),
    positiveChoice: {
      label: boundedString(positive.label, "positive choice label", 1, 100),
      explanation: boundedString(positive.explanation, "positive choice explanation", 1, 500),
    },
    negativeChoice: {
      label: boundedString(negative.label, "negative choice label", 1, 100),
      explanation: boundedString(negative.explanation, "negative choice explanation", 1, 500),
    },
    continuitySeed: plan.continuitySeed as number,
    clips: CLIP_IDS.map((id) => {
      const clip = byId.get(id)!;
      return {
        id,
        title: boundedString(clip.title, `${id} clip title`, 1, 100),
        summary: boundedString(clip.summary, `${id} clip summary`, 1, 500),
        prompt: boundedString(clip.prompt, `${id} clip prompt`, 80, 6000),
        caption: boundedString(clip.caption, `${id} clip caption`, 1, 1200),
      };
    }),
  };
}

async function existingStory(ownerUserId: string, idempotencyKey: string) {
  const [story] = await getDb()
    .select()
    .from(stories)
    .where(and(eq(stories.ownerUserId, ownerUserId), eq(stories.idempotencyKey, idempotencyKey)))
    .limit(1);
  return story ?? null;
}

export async function GET(request: Request) {
  try {
    const ownerUserId = authenticatedOwnerId(request);
    const [story] = await getDb()
      .select()
      .from(stories)
      .where(eq(stories.ownerUserId, ownerUserId))
      .orderBy(desc(stories.updatedAt))
      .limit(1);

    return Response.json(
      { story: story ? storyPayload(story, await getStoryClips(story.id)) : null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ownerUserId = authenticatedOwnerId(request);
    let requestBody: unknown;
    try {
      requestBody = await request.json();
    } catch {
      throw new GoogleApiError("Send a valid story request.", 400);
    }
    const body = validateBody(requestBody);
    const duplicate = await existingStory(ownerUserId, body.idempotencyKey);
    if (duplicate) {
      return Response.json({ story: storyPayload(duplicate, await getStoryClips(duplicate.id)) });
    }

    const now = Date.now();
    const db = getDb();
    const [blueprint] = await db
      .select()
      .from(blueprints)
      .where(
        and(
          eq(blueprints.id, body.blueprintId),
          eq(blueprints.ownerUserId, ownerUserId),
          gte(blueprints.createdAt, now - BLUEPRINT_MAX_AGE_MS),
        ),
      )
      .limit(1);
    if (!blueprint) {
      throw new GoogleApiError("This blueprint is unavailable or has expired. Create a new blueprint.", 404);
    }

    let briefValue: unknown;
    let planValue: unknown;
    try {
      briefValue = JSON.parse(blueprint.briefJson);
      planValue = JSON.parse(blueprint.planJson);
    } catch {
      throw new GoogleApiError("The stored blueprint could not be read. Create a new blueprint.", 422);
    }
    const brief = validateStoredBrief(briefValue);
    const plan = validateStoredPlan(planValue);

    const storyId = crypto.randomUUID();
    const d1 = getRawDb();
    const inserts = [
      d1
        .prepare(
          `INSERT OR IGNORE INTO stories
            (id, owner_user_id, idempotency_key, status, brief_json, plan_json, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?
           WHERE (SELECT COUNT(*) FROM stories WHERE owner_user_id = ? AND created_at >= ?) < ?`,
        )
        .bind(
          storyId,
          ownerUserId,
          body.idempotencyKey,
          "starting",
          JSON.stringify(brief),
          JSON.stringify(plan),
          now,
          now,
          ownerUserId,
          now - STORY_WINDOW_MS,
          MAX_NEW_STORIES_PER_WINDOW,
        ),
      ...CLIP_IDS.map((slot, index) =>
        d1
          .prepare(
            `INSERT OR IGNORE INTO clips (id, story_id, slot, status, created_at, updated_at)
             SELECT ?, ?, ?, ?, ?, ?
             WHERE EXISTS (
               SELECT 1 FROM stories WHERE id = ? AND owner_user_id = ? AND idempotency_key = ?
             )`,
          )
          .bind(
            crypto.randomUUID(),
            storyId,
            slot,
            "starting",
            now + index,
            now + index,
            storyId,
            ownerUserId,
            body.idempotencyKey,
          ),
      ),
    ];
    const insertResults = await d1.batch(inserts);
    const acquired = Number(insertResults[0]?.meta?.changes ?? 0) === 1;

    if (!acquired) {
      const racedDuplicate = await existingStory(ownerUserId, body.idempotencyKey);
      if (racedDuplicate) {
        return Response.json({ story: storyPayload(racedDuplicate, await getStoryClips(racedDuplicate.id)) });
      }
      throw new GoogleApiError(
        "You can generate up to three new stories every 24 hours. Please try again later.",
        429,
      );
    }

    const starts = await Promise.allSettled(
      plan.clips.map(async (clip) => ({
        slot: clip.id,
        operationName: await startVeoClip(clip.prompt, plan.continuitySeed),
      })),
    );

    const updates = starts.map((result, index) => {
      const slot = plan.clips[index].id;
      if (result.status === "fulfilled") {
        return d1
          .prepare("UPDATE clips SET status = ?, provider_job_id = ?, error_message = NULL, updated_at = ? WHERE story_id = ? AND slot = ?")
          .bind("rendering", result.value.operationName, Date.now(), storyId, slot);
      }
      const message = result.reason instanceof Error ? result.reason.message : "Video generation could not start.";
      return d1
        .prepare("UPDATE clips SET status = ?, error_message = ?, updated_at = ? WHERE story_id = ? AND slot = ?")
        .bind("failed", message.slice(0, 500), Date.now(), storyId, slot);
    });
    await d1.batch(updates);

    const failedCount = starts.filter((result) => result.status === "rejected").length;
    await db
      .update(stories)
      .set({ status: failedCount === CLIP_IDS.length ? "failed" : "rendering", updatedAt: Date.now() })
      .where(eq(stories.id, storyId));
    const [story] = await db.select().from(stories).where(eq(stories.id, storyId)).limit(1);
    return Response.json({ story: storyPayload(story, await getStoryClips(storyId)) }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
