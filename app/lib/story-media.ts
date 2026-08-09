import { CLIP_IDS, isClipId, type ClipId } from "./story";
import type { StoredClip } from "./story-store";

type PlaybackPlanShape = {
  clips: ReadonlyArray<{
    id: ClipId;
    extensions: ReadonlyArray<unknown>;
  }>;
};

type StoredObjectMetadata = {
  size: number;
  httpMetadata?: { contentType?: string };
} | null;

const CLIP_WORKFLOW_STATUSES = new Set([
  "starting",
  "rendering",
  "extension_retry",
  "extending",
  "ingesting",
  "ready",
  "failed",
]);

export function canonicalStoryMediaKey(storyId: string, slot: ClipId) {
  return `stories/${storyId}/${slot}.mp4`;
}

function expectedExtensionCounts(plan?: PlaybackPlanShape) {
  const counts = new Map<ClipId, number>();
  if (!plan) {
    for (const slot of CLIP_IDS) counts.set(slot, slot === "positive" || slot === "negative" ? 2 : 0);
    return counts;
  }
  if (plan.clips.length !== CLIP_IDS.length) return null;
  for (const clip of plan.clips) {
    if (!isClipId(clip.id) || counts.has(clip.id) || !Array.isArray(clip.extensions)) return null;
    const length = clip.extensions.length;
    if ((clip.id === "opening" || clip.id === "ending") && length !== 0) return null;
    if ((clip.id === "positive" || clip.id === "negative") && length !== 0 && length !== 2) return null;
    counts.set(clip.id, length);
  }
  return CLIP_IDS.every((slot) => counts.has(slot)) ? counts : null;
}

function exactStoredClipMap(storedClips: StoredClip[]) {
  if (storedClips.length !== CLIP_IDS.length) return null;
  const bySlot = new Map<ClipId, StoredClip>();
  for (const clip of storedClips) {
    if (!isClipId(clip.slot) || bySlot.has(clip.slot)) return null;
    bySlot.set(clip.slot, clip);
  }
  if (!CLIP_IDS.every((slot) => bySlot.has(slot))) return null;
  return bySlot;
}

function hasCanonicalReadyMetadata(
  storyId: string,
  slot: ClipId,
  clip: StoredClip,
  expectedExtensions: number,
) {
  return (
    clip.extensionCount === expectedExtensions &&
    clip.r2Key === canonicalStoryMediaKey(storyId, slot) &&
    clip.mimeType === "video/mp4"
  );
}

export function canonicalStoredClipMap(
  storyId: string,
  storedClips: StoredClip[],
  plan?: PlaybackPlanShape,
) {
  const bySlot = exactStoredClipMap(storedClips);
  const counts = expectedExtensionCounts(plan);
  if (!bySlot || !counts) return null;
  for (const slot of CLIP_IDS) {
    const clip = bySlot.get(slot)!;
    if (
      clip.status !== "ready" ||
      !hasCanonicalReadyMetadata(storyId, slot, clip, counts.get(slot)!)
    ) {
      return null;
    }
  }
  return bySlot;
}

