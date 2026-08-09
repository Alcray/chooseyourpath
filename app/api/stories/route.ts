import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, getRawDb } from "../../../db";
import { blueprints, stories } from "../../../db/schema";
import { apiErrorResponse, GoogleApiError } from "../../lib/google";
import {
  CLIP_IDS,
  baseClipDuration,
  type StoryBrief,
} from "../../lib/story";
import { approveStoryPackageForRender, validateStoryPackage } from "../../lib/story-compiler";
import {
  LEGACY_BLUEPRINT_RECOMPILE_MESSAGE,
  classifyStoryPackageCompatibility,
} from "../../lib/story-migrations";
import { inspectStoredPlaybackMedia, summarizeCanonicalClipWorkflow } from "../../lib/story-media";
import {
  getStoryClips,
  parseStoredStoryBrief,
  requestOwnerId,
  storyPayload,
  type StoredStory,
  validateStoryPackageMatchesBrief,
  validateStoredStoryBrief,
} from "../../lib/story-store";
import { getVideoProvider } from "../../lib/video-provider";

const BLUEPRINT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type StartBody = { blueprintId: string; idempotencyKey: string; sensitiveTopicAcknowledged: boolean };

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

  if (typeof body.sensitiveTopicAcknowledged !== "boolean") {
    throw new GoogleApiError("Confirm whether the blueprint contains a sensitive topic.", 400);
  }

  return {
    blueprintId: body.blueprintId,
    idempotencyKey: body.idempotencyKey,
    sensitiveTopicAcknowledged: body.sensitiveTopicAcknowledged,
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

async function compatibleStoryPayload(story: StoredStory) {
  const storedClips = await getStoryClips(story.id);
  const brief = parseStoredStoryBrief(story.briefJson);
  let storedPlan: unknown;
  try {
    storedPlan = JSON.parse(story.planJson);
  } catch {
    throw new GoogleApiError("The stored story blueprint could not be read.", 422);
  }

  const compatibility = classifyStoryPackageCompatibility(storedPlan);
  try {
    if (compatibility.status === "current") {
      const plan = validateStoryPackage(compatibility.storyPackage, { requireParentApproval: true });
      validateStoryPackageMatchesBrief(plan, brief);
      const workflow = summarizeCanonicalClipWorkflow(storedClips, plan);
      if (!workflow) throw new GoogleApiError("The stored clip workflow is incomplete or malformed.", 422);
      const mediaInspection = await inspectStoredPlaybackMedia(story.id, storedClips, plan);
      if (mediaInspection.missingSlots.length > 0) {
        const unavailableSlots = new Set(mediaInspection.missingSlots);
        const unavailableClips = storedClips.map((clip) => ({
          ...clip,
          ...(unavailableSlots.has(clip.slot as (typeof CLIP_IDS)[number])
            ? {
                status: "failed",
                r2Key: null,
                errorMessage: "The stored video is unavailable and needs a retry.",
              }
            : {}),
        }));
        const unavailableStatus = workflow.status === "ready" ? "partial" : workflow.status;
        return storyPayload({ ...story, status: unavailableStatus }, unavailableClips, { plan, brief });
      }
      return storyPayload(
        { ...story, status: mediaInspection.complete ? "ready" : workflow.status },
        storedClips,
        { plan, brief },
      );
    }
    if (
      compatibility.status === "legacy_requires_recompile" ||
      compatibility.status === "unversioned_requires_recompile"
    ) {
      const mediaInspection = await inspectStoredPlaybackMedia(
        story.id,
        storedClips,
        compatibility.playablePlan,
      );
      const playbackReady = mediaInspection.complete;
      return storyPayload(
        playbackReady ? { ...story, status: "ready" } : story,
        storedClips,
        {
          plan: compatibility.playablePlan,
          brief,
          compatibility: playbackReady
            ? {
                mode: "playback_only",
                sourceSchemaVersion: compatibility.sourceSchemaVersion,
                providerActionsAllowed: false,
              }
            : {
                mode: "recompile_required",
                sourceSchemaVersion: compatibility.sourceSchemaVersion,
                targetSchemaVersion: "1.1",
                providerActionsAllowed: false,
              },
        },
      );
    }
  } catch (error) {
    if (error instanceof GoogleApiError) throw error;
    throw new GoogleApiError("The stored story record could not be read.", 422);
  }
  throw new GoogleApiError("The stored story blueprint is incompatible or malformed.", 422);
}

function normalizedApprovedPlanFingerprint(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const normalized = structuredClone(value) as Record<string, unknown>;
  delete normalized.parentReview;
  return JSON.stringify(normalized);
}

function assertIdempotentRequestMatches(
  payload: Awaited<ReturnType<typeof compatibleStoryPayload>>,
  brief: StoryBrief,
  approvedPlan: unknown,
) {
  if (
    JSON.stringify(payload.brief) !== JSON.stringify(brief) ||
    normalizedApprovedPlanFingerprint(payload.plan) !== normalizedApprovedPlanFingerprint(approvedPlan)
  ) {
    throw new GoogleApiError(
      "This request key was already used for a different story blueprint.",
      409,
      false,
      "IDEMPOTENCY_KEY_CONFLICT",
    );
  }
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
      { story: story ? await compatibleStoryPayload(story) : null },
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
    const brief = validateStoredStoryBrief(briefValue);
    const compatibility = classifyStoryPackageCompatibility(planValue);
    if (
      compatibility.status === "legacy_requires_recompile" ||
      compatibility.status === "unversioned_requires_recompile"
    ) {
      throw new GoogleApiError(
        LEGACY_BLUEPRINT_RECOMPILE_MESSAGE,
        409,
        false,
        "BLUEPRINT_RECOMPILE_REQUIRED",
      );
    }
    if (compatibility.status === "incompatible") {
      throw new GoogleApiError("The stored blueprint is incompatible or malformed.", 422);
    }
    const plan = approveStoryPackageForRender(compatibility.storyPackage, {
      sensitiveTopicAcknowledged: body.sensitiveTopicAcknowledged,
      reviewedAt: now,
    });
    validateStoryPackageMatchesBrief(plan, brief);
    const duplicate = await existingStory(ownerUserId, body.idempotencyKey);
    if (duplicate) {
      const duplicatePayload = await compatibleStoryPayload(duplicate);
      if (duplicatePayload.compatibility?.mode === "recompile_required") {
        throw new GoogleApiError(
          LEGACY_BLUEPRINT_RECOMPILE_MESSAGE,
          409,
          false,
          "STORY_RECOMPILE_REQUIRED",
        );
      }
      assertIdempotentRequestMatches(duplicatePayload, brief, plan);
      return Response.json({ story: duplicatePayload });
    }
    const videoProvider = getVideoProvider();

    const storyId = crypto.randomUUID();
    const d1 = getRawDb();
    const inserts = [
      d1
        .prepare(
          `INSERT OR IGNORE INTO stories
            (id, owner_user_id, idempotency_key, status, brief_json, plan_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
        ),
      ...CLIP_IDS.map((slot, index) =>
        d1
          .prepare(
            `INSERT OR IGNORE INTO clips (id, story_id, slot, status, extension_count, created_at, updated_at)
             SELECT ?, ?, ?, ?, ?, ?, ?
             WHERE EXISTS (
               SELECT 1 FROM stories WHERE id = ? AND owner_user_id = ? AND idempotency_key = ?
             )`,
          )
          .bind(
            crypto.randomUUID(),
            storyId,
            slot,
            "starting",
            0,
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
        const racedPayload = await compatibleStoryPayload(racedDuplicate);
        if (racedPayload.compatibility?.mode === "recompile_required") {
          throw new GoogleApiError(
            LEGACY_BLUEPRINT_RECOMPILE_MESSAGE,
            409,
            false,
            "STORY_RECOMPILE_REQUIRED",
          );
        }
        assertIdempotentRequestMatches(racedPayload, brief, plan);
        return Response.json({ story: racedPayload });
      }
      throw new GoogleApiError(
        "The story request could not be started. Please try again.",
        409,
        true,
      );
    }

    const starts = await Promise.allSettled(
      plan.clips.map(async (clip) => ({
        slot: clip.id,
        operationName: await videoProvider.start(clip.prompt, plan.continuitySeed, baseClipDuration(clip.id)),
      })),
    );

    const updates = starts.map((result, index) => {
      const slot = plan.clips[index].id;
      const expectedUpdatedAt = now + index;
      if (result.status === "fulfilled") {
        return d1
          .prepare(
            "UPDATE clips SET status = ?, provider_job_id = ?, error_message = NULL, updated_at = ? WHERE story_id = ? AND slot = ? AND status = ? AND updated_at = ? AND provider_job_id IS NULL",
          )
          .bind("rendering", result.value.operationName, Date.now(), storyId, slot, "starting", expectedUpdatedAt);
      }
      const message = result.reason instanceof Error ? result.reason.message : "Video generation could not start.";
      return d1
        .prepare(
          "UPDATE clips SET status = ?, error_message = ?, updated_at = ? WHERE story_id = ? AND slot = ? AND status = ? AND updated_at = ? AND provider_job_id IS NULL",
        )
        .bind("failed", message.slice(0, 500), Date.now(), storyId, slot, "starting", expectedUpdatedAt);
    });
    await d1.batch(updates);

    const storedClips = await getStoryClips(storyId);
    const workflow = summarizeCanonicalClipWorkflow(storedClips, plan);
    if (!workflow) throw new GoogleApiError("The stored clip workflow is incomplete or malformed.", 422);
    const { status } = workflow;
    await db
      .update(stories)
      .set({ status, updatedAt: Date.now() })
      .where(eq(stories.id, storyId));
    const [story] = await db.select().from(stories).where(eq(stories.id, storyId)).limit(1);
    return Response.json({ story: storyPayload(story, storedClips, { plan, brief }) }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
