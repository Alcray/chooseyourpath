export type ValidatedProviderVideo = {
  base64: string;
  mimeType: "video/mp4";
};

export type DecodedProviderVideo = {
  video: ValidatedProviderVideo;
  bytes: Uint8Array;
};

const STANDARD_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Treat provider media as untrusted input. Veo extensions and the playback
 * pipeline only support MP4, so a different MIME type or malformed base64
 * must fail the clip before it can be extended or marked ready.
 */
export function validateProviderVideoEnvelope(value: unknown): ValidatedProviderVideo | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.mimeType !== "video/mp4" || typeof candidate.base64 !== "string") return null;

  const base64 = candidate.base64;
  if (base64.length === 0 || base64.length % 4 === 1 || !STANDARD_BASE64.test(base64)) return null;

  return { base64, mimeType: "video/mp4" };
}

export function hasNonemptyProviderVideoBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array && value.byteLength > 0;
}

export function decodeValidatedProviderVideo(
  value: unknown,
  decode: (video: ValidatedProviderVideo) => Uint8Array,
): DecodedProviderVideo | null {
  const video = validateProviderVideoEnvelope(value);
  if (!video) return null;
  try {
    const bytes = decode(video);
    return hasNonemptyProviderVideoBytes(bytes) ? { video, bytes } : null;
  } catch {
    return null;
  }
}
