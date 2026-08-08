import assert from "node:assert/strict";

const baseUrl = (process.env.TEST_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const blueprintId = process.env.TEST_BLUEPRINT_ID?.trim();
const startCount = Number(process.env.TEST_START_COUNT ?? 4);

assert.match(blueprintId ?? "", /^[0-9a-f-]{36}$/i, "TEST_BLUEPRINT_ID must be a blueprint UUID");
assert.ok(Number.isInteger(startCount) && startCount >= 4 && startCount <= 20, "TEST_START_COUNT must be between 4 and 20");

async function startStory(idempotencyKey) {
  const response = await fetch(`${baseUrl}/api/stories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blueprintId, idempotencyKey }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  return { response, payload };
}

const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const started = [];

for (let index = 0; index < startCount; index += 1) {
  const idempotencyKey = `repeat-start-${runId}-${index}`;
  const first = await startStory(idempotencyKey);
  assert.equal(first.response.status, 202, `story ${index + 1} failed: ${first.payload?.error ?? "unknown error"}`);
  assert.match(first.payload?.story?.id ?? "", /^[0-9a-f-]{36}$/i);
  started.push({ idempotencyKey, storyId: first.payload.story.id });
}

for (const entry of started) {
  const duplicate = await startStory(entry.idempotencyKey);
  assert.equal(duplicate.response.status, 200, `idempotent retry failed: ${duplicate.payload?.error ?? "unknown error"}`);
  assert.equal(duplicate.payload?.story?.id, entry.storyId);
}

const concurrentKey = `concurrent-start-${runId}`;
const concurrent = await Promise.all([startStory(concurrentKey), startStory(concurrentKey)]);
assert.deepEqual(concurrent.map(({ response }) => response.status).sort(), [200, 202]);
assert.equal(concurrent[0].payload?.story?.id, concurrent[1].payload?.story?.id);

console.log(`story-starts-live: ok (${startCount} unique starts, ${startCount} retries, and one concurrent duplicate)`);
