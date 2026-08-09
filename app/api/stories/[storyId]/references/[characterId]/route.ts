import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { characterReferences } from "../../../../../../db/schema";
import { canonicalCharacterReferenceKey } from "../../../../../lib/character-references";
import { apiErrorResponse, getMediaBucket } from "../../../../../lib/google";
import { getOwnedStory, requestOwnerId } from "../../../../../lib/story-store";

export const dynamic = "force-dynamic";

async function serve(
  request: Request,
  context: { params: Promise<{ storyId: string; characterId: string }> },
  headOnly: boolean,
) {
  try {
    const { storyId, characterId } = await context.params;
    if (!/^[a-z0-9_]{3,50}$/.test(characterId)) return new Response("Not found", { status: 404 });
    const ownerUserId = requestOwnerId(request);
    if (!(await getOwnedStory(storyId, ownerUserId))) return new Response("Not found", { status: 404 });
    const [reference] = await getDb()
      .select()
      .from(characterReferences)
      .where(
        and(
          eq(characterReferences.storyId, storyId),
          eq(characterReferences.characterId, characterId),
        ),
      )
      .limit(1);
    const expectedKey = canonicalCharacterReferenceKey(storyId, characterId);
    if (
      !reference ||
      reference.status !== "ready" ||
      reference.r2Key !== expectedKey ||
      reference.mimeType !== "image/png"
    ) {
      return new Response("Not found", { status: 404 });
    }
    const bucket = getMediaBucket();
    const metadata = await bucket.head(expectedKey);
    if (
      !metadata ||
      !Number.isSafeInteger(metadata.size) ||
      metadata.size <= 8 ||
      metadata.httpMetadata?.contentType !== "image/png"
    ) {
      return new Response("Not found", { status: 404 });
    }
    const headers = new Headers({
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(metadata.size),
      "Content-Type": "image/png",
      ETag: metadata.httpEtag,
      "X-Content-Type-Options": "nosniff",
    });
    if (headOnly) return new Response(null, { status: 200, headers });
    const object = await bucket.get(expectedKey);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export function GET(
  request: Request,
  context: { params: Promise<{ storyId: string; characterId: string }> },
) {
  return serve(request, context, false);
}

export function HEAD(
  request: Request,
  context: { params: Promise<{ storyId: string; characterId: string }> },
) {
  return serve(request, context, true);
}
