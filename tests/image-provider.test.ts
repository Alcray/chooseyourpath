import assert from "node:assert/strict";
import test from "node:test";
import {
  CHARACTER_IMAGE_MODEL,
  decodeValidatedReferenceImage,
  imageGenerationRequest,
  validateProviderImageEnvelope,
} from "../app/lib/image-provider-contract";

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const BASE64_PNG = PNG.toString("base64");

test("uses Gemini 3.1 Flash Image with exact Gemini and Vertex image contracts", () => {
  assert.equal(CHARACTER_IMAGE_MODEL, "gemini-3.1-flash-image");
  assert.deepEqual(imageGenerationRequest("locked character", false), {
    model: "gemini-3.1-flash-image",
    input: "locked character",
    response_format: {
      type: "image",
      mime_type: "image/png",
      aspect_ratio: "1:1",
      image_size: "1K",
    },
  });
  assert.deepEqual(imageGenerationRequest("locked character", true), {
    contents: [{ role: "USER", parts: [{ text: "locked character" }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
    },
  });
});

test("accepts only bounded PNG envelopes with a real PNG signature", () => {
  assert.deepEqual(validateProviderImageEnvelope({ base64: BASE64_PNG, mimeType: "image/png" }), {
    base64: BASE64_PNG,
    mimeType: "image/png",
  });
  assert.deepEqual(decodeValidatedReferenceImage({ base64: BASE64_PNG, mimeType: "image/png" }), {
    image: { base64: BASE64_PNG, mimeType: "image/png" },
    bytes: new Uint8Array(PNG),
  });
  for (const invalid of [
    null,
    { base64: "", mimeType: "image/png" },
    { base64: BASE64_PNG, mimeType: "image/jpeg" },
    { base64: "not-base64!!!!!", mimeType: "image/png" },
    { base64: Buffer.from("not a png image").toString("base64"), mimeType: "image/png" },
  ]) {
    assert.equal(decodeValidatedReferenceImage(invalid), null);
  }
});
