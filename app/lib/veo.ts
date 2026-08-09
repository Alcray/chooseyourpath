import { getGoogleApiKey, getGoogleProjectNumber, googleJson, GoogleApiError } from "./google";
import {
  encodeVideoBase64,
  MAX_VIDEO_BYTES,
  isVertexVeoOperation,
  veoReferenceImages,
  vertexVeoEndpoint,
  veoGenerationEndpoint,
  veoOperationEndpoint,
} from "./veo-contract";
import type { VideoReferenceImage } from "./character-references";

type StartResponse = { name?: string };
export type VeoVideo = { base64: string; mimeType: string };
type StatusResponse = {
  done?: boolean;
  error?: { message?: string };
  response?: {
    generateVideoResponse?: {
      raiMediaFilteredCount?: number;
      raiMediaFilteredReasons?: string[];
      generatedSamples?: Array<{
        video?: { uri?: string; mimeType?: string };
      }>;
    };
  };
};
type VertexStatusResponse = {
  done?: boolean;
  error?: { message?: string };
  response?: {
    raiMediaFilteredCount?: number;
    raiMediaFilteredReasons?: string[];
    videos?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
  };
};

function operationEndpoint(operationName: string) {
  const endpoint = veoOperationEndpoint(operationName);
  if (!endpoint) {
    throw new GoogleApiError("The video provider returned an invalid job identifier.", 502);
  }
  return endpoint;
}

async function downloadGeneratedVideo(uri: string, declaredMimeType?: string): Promise<VeoVideo> {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new GoogleApiError("The video provider returned an invalid download address.", 502);
  }
  if (url.protocol !== "https:" || url.hostname !== "generativelanguage.googleapis.com") {
    throw new GoogleApiError("The video provider returned an untrusted download address.", 502);
  }

  const response = await fetch(url, {
    headers: { "x-goog-api-key": getGoogleApiKey() },
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new GoogleApiError("The generated video could not be downloaded.", response.status, response.status >= 500);
  }
  const contentLength = Number(response.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_VIDEO_BYTES) {
    throw new GoogleApiError("The generated video is too large to store safely.", 502);
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_VIDEO_BYTES) {
    throw new GoogleApiError("The generated video is empty or too large to store safely.", 502);
  }
  const responseMimeType = (response.headers.get("Content-Type") ?? "").split(";", 1)[0].trim();
  const mimeType = declaredMimeType || responseMimeType;
  return { base64: encodeVideoBase64(new Uint8Array(buffer)), mimeType };
}

export async function startVeoClip(
  prompt: string,
  seed: number,
  durationSeconds: 6 | 8 = 8,
  references: ReadonlyArray<VideoReferenceImage> = [],
) {
  const projectNumber = getGoogleProjectNumber();
  const vertexEndpoint = projectNumber
    ? vertexVeoEndpoint(projectNumber, "predictLongRunning")
    : null;
  const result = await googleJson<StartResponse>(vertexEndpoint ?? veoGenerationEndpoint(), {
    method: "POST",
    body: JSON.stringify({
      instances: [
        {
          prompt,
          ...(references.length > 0
            ? { referenceImages: veoReferenceImages(references, Boolean(vertexEndpoint)) }
            : {}),
        },
      ],
      parameters: {
        ...(vertexEndpoint ? { sampleCount: 1 } : { numberOfVideos: 1 }),
        durationSeconds,
        aspectRatio: "16:9",
        resolution: "720p",
        generateAudio: true,
        personGeneration: "dont_allow",
        enhancePrompt: true,
        seed,
        negativePrompt:
          "humans, photorealism, horror, violence, danger, humiliation, punishment, brands, logos, subtitles, captions, written text, character redesign, clothing changes, location changes, English speech when another language is requested",
      },
    }),
  });

  if (!result.name) throw new Error("Veo did not return a generation job.");
  return result.name;
}

export async function startVeoExtension(video: VeoVideo, prompt: string) {
  const projectNumber = getGoogleProjectNumber();
  const vertexEndpoint = projectNumber
    ? vertexVeoEndpoint(projectNumber, "predictLongRunning")
    : null;
  const result = await googleJson<StartResponse>(vertexEndpoint ?? veoGenerationEndpoint(), {
    method: "POST",
    body: JSON.stringify({
      instances: [
        {
          prompt,
          video: vertexEndpoint
            ? {
              mimeType: video.mimeType,
              bytesBase64Encoded: video.base64,
            }
            : {
              inlineData: {
                mimeType: video.mimeType,
                data: video.base64,
              },
            },
        },
      ],
      parameters: {
        ...(vertexEndpoint ? { sampleCount: 1 } : { numberOfVideos: 1 }),
        resolution: "720p",
        generateAudio: true,
      },
    }),
  });

  if (!result.name) throw new Error("Veo did not return an extension job.");
  return result.name;
}

export async function pollVeoClip(operationName: string) {
  const projectNumber = getGoogleProjectNumber();
  if (projectNumber && isVertexVeoOperation(operationName, projectNumber)) {
    const endpoint = vertexVeoEndpoint(projectNumber, "fetchPredictOperation");
    if (!endpoint) throw new GoogleApiError("Video generation has an invalid Google Cloud project configuration.", 503);
    const result = await googleJson<VertexStatusResponse>(endpoint, {
      method: "POST",
      body: JSON.stringify({ operationName }),
    });
    if (!result.done) return { done: false as const };
    if (result.error?.message) return { done: true as const, error: result.error.message };
    const video = result.response?.videos?.[0];
    if (!video?.bytesBase64Encoded) {
      const filtered = (result.response?.raiMediaFilteredCount ?? 0) > 0;
      return {
        done: true as const,
        error: filtered
          ? "The provider safety filter blocked this clip. Adjust the story and retry."
          : "The provider completed without a playable video.",
      };
    }
    return {
      done: true as const,
      video: { base64: video.bytesBase64Encoded, mimeType: video.mimeType ?? "" },
    };
  }

  const result = await googleJson<StatusResponse>(operationEndpoint(operationName), {
    method: "GET",
  });

  if (!result.done) return { done: false as const };
  if (result.error?.message) return { done: true as const, error: result.error.message };

  const generated = result.response?.generateVideoResponse;
  const video = generated?.generatedSamples?.[0]?.video;
  if (!video?.uri) {
    const filtered = (generated?.raiMediaFilteredCount ?? 0) > 0;
    return {
      done: true as const,
      error: filtered
        ? "The provider safety filter blocked this clip. Adjust the story and retry."
        : "The provider completed without a playable video.",
    };
  }

  return {
    done: true as const,
    video: await downloadGeneratedVideo(video.uri, video.mimeType),
  };
}

export function decodeBase64Video(base64: string) {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const outputLength = Math.floor((base64.length * 3) / 4) - padding;
  const bytes = new Uint8Array(outputLength);
  const chunkSize = 32_768;
  let outputOffset = 0;

  for (let inputOffset = 0; inputOffset < base64.length; inputOffset += chunkSize) {
    const binaryChunk = atob(base64.slice(inputOffset, inputOffset + chunkSize));
    for (let index = 0; index < binaryChunk.length; index += 1) {
      bytes[outputOffset + index] = binaryChunk.charCodeAt(index);
    }
    outputOffset += binaryChunk.length;
  }

  return bytes;
}
