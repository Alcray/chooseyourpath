import assert from "node:assert/strict";

const baseUrl = (process.env.TEST_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function postPlan(body, raw = false) {
  return fetch(`${baseUrl}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(50_000),
  });
}

const malformed = await postPlan("{", true);
assert.equal(malformed.status, 400);

const shortLesson = await postPlan({
  lesson: "share",
  characterPairId: "pip-momo",
  settingId: "riverside-garden",
  ageBand: "6-8",
  language: "Armenian",
});
assert.equal(shortLesson.status, 400);

const unsafeLesson = await postPlan({
  lesson: "Explain why murder is wrong for everyone.",
  characterPairId: "pip-momo",
  settingId: "riverside-garden",
  ageBand: "6-8",
  language: "Armenian",
});
assert.equal(unsafeLesson.status, 400);

const startedAt = Date.now();
const response = await postPlan({
  lesson: "Sharing helps friends solve a problem together and makes everyone feel included.",
  characterPairId: "pip-momo",
  settingId: "riverside-garden",
  ageBand: "6-8",
  language: "Armenian",
});
const payload = await response.json();
assert.equal(response.status, 200, `Planner route failed: ${payload?.error ?? "unknown error"}`);
assert.match(payload.blueprintId, /^[0-9a-f-]{36}$/i);
assert.deepEqual(payload.plan.clips.map((clip) => clip.id), ["opening", "positive", "negative", "ending"]);
assert.ok(Number.isInteger(payload.plan.continuitySeed));
for (const clip of payload.plan.clips) {
  assert.ok(clip.prompt.length >= 500 && clip.prompt.length <= 1800);
  assert.ok(clip.caption.length >= 1 && clip.caption.length <= 350);
  const expectedExtensions = clip.id === "positive" || clip.id === "negative" ? 2 : 0;
  assert.equal(clip.extensions.length, expectedExtensions);
  for (const extension of clip.extensions) {
    assert.ok(extension.prompt.length >= 500 && extension.prompt.length <= 1800);
    assert.ok(extension.caption.length >= 1 && extension.caption.length <= 350);
  }
}

const stories = await fetch(`${baseUrl}/api/stories`, { signal: AbortSignal.timeout(5_000) });
assert.equal(stories.status, 200);
const storiesPayload = await stories.json();
assert.ok(Object.hasOwn(storiesPayload, "story"));

console.log(`planner-route-live: ok (${Date.now() - startedAt}ms, blueprint ${payload.blueprintId})`);
