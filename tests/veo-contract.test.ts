import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeVideoBase64,
  GEMINI_VEO_MODEL,
  isVertexVeoOperation,
  vertexVeoEndpoint,
  veoGenerationEndpoint,
  veoOperationEndpoint,
  veoReferenceImages,
} from "../app/lib/veo-contract";

test("uses the full-capability key-only Gemini Veo 3.1 endpoint", () => {
  assert.equal(GEMINI_VEO_MODEL, "veo-3.1-generate-preview");
  assert.equal(
    veoGenerationEndpoint(),
    "https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning",
  );
  assert.doesNotMatch(veoGenerationEndpoint(), /projects\//);
});

test("builds and validates the configured Vertex Veo fallback", () => {
  const project = "123456789012";
  assert.equal(
    vertexVeoEndpoint(project, "predictLongRunning"),
    "https://us-central1-aiplatform.googleapis.com/v1/projects/123456789012/locations/us-central1/publishers/google/models/veo-3.1-generate-001:predictLongRunning",
  );
  const operation = "projects/123456789012/locations/us-central1/publishers/google/models/veo-3.1-generate-001/operations/job_ABC-123";
  assert.equal(isVertexVeoOperation(operation, project), true);
  assert.equal(isVertexVeoOperation(operation, "999999999999"), false);
  assert.equal(isVertexVeoOperation(`${operation}/extra`, project), false);
  assert.equal(vertexVeoEndpoint("not-a-project", "predictLongRunning"), null);
});

test("accepts only provider operation resource names", () => {
  assert.equal(
    veoOperationEndpoint("operations/abc_123-XYZ~v1"),
    "https://generativelanguage.googleapis.com/v1beta/operations/abc_123-XYZ~v1",
  );
  assert.equal(
    veoOperationEndpoint("models/veo-3.1-generate-preview/operations/abc123"),
    "https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview/operations/abc123",
  );
  for (const invalid of [
    "https://example.com/operations/abc",
    "/operations/abc",
    "operations/../files/secret",
    "operations/abc?redirect=https://example.com",
    "projects/123/locations/us/operations/abc",
    "",
  ]) {
    assert.equal(veoOperationEndpoint(invalid), null, invalid);
  }
});

test("encodes downloaded video bytes without corrupting chunk boundaries", () => {
  for (const length of [0, 1, 2, 3, 24_575, 24_576, 24_577, 49_155]) {
    const bytes = Uint8Array.from({ length }, (_, index) => index % 251);
    assert.equal(encodeVideoBase64(bytes), Buffer.from(bytes).toString("base64"), `length ${length}`);
  }
});

test("encodes locked character assets in the exact Gemini and Vertex Veo reference shapes", () => {
  const references = [
    { characterId: "pip_fox_v1", bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" as const },
    { characterId: "momo_rabbit_v1", bytes: new Uint8Array([4, 5, 6]), mimeType: "image/png" as const },
  ];
  assert.deepEqual(veoReferenceImages(references, true), [
    { image: { bytesBase64Encoded: "AQID", mimeType: "image/png" }, referenceType: "asset" },
    { image: { bytesBase64Encoded: "BAUG", mimeType: "image/png" }, referenceType: "asset" },
  ]);
  assert.deepEqual(veoReferenceImages(references, false), [
    { image: { inlineData: { data: "AQID", mimeType: "image/png" } }, referenceType: "asset" },
    { image: { inlineData: { data: "BAUG", mimeType: "image/png" } }, referenceType: "asset" },
  ]);
  assert.throws(() => veoReferenceImages([], true), /between one and three/);
  assert.throws(() => veoReferenceImages([...references, references[0]], true), /unique/);
  assert.throws(
    () => veoReferenceImages([...references, { ...references[0], characterId: "third" }, { ...references[0], characterId: "fourth" }], true),
    /between one and three/,
  );
});
