import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalStoredClipMap,
  canonicalStoryMediaKey,
  inspectStoredPlaybackMedia,
  summarizeCanonicalClipWorkflow,
} from "../app/lib/story-media";
import { CLIP_IDS, type ClipId } from "../app/lib/story";
import type { StoredClip } from "../app/lib/story-store";

const STORY_ID = "00000000-0000-4000-8000-000000000001";

function storedClip(slot: string, overrides: Partial<StoredClip> = {}): StoredClip {
  const clipId = slot as ClipId;
  return {
    id: `clip-${slot}`,
    storyId: STORY_ID,
    slot,
    status: "ready",
    providerJobId: `provider-${slot}`,
    extensionCount: slot === "positive" || slot === "negative" ? 2 : 0,
    r2Key: CLIP_IDS.includes(clipId) ? canonicalStoryMediaKey(STORY_ID, clipId) : `stories/${STORY_ID}/${slot}.mp4`,
    mimeType: "video/mp4",
    errorMessage: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function completeCanonicalSet() {
  return CLIP_IDS.map((slot) => storedClip(slot));
}

test("accepts exactly four ready clips with canonical keys, extension counts, and MP4 MIME", () => {
  const clips = completeCanonicalSet();
  const result = canonicalStoredClipMap(STORY_ID, clips);

  assert.ok(result);
  assert.equal(result.size, 4);
  for (const slot of CLIP_IDS) {
    assert.equal(result.get(slot), clips.find((clip) => clip.slot === slot));
  }
});

test("rejects foreign or otherwise noncanonical media keys", () => {
  const foreign = completeCanonicalSet();
  foreign[1] = { ...foreign[1], r2Key: "stories/another-story/positive.mp4" };
  assert.equal(canonicalStoredClipMap(STORY_ID, foreign), null);

  const wrongSlot = completeCanonicalSet();
  wrongSlot[2] = { ...wrongSlot[2], r2Key: canonicalStoryMediaKey(STORY_ID, "positive") };
  assert.equal(canonicalStoredClipMap(STORY_ID, wrongSlot), null);
});

test("rejects incorrect extension counts and non-MP4 media", () => {
  const shortBranch = completeCanonicalSet();
  shortBranch[1] = { ...shortBranch[1], extensionCount: 1 };
  assert.equal(canonicalStoredClipMap(STORY_ID, shortBranch), null);

  const extendedOpening = completeCanonicalSet();
  extendedOpening[0] = { ...extendedOpening[0], extensionCount: 2 };
  assert.equal(canonicalStoredClipMap(STORY_ID, extendedOpening), null);

  const webmEnding = completeCanonicalSet();
  webmEnding[3] = { ...webmEnding[3], mimeType: "video/webm" };
  assert.equal(canonicalStoredClipMap(STORY_ID, webmEnding), null);
});

test("reports all-ready rows with invalid stored metadata while checking valid objects", async () => {
  const clips = completeCanonicalSet();
  clips[1] = { ...clips[1], r2Key: "stories/another-story/positive.mp4" };
  clips[2] = { ...clips[2], extensionCount: 1 };
  clips[3] = { ...clips[3], mimeType: "video/webm" };

  const headed: string[] = [];
  assert.deepEqual(await inspectStoredPlaybackMedia(STORY_ID, clips, undefined, async (key) => {
    headed.push(key);
    return { size: 123, httpMetadata: { contentType: "video/mp4" } };
  }), {
    rowsReady: true,
    complete: false,
    missingSlots: ["positive", "negative", "ending"],
  });
  assert.deepEqual(headed, [canonicalStoryMediaKey(STORY_ID, "opening")]);

  const incomplete = completeCanonicalSet().map((clip) => ({
    ...clip,
    status: "failed",
    providerJobId: null,
    r2Key: null,
    mimeType: null,
  }));
  assert.deepEqual(await inspectStoredPlaybackMedia(STORY_ID, incomplete), {
    rowsReady: false,
    complete: false,
    missingSlots: [],
  });
});

test("rejects duplicate, unknown, missing, and extra clip slots", () => {
  const duplicate = completeCanonicalSet();
  duplicate[3] = storedClip("opening", { id: "duplicate-opening" });
  assert.equal(canonicalStoredClipMap(STORY_ID, duplicate), null);

  const unknown = completeCanonicalSet();
  unknown[3] = storedClip("credits");
  assert.equal(canonicalStoredClipMap(STORY_ID, unknown), null);

  const missing = completeCanonicalSet().slice(0, 3);
  assert.equal(canonicalStoredClipMap(STORY_ID, missing), null);

  const extra = [...completeCanonicalSet(), storedClip("credits")];
  assert.equal(canonicalStoredClipMap(STORY_ID, extra), null);
});

test("summarizes only an exact canonical four-slot workflow", () => {
  const clips = completeCanonicalSet();
  clips[0] = { ...clips[0], status: "ready" };
  clips[1] = { ...clips[1], status: "rendering", r2Key: null, mimeType: null };
  clips[2] = { ...clips[2], status: "failed", r2Key: null, mimeType: null };
  clips[3] = { ...clips[3], status: "starting", providerJobId: null, r2Key: null, mimeType: null };

  const summary = summarizeCanonicalClipWorkflow(clips);
  assert.ok(summary);
  assert.equal(summary.readyCount, 1);
  assert.equal(summary.activeCount, 2);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.status, "rendering");
  assert.deepEqual([...summary.bySlot.keys()], [...CLIP_IDS]);

  const partial = completeCanonicalSet().map((clip, index) => ({
    ...clip,
    status: index < 2 ? "ready" : "failed",
    ...(index < 2 ? {} : { r2Key: null, mimeType: null }),
  }));
  assert.equal(summarizeCanonicalClipWorkflow(partial)?.status, "partial");
  assert.equal(summarizeCanonicalClipWorkflow(completeCanonicalSet())?.status, "ready");

  const duplicate = completeCanonicalSet();
  duplicate[3] = storedClip("opening", { id: "duplicate-opening" });
  assert.equal(summarizeCanonicalClipWorkflow(duplicate), null);
  assert.equal(summarizeCanonicalClipWorkflow(completeCanonicalSet().slice(0, 3)), null);

  const unknown = completeCanonicalSet();
  unknown[3] = storedClip("credits");
  assert.equal(summarizeCanonicalClipWorkflow(unknown), null);
  assert.equal(summarizeCanonicalClipWorkflow([...completeCanonicalSet(), storedClip("credits")]), null);

  const unknownStatus = completeCanonicalSet();
  unknownStatus[0] = { ...unknownStatus[0], status: "published" };
  assert.equal(summarizeCanonicalClipWorkflow(unknownStatus), null);

  const impossibleExtensionCount = completeCanonicalSet();
  impossibleExtensionCount[0] = { ...impossibleExtensionCount[0], extensionCount: 1 };
  assert.equal(summarizeCanonicalClipWorkflow(impossibleExtensionCount), null);

  const impossibleStartingBranch = completeCanonicalSet();
  impossibleStartingBranch[1] = {
    ...impossibleStartingBranch[1],
    status: "starting",
    providerJobId: null,
    extensionCount: 2,
    r2Key: null,
    mimeType: null,
  };
  assert.equal(summarizeCanonicalClipWorkflow(impossibleStartingBranch), null);

  const renderingWithStoredMedia = completeCanonicalSet();
  renderingWithStoredMedia[1] = { ...renderingWithStoredMedia[1], status: "rendering" };
  assert.equal(summarizeCanonicalClipWorkflow(renderingWithStoredMedia), null);
});

test("accepts completed pre-extension unversioned playback with eight-second branches", async () => {
  const oldPlan = {
    clips: CLIP_IDS.map((id) => ({ id, extensions: [] })),
  };
  const clips = completeCanonicalSet().map((clip) => ({ ...clip, extensionCount: 0 }));
  const headed: string[] = [];
  const head = async (key: string) => {
    headed.push(key);
    return { size: 123, httpMetadata: { contentType: "video/mp4" } };
  };

  assert.ok(canonicalStoredClipMap(STORY_ID, clips, oldPlan));
  assert.equal(summarizeCanonicalClipWorkflow(clips, oldPlan)?.status, "ready");
  assert.deepEqual(await inspectStoredPlaybackMedia(STORY_ID, clips, oldPlan, head), {
    rowsReady: true,
    complete: true,
    missingSlots: [],
  });
  assert.deepEqual(headed, CLIP_IDS.map((slot) => canonicalStoryMediaKey(STORY_ID, slot)));
});

test("detects bad ready media while other clips are still active", async () => {
  const clips = completeCanonicalSet();
  clips[0] = { ...clips[0], r2Key: "stories/another-story/opening.mp4" };
  clips[1] = { ...clips[1], status: "rendering", extensionCount: 0, r2Key: null, mimeType: null };
  clips[2] = { ...clips[2], status: "failed", extensionCount: 0, r2Key: null, mimeType: null };
  const headed: string[] = [];

  assert.deepEqual(
    await inspectStoredPlaybackMedia(STORY_ID, clips, undefined, async (key) => {
      headed.push(key);
      return { size: 123, httpMetadata: { contentType: "video/mp4" } };
    }),
    { rowsReady: false, complete: false, missingSlots: ["opening"] },
  );
  assert.deepEqual(headed, [canonicalStoryMediaKey(STORY_ID, "ending")]);
});
