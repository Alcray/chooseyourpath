export const CHARACTER_IMAGE_MODEL = "gemini-3.1-flash-image";
export const MAX_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024;

export type ProviderImage = { base64: string; mimeType: "image/png" };

export function imageGenerationRequest(prompt: string, vertex: boolean) {
  if (vertex) {
    return {
      contents: [{ role: "USER", parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
      },
    };
  }
  return {
    model: CHARACTER_IMAGE_MODEL,
    input: prompt,
    response_format: {
      type: "image",
      mime_type: "image/png",
      aspect_ratio: "1:1",
      image_size: "1K",
    },
  };
}

export function validateProviderImageEnvelope(value: unknown): ProviderImage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const image = value as Record<string, unknown>;
  if (image.mimeType !== "image/png" || typeof image.base64 !== "string") return null;
  const base64 = image.base64;
  if (
    base64.length < 12 ||
    base64.length > Math.ceil((MAX_REFERENCE_IMAGE_BYTES * 4) / 3) + 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)
  ) {
    return null;
  }
  return { base64, mimeType: "image/png" };
}

export function decodeValidatedReferenceImage(value: unknown) {
  const image = validateProviderImageEnvelope(value);
  if (!image) return null;
  try {
    const binary = atob(image.base64);
    if (binary.length < 8 || binary.length > MAX_REFERENCE_IMAGE_BYTES) return null;
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!pngSignature.every((byte, index) => bytes[index] === byte)) return null;
    return { image, bytes };
  } catch {
    return null;
  }
}
