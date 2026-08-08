import { and, asc, eq, inArray, lt, or } from "drizzle-orm";
import { getDb, getRawDb } from "../../../../db";
import { clips, stories } from "../../../../db/schema";
import { apiErrorResponse, getMediaBucket, GoogleApiError } from "../../../lib/google";
import { CLIP_IDS, baseClipDuration, isClipId } from "../../../lib/story";
import { validateStoryPackage } from "../../../lib/story-compiler";
import { getOwnedStory, getStoryClips, requestOwnerId, storyPayload } from "../../../lib/story-store";
import { getVideoProvider, type ProviderPollResult } from "../../../lib/video-provider";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ storyId: string }> }) {
  try {
    const { storyId } = await context.params;
    const ownerUserId = requestOwnerId(request);
    const story = await getOwnedStory(storyId, ownerUserId);
    if (!story) return Response.json({ error: "Story not found." }, { status: 404 });

    let plan;
    try {
      plan = validateStoryPackage(JSON.parse(story.planJson), { requireParentApproval: true });
    } catch {
      throw new GoogleApiError("The stored story blueprint could not be read.", 422);
    }
    const videoProvider = getVideoProvider();

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
          } else if (result.video && nextClip.extensionCount < extensions.length) {
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
                { story: storyPayload(story, await getStoryClips(storyId)) },
                { headers: { "Cache-Control": "no-store" } },
              );
            }

            try {
              const operationName = await videoProvider.extend(result.video, extension.prompt);
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
          } else if (result.video) {
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
                { story: storyPayload(story, await getStoryClips(storyId)) },
                { headers: { "Cache-Control": "no-store" } },
              );
            }

            const r2Key = `stories/${storyId}/${nextClip.slot}.mp4`;
            let videoBytes: Uint8Array | null = null;
            try {
              videoBytes = videoProvider.decode(result.video);
            } catch {
              await d1
                .prepare(
                  "UPDATE clips SET status = ?, error_message = ?, updated_at = ? WHERE id = ? AND status = ? AND provider_job_id = ? AND extension_count = ? AND updated_at = ?",
                )
                .bind(
                  "failed",
                  "The generated clip could not be decoded. Please retry it.",
                  Date.now(),
                  nextClip.id,
                  "ingesting",
                  nextClip.providerJobId,
                  nextClip.extensionCount,
                  claimTime,
                )
                .run();
            }

            if (videoBytes) {
              try {
                await getMediaBucket().put(r2Key, videoBytes, {
                  httpMetadata: { contentType: result.video.mimeType, contentDisposition: "inline" },
                });
                await d1
                  .prepare(
                    "UPDATE clips SET status = ?, r2_key = ?, mime_type = ?, error_message = NULL, updated_at = ? WHERE id = ? AND status = ? AND provider_job_id = ? AND extension_count = ? AND updated_at = ?",
                  )
                  .bind(
                    "ready",
                    r2Key,
                    result.video.mimeType,
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
    const readyCount = storedClips.filter((clip) => clip.status === "ready").length;
    const activeCount = storedClips.filter((clip) =>
      clip.status === "starting" || clip.status === "rendering" || clip.status === "extension_retry" || clip.status === "extending" || clip.status === "ingesting"
    ).length;
    const failedCount = storedClips.filter((clip) => clip.status === "failed").length;
    const status = readyCount === CLIP_IDS.length ? "ready" : activeCount > 0 ? "rendering" : failedCount > 0 ? "partial" : "starting";
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