export async function inspectStoredPlaybackMedia(
  storyId: string,
  storedClips: StoredClip[],
  plan?: PlaybackPlanShape,
  headObject?: (key: string) => Promise<StoredObjectMetadata>,
) {
  const bySlot = exactStoredClipMap(storedClips);
  const counts = expectedExtensionCounts(plan);
  if (!bySlot || !counts) return { rowsReady: false, complete: false, missingSlots: [] as ClipId[] };
  const rowsReady = CLIP_IDS.every((slot) => bySlot.get(slot)!.status === "ready");
  const readySlots = CLIP_IDS.filter((slot) => bySlot.get(slot)!.status === "ready");
  const invalidMetadataSlots = readySlots.filter(
    (slot) => !hasCanonicalReadyMetadata(storyId, slot, bySlot.get(slot)!, counts.get(slot)!),
  );
  const inspectableSlots = readySlots.filter((slot) => !invalidMetadataSlots.includes(slot));
  if (inspectableSlots.length === 0) {
    return { rowsReady, complete: false, missingSlots: invalidMetadataSlots };
  }

  let head = headObject;
  if (!head) {
    const { getMediaBucket } = await import("./google");
    const bucket = getMediaBucket();
    head = (key) => bucket.head(key);
  }
  const objects = await Promise.all(
    inspectableSlots.map((slot) => head!(canonicalStoryMediaKey(storyId, slot))),
  );
  const missingObjectSlots = inspectableSlots.filter((_, index) => {
    const object = objects[index];
    return !(
      object &&
      object.size > 0 &&
      (!object.httpMetadata?.contentType || object.httpMetadata.contentType === "video/mp4")
    );
  });
  const missingSlots = [...invalidMetadataSlots, ...missingObjectSlots];
  return { rowsReady, complete: rowsReady && missingSlots.length === 0, missingSlots };
}

export async function hasCompleteStoredPlaybackMedia(
  storyId: string,
  storedClips: StoredClip[],
  plan?: PlaybackPlanShape,
) {
  return (await inspectStoredPlaybackMedia(storyId, storedClips, plan)).complete;
}

function hasProviderJob(clip: StoredClip) {
  return typeof clip.providerJobId === "string" && clip.providerJobId.length > 0;
}

function hasValidWorkflowState(clip: StoredClip, expectedExtensions: number) {
  const mediaEmpty = clip.r2Key === null && clip.mimeType === null;
  const extensionCountValid =
    Number.isInteger(clip.extensionCount) &&
    clip.extensionCount >= 0 &&
    clip.extensionCount <= expectedExtensions;
  if (!extensionCountValid || !CLIP_WORKFLOW_STATUSES.has(clip.status)) return false;
  if (clip.status === "starting") {
    return clip.extensionCount === 0 && !hasProviderJob(clip) && mediaEmpty;
  }
  if (clip.status === "rendering") {
    return hasProviderJob(clip) && mediaEmpty;
  }
  if (clip.status === "extension_retry" || clip.status === "extending") {
    return expectedExtensions === 2 && clip.extensionCount < expectedExtensions && hasProviderJob(clip) && mediaEmpty;
  }
  if (clip.status === "ingesting") {
    return clip.extensionCount === expectedExtensions && hasProviderJob(clip) && mediaEmpty;
  }
  if (clip.status === "ready") {
    return (
      clip.extensionCount === expectedExtensions &&
      typeof clip.r2Key === "string" &&
      clip.r2Key.length > 0 &&
      typeof clip.mimeType === "string" &&
      clip.mimeType.length > 0
    );
  }
  return mediaEmpty;
}

export function summarizeCanonicalClipWorkflow(
  storedClips: StoredClip[],
  plan?: PlaybackPlanShape,
) {
  const bySlot = exactStoredClipMap(storedClips);
  const counts = expectedExtensionCounts(plan);
  if (!bySlot || !counts) return null;
  const canonical = CLIP_IDS.map((slot) => bySlot.get(slot)!);
  if (canonical.some((clip) => !hasValidWorkflowState(clip, counts.get(clip.slot as ClipId)!))) {
    return null;
  }
  const readyCount = canonical.filter((clip) => clip.status === "ready").length;
  const activeCount = canonical.filter((clip) =>
    ["starting", "rendering", "extension_retry", "extending", "ingesting"].includes(clip.status)
  ).length;
  const failedCount = canonical.filter((clip) => clip.status === "failed").length;
  const status = readyCount === CLIP_IDS.length
    ? "ready"
    : activeCount > 0
      ? "rendering"
      : failedCount > 0
        ? "partial"
        : "starting";
  return { bySlot, readyCount, activeCount, failedCount, status };
}
