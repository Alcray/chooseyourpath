import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeValidatedProviderVideo,
  hasNonemptyProviderVideoBytes,
  validateProviderVideoEnvelope,
} from "../app/lib/provider-media";

test("accepts only nonempty standard-base64 MP4 provider media", () => {
  assert.deepEqual(validateProviderVideoEnvelope({ base64: "AAAA", mimeType: "video/mp4" }), {
    base64: "AAAA",
    mimeType: "video/mp4",
  });
  assert.deepEqual(validateProviderVideoEnvelope({ base64: "AAA=", mimeType: "video/mp4", ignored: true }), {
    base64: "AAA=",
    mimeType: "video/mp4",
  });
  assert.deepEqual(validateProviderVideoEnvelope({ base64: "AAA", mimeType: "video/mp4" }), {
    base64: "AAA",
    mimeType: "video/mp4",
  });
});

test("rejects empty, malformed, non-MP4, and non-object provider media", () => {
  for (const value of [
    null,
    [],
    { base64: "", mimeType: "video/mp4" },
    { base64: " AAAAA===", mimeType: "video/mp4" },
    { base64: "A", mimeType: "video/mp4" },
    { base64: "AA=A", mimeType: "video/mp4" },
    { base64: "AAAA", mimeType: "video/webm" },
    { base64: "AAAA", mimeType: "video/mp4; codecs=avc1" },
    { base64: 123, mimeType: "video/mp4" },
  ]) {
    assert.equal(validateProviderVideoEnvelope(value), null);
  }
});

test("requires decoded provider media to contain at least one byte", () => {
  assert.equal(hasNonemptyProviderVideoBytes(new Uint8Array()), false);
  assert.equal(hasNonemptyProviderVideoBytes(new Uint8Array([0])), true);
  assert.equal(hasNonemptyProviderVideoBytes({ byteLength: 1 }), false);
});

test("validates the envelope before decoding and rejects decode failures or empty bytes", () => {
  let decodeCalls = 0;
  const decode = () => {
    decodeCalls += 1;
    return new Uint8Array([1]);
  };

  assert.equal(decodeValidatedProviderVideo({ base64: "AAAA", mimeType: "video/webm" }, decode), null);
  assert.equal(decodeCalls, 0, "unsupported media must never reach the decoder");

  assert.equal(
    decodeValidatedProviderVideo({ base64: "AAAA", mimeType: "video/mp4" }, () => new Uint8Array()),
    null,
  );
  assert.equal(
    decodeValidatedProviderVideo({ base64: "AAAA", mimeType: "video/mp4" }, () => {
      throw new Error("bad base64");
    }),
    null,
  );
  assert.deepEqual(decodeValidatedProviderVideo({ base64: "AAAA", mimeType: "video/mp4" }, decode), {
    video: { base64: "AAAA", mimeType: "video/mp4" },
    bytes: new Uint8Array([1]),
  });
  assert.equal(decodeCalls, 1);
});
