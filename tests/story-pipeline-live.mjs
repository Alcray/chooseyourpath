import assert from "node:assert/strict";

const baseUrl = (process.env.TEST_BASE_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const blueprintId = process.env.TEST_BLUEPRINT_ID?.trim();
let storyId = process.env.TEST_STORY_ID?.trim();

if (storyId) {
  assert.match(storyId, /^[0-9a-f-]{36}$/i, "TEST_STORY_ID must be a story UUID");
} else {
  assert.match(blueprintId ?? "", /^[0-9a-f-]{36}$/i, "TEST_BLUEPRINT_ID must be a blueprint UUID");
  const idempotencyKey = `pipeline-e2e-${Date.now()}`;
  const startResponse = await fetch(`${baseUrl}/api/stories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blueprintId, idempotencyKey, sensitiveTopicAcknowledged: false }),
    signal: AbortSignal.timeout(60_000),
  });
  const startPayload = await startResponse.json();
  assert.equal(startResponse.status, 202, `Story start failed: ${startPayload?.error ?? "unknown error"}`);
  storyId = startPayload.story?.id;
  assert.match(storyId ?? "", /^[0-9a-f-]{36}$/i);
  assert.equal(startPayload.story.clips.length, 4);

  const duplicateResponse = await fetch(`${baseUrl}/api/stories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blueprintId, idempotencyKey, sensitiveTopicAcknowledged: false }),
    signal: AbortSignal.timeout(10_000),
  });
  const duplicatePayload = await duplicateResponse.json();
  assert.equal(duplicateResponse.status, 200);
  assert.equal(duplicatePayload.story?.id, storyId);
}

const observedExtensions = { positive: new Set(), negative: new Set() };
let lastState = "";
let finalStory;
const deadline = Date.now() + 20 * 60_000;

while (Date.now() < deadline) {
  const response = await fetch(`${baseUrl}/api/stories/${storyId}`, {
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json();
  assert.equal(response.status, 200, `Story poll failed: ${payload?.error ?? "unknown error"}`);
  const story = payload.story;
  for (const clip of story.clips) {
    if (clip.slot === "positive" || clip.slot === "negative") {
      observedExtensions[clip.slot].add(clip.extensionCount);
    }
    assert.notEqual(clip.status, "failed", `${clip.slot} failed: ${clip.error ?? "unknown error"}`);
  }
  const state = story.clips
    .map((clip) => `${clip.slot}:${clip.status}:${clip.extensionCount}`)
    .join(" ");
  if (state !== lastState) {
    console.log(state);
    lastState = state;
  }
  if (story.status === "ready" && story.clips.every((clip) => clip.status === "ready")) {
    finalStory = story;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}

assert.ok(finalStory, "The four-clip story did not become ready within 20 minutes");
for (const slot of ["positive", "negative"]) {
  assert.ok(observedExtensions[slot].has(1), `${slot} never exposed extension step 1`);
  assert.ok(observedExtensions[slot].has(2), `${slot} never exposed extension step 2`);
}

for (const slot of ["opening", "positive", "negative", "ending"]) {
  const mediaUrl = `${baseUrl}/api/stories/${storyId}/clips/${slot}`;
  const head = await fetch(mediaUrl, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
  assert.equal(head.status, 200, `${slot} HEAD failed`);
  assert.match(head.headers.get("content-type") ?? "", /^video\//);
  assert.equal(head.headers.get("accept-ranges"), "bytes");
  assert.ok(Number(head.headers.get("content-length")) > 10_000, `${slot} video is unexpectedly small`);

  const range = await fetch(mediaUrl, {
    headers: { Range: "bytes=0-1023" },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(range.status, 206, `${slot} range request failed`);
  assert.equal(Number(range.headers.get("content-length")), 1024);
  assert.equal((await range.arrayBuffer()).byteLength, 1024);

  const invalidRange = await fetch(mediaUrl, {
    method: "HEAD",
    headers: { Range: "bytes=-0" },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(invalidRange.status, 416, `${slot} invalid range was not rejected`);
}

const latest = await fetch(`${baseUrl}/api/stories`, { signal: AbortSignal.timeout(10_000) });
const latestPayload = await latest.json();
assert.equal(latest.status, 200);
assert.equal(latestPayload.story?.id, storyId);

const retry = await fetch(`${baseUrl}/api/stories/${storyId}/retry`, {
  method: "POST",
  signal: AbortSignal.timeout(10_000),
});
const retryPayload = await retry.json();
assert.equal(retry.status, 202);
assert.equal(retryPayload.restartedCount, 0);

const missing = await fetch(`${baseUrl}/api/stories/00000000-0000-4000-8000-000000000000`, {
  signal: AbortSignal.timeout(10_000),
});
assert.equal(missing.status, 404);

console.log(`story-pipeline-live: ok (story ${storyId})`);
