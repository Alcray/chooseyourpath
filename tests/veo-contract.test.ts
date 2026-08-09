import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeVideoBase64,
  GEMINI_VEO_MODEL,
  isVertexVeoOperation,
  vertexVeoEndpoint,
  veoGenerationEndpoint,
  veoOperationEndpoint,
} from "../app/lib/veo-contract";

test("uses the key-only Gemini Veo 3.1 Fast endpoint", () => {
  assert.equal(GEMINI_VEO_MODEL, "veo-3.1-fast-generate-preview");
  assert.equal(
    veoGenerationEndpoint(),
    "https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning",
  );
  assert.doesNotMatch(veoGenerationEndpoint(), /projects\//);
});

test("builds and validates the configured Vertex Veo fallback", () => {
  const project = "123456789012";
  assert.equal(
    vertexVeoEndpoint(project, "predictLongRunning"),
    "https://us-central1-aiplatform.googleapis.com/v1/projects/123456789012/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001:predictLongRunning",
  );
  const operation = "projects/123456789012/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/job_ABC-123";
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
    veoOperationEndpoint("models/veo-3.1-fast-generate-preview/operations/abc123"),
    "https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-fast-generate-preview/operations/abc123",
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
