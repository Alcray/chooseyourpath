import assert from "node:assert/strict";

const baseUrl = (process.env.TEST_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function postPlan(body, raw = false) {
  return fetch(`${baseUrl}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(240_000),
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
assert.equal(payload.plan.compiler.schemaVersion, "1.1");
assert.equal(payload.plan.compiler.model, "gemini-3.5-flash-lite");
assert.equal(payload.plan.moralSpec.policyDecision, "ALLOW");
assert.equal(payload.plan.premiseCandidates.length, 3);
assert.ok(payload.plan.premiseCandidates.every((premise) => premise.storynessScore >= 60));
assert.equal(payload.plan.premiseSelection.evaluations.length, 3);
assert.equal(payload.plan.premiseSelection.selectedPremiseId, payload.plan.selectedPremiseId);
assert.ok(payload.plan.outline.setup.length >= 4);
assert.equal(
  payload.plan.graph.setupPayoffs.length,
  payload.plan.graph.commonPrefix.filter((beat) => beat.phase === "setup").length,
);
assert.equal(payload.plan.parentReview.status, "pending");
assert.equal(payload.plan.shots.length, 8);
assert.equal(payload.plan.validation.valid, true);
assert.equal(payload.plan.validation.semanticReview.approved, true);
assert.ok(payload.plan.validation.checks.every((check) => check.passed));
assert.deepEqual(payload.plan.clips.map((clip) => clip.id), ["opening", "positive", "negative", "ending"]);
assert.ok(Number.isInteger(payload.plan.continuitySeed));
assert.ok(payload.plan.childIntro.length >= 10 && payload.plan.childIntro.length <= 500);
assert.doesNotMatch(payload.plan.childIntro, /today we will see|այսօր մենք կտեսնենք/iu);
for (const clip of payload.plan.clips) {
  assert.ok(clip.prompt.length >= 500 && clip.prompt.length <= 2600);
  assert.ok(clip.caption.length >= 1 && clip.caption.length <= 350);
  const expectedExtensions = clip.id === "positive" || clip.id === "negative" ? 2 : 0;
  assert.equal(clip.extensions.length, expectedExtensions);
  for (const extension of clip.extensions) {
    assert.ok(extension.prompt.length >= 500 && extension.prompt.length <= 2600);
    assert.ok(extension.caption.length >= 1 && extension.caption.length <= 350);
  }
}

const stories = await fetch(`${baseUrl}/api/stories`, { signal: AbortSignal.timeout(5_000) });
assert.equal(stories.status, 200);
const storiesPayload = await stories.json();
assert.ok(Object.hasOwn(storiesPayload, "story"));

console.log(`planner-route-live: ok (${Date.now() - startedAt}ms, blueprint ${payload.blueprintId})`);
