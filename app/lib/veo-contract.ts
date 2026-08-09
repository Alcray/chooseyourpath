import type { VideoReferenceImage } from "./character-references";

export const GEMINI_VEO_MODEL = "veo-3.1-generate-preview";
export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const VERTEX_VEO_MODEL = "veo-3.1-generate-001";
export const VERTEX_LOCATION = "us-central1";
export const MAX_VIDEO_BYTES = 48 * 1024 * 1024;

export function veoGenerationEndpoint() {
  return `${GEMINI_API_BASE}/models/${GEMINI_VEO_MODEL}:predictLongRunning`;
}

export function veoOperationEndpoint(operationName: string) {
  if (!/^(?:models\/[a-z0-9._-]+\/)?operations\/[A-Za-z0-9._~-]+$/.test(operationName)) {
    return null;
  }
  return `${GEMINI_API_BASE}/${operationName}`;
}

export function vertexVeoEndpoint(
  projectNumber: string,
  method: "predictLongRunning" | "fetchPredictOperation",
) {
  if (!/^\d{6,20}$/.test(projectNumber)) return null;
  return `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${projectNumber}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_VEO_MODEL}:${method}`;
}

export function isVertexVeoOperation(operationName: string, projectNumber: string) {
  const prefix = `projects/${projectNumber}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_VEO_MODEL}/operations/`;
  return operationName.startsWith(prefix) && /^[A-Za-z0-9._~-]+$/.test(operationName.slice(prefix.length));
}

export function encodeVideoBase64(bytes: Uint8Array) {
  const chunks: string[] = [];
  const chunkSize = 24_576; // Divisible by three, so only the final chunk can contain padding.
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))));
  }
  return chunks.join("");
}

export function veoReferenceImages(references: ReadonlyArray<VideoReferenceImage>, vertex: boolean) {
  if (references.length === 0 || references.length > 3) {
    throw new Error("Veo requires between one and three locked character references.");
  }
  if (new Set(references.map((reference) => reference.characterId)).size !== references.length) {
    throw new Error("Veo character references must be unique.");
  }
  return references.map((reference) => ({
    image: vertex
      ? {
          bytesBase64Encoded: encodeVideoBase64(reference.bytes),
          mimeType: reference.mimeType,
        }
      : {
          inlineData: {
            data: encodeVideoBase64(reference.bytes),
            mimeType: reference.mimeType,
          },
        },
    referenceType: "asset",
  }));
}
