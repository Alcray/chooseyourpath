import assert from "node:assert/strict";
import { buildMoralPrompt, moralSpecSchema } from "../app/lib/compiler-config.ts";
import { GEMINI_COMPILER_ENDPOINT } from "../app/lib/gemini-structured.ts";
import { validateMoralDraft } from "../app/lib/story-compiler.ts";

const apiKey = process.env.GOOGLE_API_KEY?.trim();
assert.ok(apiKey, "GOOGLE_API_KEY is required for the live compiler integration test");

const prompt = buildMoralPrompt({
  sourceLesson: "Sharing helps friends solve problems together.",
  compiledLesson: "Sharing helps friends solve problems together.",
  policyDecision: "ALLOW",
  policyReason: "The lesson can use gentle choices and natural consequences.",
  ageBand: "Ages 6–8",
});

const startedAt = Date.now();
const response = await fetch(GEMINI_COMPILER_ENDPOINT, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-goog-api-key": apiKey,
  },
  body: JSON.stringify({
    systemInstruction: {
      parts: [{ text: "You are a child-development policy interpreter. Return only the requested structured behavior specification." }],
    },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseJsonSchema: moralSpecSchema,
    },
  }),
  signal: AbortSignal.timeout(45_000),
});
const payload = await response.json();
assert.equal(response.ok, true, `Gemini compiler returned HTTP ${response.status}: ${payload?.error?.message ?? "unknown error"}`);

const candidate = payload.candidates?.[0];
assert.ok(candidate, "Gemini compiler returned no candidate");
assert.equal(candidate.finishReason, "STOP", `Gemini compiler stopped with ${candidate.finishReason ?? "no reason"}`);
const raw = (candidate.content?.parts ?? [])
  .filter((part) => !part.thought)
  .map((part) => part.text ?? "")
  .join("")
  .trim();
assert.ok(raw, "Gemini compiler returned no JSON text");
const moralSpec = JSON.parse(raw);

function validateSchema(value, schema, path = "moralSpec") {
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
}

validateSchema(moralSpec, moralSpecSchema);
validateMoralDraft(moralSpec, {
  sourceLesson: "Sharing helps friends solve problems together.",
  compiledLesson: "Sharing helps friends solve problems together.",
  ageBand: "6-8",
  policyDecision: "ALLOW",
  policyReason: "The lesson can use gentle choices and natural consequences.",
});
assert.ok(moralSpec.forbiddenTreatments.length >= 3);
assert.ok(moralSpec.repairAction.length >= 4);

console.log(`google-compiler-live: ok (${Date.now() - startedAt}ms)`);
