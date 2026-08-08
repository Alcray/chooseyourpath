import assert from "node:assert/strict";
import {
  buildGeminiPlannerBody,
  buildPlannerPrompt,
  GEMINI_PLANNER_ENDPOINT,
  plannerResponseJsonSchema,
} from "../app/lib/planner-config.ts";

const apiKey = process.env.GOOGLE_API_KEY?.trim();
assert.ok(apiKey, "GOOGLE_API_KEY is required for the live planner integration test");

const prompt = buildPlannerPrompt({
  lesson: "Sharing helps friends solve problems together and makes everyone feel included.",
  characterBible:
    "Maro is a small golden fox with a teal scarf; Arpi is a round blue rabbit with a yellow satchel.",
  worldBible: "A warm riverside garden with round stones, reeds, wildflowers, and a wooden footbridge.",
  visualDirection: "Soft handcrafted animal cartoon with rounded shapes and gentle watercolor textures",
  ageLabel: "Ages 5–7",
  ageGuidance: "Use simple concrete language, visible cause and effect, and a reassuring resolution",
  targetLanguage: "Armenian",
});

const startedAt = Date.now();
const response = await fetch(GEMINI_PLANNER_ENDPOINT, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey,
  },
  body: JSON.stringify(buildGeminiPlannerBody(prompt)),
  signal: AbortSignal.timeout(45_000),
});
const payload = await response.json();
assert.equal(response.ok, true, `Gemini planner returned HTTP ${response.status}: ${payload?.error?.message ?? "unknown error"}`);

const candidate = payload.candidates?.[0];
assert.ok(candidate, "Gemini planner returned no candidate");
assert.equal(candidate.finishReason, "STOP", `Gemini planner stopped with ${candidate.finishReason ?? "no reason"}`);
const raw = (candidate.content?.parts ?? [])
  .filter((part) => !part.thought)
  .map((part) => part.text ?? "")
  .join("")
  .trim();
assert.ok(raw, "Gemini planner returned no JSON text");
const plan = JSON.parse(raw);

function validateSchema(value, schema, path = "plan") {
  if (schema.type === "object") {
    assert.ok(value && typeof value === "object" && !Array.isArray(value), `${path} must be an object`);
    const allowed = new Set(Object.keys(schema.properties ?? {}));
    if (schema.additionalProperties === false) {
      assert.deepEqual(Object.keys(value).filter((key) => !allowed.has(key)), [], `${path} has additional keys`);
    }
    for (const key of schema.required ?? []) assert.ok(key in value, `${path}.${key} is required`);
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (key in value) validateSchema(value[key], childSchema, `${path}.${key}`);
    }
    return;
  }
  if (schema.type === "array") {
    assert.ok(Array.isArray(value), `${path} must be an array`);
    if (schema.minItems !== undefined) assert.ok(value.length >= schema.minItems, `${path} is too short`);
    if (schema.maxItems !== undefined) assert.ok(value.length <= schema.maxItems, `${path} is too long`);
    value.forEach((item, index) => validateSchema(item, schema.items, `${path}[${index}]`));
    return;
  }
  assert.equal(typeof value, schema.type, `${path} must be a ${schema.type}`);
  if (schema.enum) assert.ok(schema.enum.includes(value), `${path} has an invalid enum value`);
}

validateSchema(plan, plannerResponseJsonSchema);
assert.deepEqual(plan.clips.map((clip) => clip.id), ["opening", "positive", "negative", "ending"]);
assert.ok(plan.childIntro.length >= 10 && plan.childIntro.length <= 500, "narrator setup length is invalid");
assert.doesNotMatch(plan.childIntro, /today we will see|այսօր մենք կտեսնենք/iu, "narrator setup must describe the immediate situation");
for (const clip of plan.clips) {
  assert.ok(clip.prompt.length >= 500 && clip.prompt.length <= 1800, `${clip.id} prompt length is invalid`);
  assert.ok(clip.caption.length >= 1 && clip.caption.length <= 350, `${clip.id} caption length is invalid`);
  const expectedExtensions = clip.id === "positive" || clip.id === "negative" ? 2 : 0;
  assert.equal(clip.extensions.length, expectedExtensions, `${clip.id} extension count is invalid`);
  for (const extension of clip.extensions) {
    assert.ok(extension.prompt.length >= 500 && extension.prompt.length <= 1800, `${clip.id} extension prompt length is invalid`);
    assert.ok(extension.caption.length >= 1 && extension.caption.length <= 350, `${clip.id} extension caption length is invalid`);
  }
}

console.log(`google-planner-live: ok (${Date.now() - startedAt}ms)`);
