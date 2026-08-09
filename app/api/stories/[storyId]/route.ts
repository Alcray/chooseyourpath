import { and, asc, eq, inArray, lt, or } from "drizzle-orm";
import { getDb, getRawDb } from "../../../../db";
import { clips, stories } from "../../../../db/schema";
import { apiErrorResponse, getMediaBucket, GoogleApiError } from "../../../lib/google";
import { decodeValidatedProviderVideo } from "../../../lib/provider-media";
import { CLIP_IDS, baseClipDuration, isClipId } from "../../../lib/story";
import { validateStoryPackage } from "../../../lib/story-compiler";
import {
  LEGACY_STORY_RECOMPILE_MESSAGE,
  classifyStoryPackageCompatibility,
} from "../../../lib/story-migrations";
import {
  canonicalStoryMediaKey,
  inspectStoredPlaybackMedia,
  summarizeCanonicalClipWorkflow,
} from "../../../lib/story-media";
import {
  getOwnedStory,
  getStoryClips,
  parseStoredStoryBrief,
  requestOwnerId,
  storyPayload,
  validateStoryPackageMatchesBrief,
} from "../../../lib/story-store";
import { getVideoProvider, type ProviderPollResult } from "../../../lib/video-provider";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ storyId: string }> }) {
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
    let initiallyStoredClips = await getStoryClips(storyId);
    if (
      compatibility.status === "legacy_requires_recompile" ||
      compatibility.status === "unversioned_requires_recompile"
    ) {
      const legacyMediaInspection = await inspectStoredPlaybackMedia(
        storyId,
        initiallyStoredClips,
        compatibility.playablePlan,
      );
      if (!legacyMediaInspection.complete) {
        throw new GoogleApiError(
          LEGACY_STORY_RECOMPILE_MESSAGE,
          409,
          false,
          "STORY_RECOMPILE_REQUIRED",
        );
      }
      return Response.json(
        {
          story: storyPayload(
            { ...story, status: "ready" },
            initiallyStoredClips,
            {
              plan: compatibility.playablePlan,
              brief,
              compatibility: {
                mode: "playback_only",
                sourceSchemaVersion: compatibility.sourceSchemaVersion,
                providerActionsAllowed: false,
              },
            },
          ),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (compatibility.status === "incompatible") {
      throw new GoogleApiError("The stored story blueprint is incompatible or malformed.", 422);
    }

    const plan = validateStoryPackage(compatibility.storyPackage, { requireParentApproval: true });
    validateStoryPackageMatchesBrief(plan, brief);
    const initialWorkflow = summarizeCanonicalClipWorkflow(initiallyStoredClips, plan);
    if (!initialWorkflow) {
      throw new GoogleApiError("The stored clip workflow is incomplete or malformed.", 422);
    }
    const mediaInspection = await inspectStoredPlaybackMedia(storyId, initiallyStoredClips, plan);
    const playbackMediaReady = mediaInspection.complete;
    const repairedMissingMedia = mediaInspection.missingSlots.length > 0;
    if (repairedMissingMedia) {
      const repairTime = Date.now();
      const d1 = getRawDb();
      await d1.batch(
        mediaInspection.missingSlots.map((slot, index) => {
          const clip = initialWorkflow.bySlot.get(slot)!;
          return d1
            .prepare(
              "UPDATE clips SET status = ?, provider_job_id = NULL, extension_count = 0, r2_key = NULL, mime_type = NULL, error_message = ?, updated_at = ? WHERE id = ? AND story_id = ? AND slot = ? AND status = ? AND updated_at = ?",
            )
            .bind(
              "failed",
              "The stored video is missing or invalid. Retry this clip.",
              repairTime + index,
              clip.id,
              storyId,
              slot,
              "ready",
              clip.updatedAt,
            );
        }),
      );
      initiallyStoredClips = await getStoryClips(storyId);
    }
    if (playbackMediaReady) {
      if (story.status !== "ready") {
        await getDb().update(stories).set({ status: "ready", updatedAt: Date.now() }).where(eq(stories.id, storyId));
      }
      return Response.json(
        { story: storyPayload({ ...story, status: "ready" }, initiallyStoredClips, { plan, brief }) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const repairedWorkflow = summarizeCanonicalClipWorkflow(initiallyStoredClips, plan);
    if (!repairedWorkflow) {
      throw new GoogleApiError("The stored clip workflow is incomplete or malformed.", 422);
    }
    if (repairedMissingMedia) {
      const updatedAt = Date.now();
      await getDb()
        .update(stories)
        .set({ status: repairedWorkflow.status, updatedAt })
        .where(eq(stories.id, storyId));
      return Response.json(
        {
          story: storyPayload(
            { ...story, status: repairedWorkflow.status, updatedAt },
            initiallyStoredClips,
            { plan, brief },
          ),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const db = getDb();
    const d1 = getRawDb();
    const staleStartBefore = Date.now() - 2 * 60 * 1000;
    const stalePollBefore = Date.now() - 10 * 1000;
    const staleExtensionBefore = Date.now() - 2 * 60 * 1000;
    const staleIngestionBefore = Date.now() - 2 * 60 * 1000;
    const [nextClip] = await db
      .select()
      .from(clips)
      .where(
        and(
          eq(clips.storyId, storyId),
          inArray(clips.slot, [...CLIP_IDS]),
          or(
            and(eq(clips.status, "starting"), lt(clips.updatedAt, staleStartBefore)),
            and(eq(clips.status, "rendering"), lt(clips.updatedAt, stalePollBefore)),
            and(eq(clips.status, "extension_retry"), lt(clips.updatedAt, stalePollBefore)),
            and(eq(clips.status, "extending"), lt(clips.updatedAt, staleExtensionBefore)),
            and(eq(clips.status, "ingesting"), lt(clips.updatedAt, staleIngestionBefore)),
          ),
        ),
      )
      .orderBy(asc(clips.updatedAt))
      .limit(1);

    if (nextClip && isClipId(nextClip.slot)) {
      const videoProvider = getVideoProvider();
      const planClip = plan.clips.find((clip) => clip.id === nextClip.slot);
      if (!planClip) throw new GoogleApiError(`The ${nextClip.slot} prompt is missing.`, 422);
      const extensions = Array.isArray(planClip.extensions) ? planClip.extensions : [];

      if (!nextClip.providerJobId) {
        const claimTime = Date.now();
        const claim = await d1
          .prepare(
            "UPDATE clips SET status = ?, updated_at = ? WHERE id = ? AND status = ? AND extension_count = ? AND updated_at = ? AND provider_job_id IS NULL",
          )
          .bind("starting", claimTime, nextClip.id, nextClip.status, nextClip.extensionCount, nextClip.updatedAt)
          .run();

        if (Number(claim.meta.changes ?? 0) === 1) {
          try {
            const operationName = await videoProvider.start(
              planClip.prompt,
              plan.continuitySeed,
              extensions.length === 2 ? baseClipDuration(nextClip.slot) : 8,
            );
            await d1
              .prepare(
                "UPDATE clips SET status = ?, provider_job_id = ?, error_message = NULL, updated_at = ? WHERE id = ? AND status = ? AND extension_count = ? AND updated_at = ? AND provider_job_id IS NULL",
              )
              .bind("rendering", operationName, Date.now(), nextClip.id, "starting", nextClip.extensionCount, claimTime)
              .run();
          } catch (startError) {
            const message = startError instanceof Error ? startError.message : "Video generation could not start.";
            await d1
              .prepare(
                "UPDATE clips SET status = ?, error_message = ?, updated_at = ? WHERE id = ? AND status = ? AND extension_count = ? AND updated_at = ? AND provider_job_id IS NULL",
              )
              .bind("failed", message.slice(0, 500), Date.now(), nextClip.id, "starting", nextClip.extensionCount, claimTime)
              .run();
          }
        }
      } else {
        const pollClaimTime = Date.now();
        const pollClaim = await d1
          .prepare(
            "UPDATE clips SET updated_at = ? WHERE id = ? AND status = ? AND provider_job_id = ? AND extension_count = ? AND updated_at = ?",
          )
          .bind(
            pollClaimTime,
            nextClip.id,
            nextClip.status,
            nextClip.providerJobId,
            nextClip.extensionCount,
            nextClip.updatedAt,
          )
          .run();

        if (Number(pollClaim.meta.changes ?? 0) === 1) {
          let result: ProviderPollResult;
          let transientMessage: string | null = null;
          try {
            result = await videoProvider.poll(nextClip.providerJobId);
          } catch (pollError) {
            const retryable =
              pollError instanceof TypeError ||
              (pollError instanceof GoogleApiError && pollError.retryable);
            if (retryable) {
              transientMessage = "Video status is temporarily unavailable. Retrying automatically.";
              result = { done: false };
            } else {
              const message = pollError instanceof Error ? pollError.message : "Video status could not be checked.";
              result = { done: true, error: message };
            }
          }
          const providerResultVideo = result.done && result.video ? result.video : null;
          const completedVideo = providerResultVideo
            ? decodeValidatedProviderVideo(providerResultVideo, (video) => videoProvider.decode(video))
            : null;

          if (!result.done) {
            await d1
              .prepare(
                "UPDATE clips SET status = ?, error_message = ?, updated_at = ? WHERE id = ? AND status = ? AND provider_job_id = ? AND extension_count = ? AND updated_at = ?",
              )
              .bind(
                nextClip.status === "extension_retry" ? "extension_retry" : "rendering",
                transientMessage,
                Date.now(),
                nextClip.id,
                nextClip.status,
                nextClip.providerJobId,
                nextClip.extensionCount,
                pollClaimTime,
              )
              .run();
          } else if (providerResultVideo && !completedVideo) {
            await d1
              .prepare(
                "UPDATE clips SET status = ?, error_message = ?, updated_at = ? WHERE id = ? AND status = ? AND provider_job_id = ? AND extension_count = ? AND updated_at = ?",
              )
              .bind(
                "failed",
                "The generation provider returned an invalid video. Please retry this clip.",
                Date.now(),
                nextClip.id,
                nextClip.status,
                nextClip.providerJobId,
                nextClip.extensionCount,
                pollClaimTime,
              )
              .run();
          } else if (completedVideo && nextClip.extensionCount < extensions.length) {
            const extension = extensions[nextClip.extensionCount];
            const extensionClaimTime = Date.now();
            const extensionClaim = await d1
              .prepare(
                "UPDATE clips SET status = ?, error_message = NULL, updated_at = ? WHERE id = ? AND status = ? AND provider_job_id = ? AND extension_count = ? AND updated_at = ?",
              )
              .bind(
                "extending",
                extensionClaimTime,
                nextClip.id,
                nextClip.status,
                nextClip.providerJobId,
                nextClip.extensionCount,
                pollClaimTime,
              )
              .run();
            if (Number(extensionClaim.meta.changes ?? 0) === 0) {
              return Response.json(
                { story: storyPayload(story, await getStoryClips(storyId), { plan, brief }) },
                { headers: { "Cache-Control": "no-store" } },
              );
            }

            try {
              const operationName = await videoProvider.extend(completedVideo.video, extension.prompt);
              await d1
                .prepare(
                  "UPDATE clips SET status = ?, provider_job_id = ?, extension_count = ?, error_message = NULL, updated_at = ? WHERE id = ? AND status = ? AND provider_job_id = ? AND extension_count = ? AND updated_at = ?",
                )
                .bind(
                  "rendering",
                  operationName,
                  nextClip.extensionCount + 1,
                  Date.now(),
                  nextClip.id,
                  "extending",
                  nextClip.providerJobId,
                  nextClip.extensionCount,
                  extensionClaimTime,
                )
                .run();
            } catch (extensionError) {
              const retryable =
                extensionError instanceof TypeError ||
                (extensionError instanceof GoogleApiError && extensionError.retryable);
              const message = extensionError instanceof Error ? extensionError.message : "The video extension could not start.";
              await d1
                .prepare(
                  "UPDATE clips SET status = ?, error_message = ?, updated_at = ? WHERE id = ? AND status = ? AND provider_job_id = ? AND extension_count = ? AND updated_at = ?",
                )
                .bind(
                  retryable ? "extension_retry" : "failed",
                  retryable
                    ? "The next seven seconds were briefly interrupted. Retrying automatically."
                    : message.slice(0, 500),
                  Date.now(),
                  nextClip.id,
                  "extending",
                  nextClip.providerJobId,
                  nextClip.extensionCount,
                  extensionClaimTime,
                )
                .run();
            }
          } else if (completedVideo) {
            const claimTime = Date.now();
            const claim = await d1
              .prepare(
                "UPDATE clips SET status = ?, updated_at = ? WHERE id = ? AND status = ? AND provider_job_id = ? AND extension_count = ? AND updated_at = ?",
              )
              .bind(
                "ingesting",
                claimTime,
                nextClip.id,
                nextClip.status,
                nextClip.providerJobId,
                nextClip.extensionCount,
                pollClaimTime,
              )
              .run();
            if ((claim.meta.changes ?? 0) === 0) {
              return Response.json(
                { story: storyPayload(story, await getStoryClips(storyId), { plan, brief }) },
                { headers: { "Cache-Control": "no-store" } },
              );
            }

            const r2Key = canonicalStoryMediaKey(storyId, nextClip.slot);
            try {
              await getMediaBucket().put(r2Key, completedVideo.bytes, {
                httpMetadata: { contentType: "video/mp4", contentDisposition: "inline" },
              });
              await d1
                .prepare(
                  "UPDATE clips SET status = ?, r2_key = ?, mime_type = ?, error_message = NULL, updated_at = ? WHERE id = ? AND status = ? AND provider_job_id = ? AND extension_count = ? AND updated_at = ?",
                )
                .bind(
                  "ready",
                  r2Key,
                  "video/mp4",
                  Date.now(),
                  nextClip.id,
                  "ingesting",
                  nextClip.providerJobId,
                  nextClip.extensionCount,
                  claimTime,
                )
                .run();
            } catch (storageError) {
              const retryableStorage = !(storageError instanceof GoogleApiError) || storageError.retryable;
              await d1
                .prepare(
                  "UPDATE clips SET status = ?, error_message = ?, updated_at = ? WHERE id = ? AND status = ? AND provider_job_id = ? AND extension_count = ? AND updated_at = ?",
                )
                .bind(
                  retryableStorage ? "rendering" : "failed",
                  retryableStorage
                    ? "The clip finished, but secure saving was interrupted. Retrying automatically."
                    : "Generated-media storage is unavailable. Please retry after it is configured.",
                  Date.now(),
                  nextClip.id,
                  "ingesting",
                  nextClip.providerJobId,
                  nextClip.extensionCount,
                  claimTime,
                )
                .run();
            }
          } else {
            await d1
              .prepare(
                "UPDATE clips SET status = ?, error_message = ?, updated_at = ? WHERE id = ? AND status = ? AND provider_job_id = ? AND extension_count = ? AND updated_at = ?",
              )
              .bind(
                "failed",
                (result.error ?? "Video generation failed.").slice(0, 500),
                Date.now(),
                nextClip.id,
                nextClip.status,
                nextClip.providerJobId,
                nextClip.extensionCount,
                pollClaimTime,
              )
              .run();
          }
        }
      }
    }

    const storedClips = await getStoryClips(storyId);
    const workflow = summarizeCanonicalClipWorkflow(storedClips, plan);
    if (!workflow) throw new GoogleApiError("The stored clip workflow is incomplete or malformed.", 422);
    const { status } = workflow;
    await db.update(stories).set({ status, updatedAt: Date.now() }).where(eq(stories.id, storyId));
    const refreshedStory = { ...story, status, updatedAt: Date.now() };

    return Response.json(
      { story: storyPayload(refreshedStory, storedClips, { plan, brief }) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
