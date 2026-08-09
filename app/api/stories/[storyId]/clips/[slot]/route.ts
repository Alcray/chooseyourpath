import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { clips } from "../../../../../../db/schema";
import { apiErrorResponse, getMediaBucket } from "../../../../../lib/google";
import { isClipId } from "../../../../../lib/story";
import { canonicalStoryMediaKey } from "../../../../../lib/story-media";
import { getOwnedStory, requestOwnerId } from "../../../../../lib/story-store";

export const dynamic = "force-dynamic";

async function findClip(request: Request, context: { params: Promise<{ storyId: string; slot: string }> }) {
  const { storyId, slot } = await context.params;
  if (!isClipId(slot)) return null;
  const ownerUserId = requestOwnerId(request);
  const story = await getOwnedStory(storyId, ownerUserId);
  if (!story) return null;
  const [clip] = await getDb().select().from(clips).where(and(eq(clips.storyId, storyId), eq(clips.slot, slot))).limit(1);
  const expectedKey = canonicalStoryMediaKey(storyId, slot);
  if (
    !clip?.r2Key ||
    clip.status !== "ready" ||
    clip.r2Key !== expectedKey ||
    clip.mimeType !== "video/mp4"
  ) return null;
  return clip;
}

async function serve(request: Request, context: { params: Promise<{ storyId: string; slot: string }> }, headOnly: boolean) {
  try {
    const clip = await findClip(request, context);
    if (!clip) return new Response("Not found", { status: 404 });
    const bucket = getMediaBucket();
    const metadata = await bucket.head(clip.r2Key!);
    if (
      !metadata ||
      !Number.isSafeInteger(metadata.size) ||
      metadata.size <= 0 ||
      (metadata.httpMetadata?.contentType && metadata.httpMetadata.contentType !== "video/mp4")
    ) {
      return new Response("Not found", { status: 404 });
    }

    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
      "Content-Type": "video/mp4",
      ETag: metadata.httpEtag,
      "X-Content-Type-Options": "nosniff",
    });
    const rangeHeader = request.headers.get("Range");

    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${metadata.size}` } });
      const hasStart = match[1].length > 0;
      const hasEnd = match[2].length > 0;
      if (!hasStart && !hasEnd) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${metadata.size}` } });
      }
      const suffixLength = !hasStart && hasEnd ? Number(match[2]) : 0;
      const start = hasStart ? Number(match[1]) : Math.max(metadata.size - suffixLength, 0);
      const requestedEnd = hasStart && hasEnd ? Number(match[2]) : metadata.size - 1;
      const end = Math.min(requestedEnd, metadata.size - 1);
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        (!hasStart && (!Number.isSafeInteger(suffixLength) || suffixLength <= 0)) ||
        start < 0 ||
        start > end ||
        start >= metadata.size
      ) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${metadata.size}` } });
      }
      const length = end - start + 1;
      headers.set("Content-Range", `bytes ${start}-${end}/${metadata.size}`);
      headers.set("Content-Length", String(length));
      if (headOnly) return new Response(null, { status: 206, headers });
      const object = await bucket.get(clip.r2Key!, { range: { offset: start, length } });
      if (!object) return new Response("Not found", { status: 404 });
      return new Response(object.body, { status: 206, headers });
    }

    headers.set("Content-Length", String(metadata.size));
    if (headOnly) return new Response(null, { status: 200, headers });
    const object = await bucket.get(clip.r2Key!);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export function GET(request: Request, context: { params: Promise<{ storyId: string; slot: string }> }) {
  return serve(request, context, false);
}

export function HEAD(request: Request, context: { params: Promise<{ storyId: string; slot: string }> }) {
  return serve(request, context, true);
}
