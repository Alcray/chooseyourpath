import { getGoogleProjectNumber, googleJson } from "./google";

const MODEL = "veo-3.1-fast-generate-001";
const LOCATION = "us-central1";

type StartResponse = { name?: string };
export type VeoVideo = { base64: string; mimeType: string };
type StatusResponse = {
  done?: boolean;
  error?: { message?: string };
  response?: {
    raiMediaFilteredCount?: number;
    raiMediaFilteredReasons?: string[];
    videos?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
  };
};

function generationEndpoint(method: "predictLongRunning" | "fetchPredictOperation") {
  const project = getGoogleProjectNumber();
  return `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${project}/locations/${LOCATION}/publishers/google/models/${MODEL}:${method}`;
}

export async function startVeoClip(prompt: string, seed: number, durationSeconds: 6 | 8 = 8) {
  const result = await googleJson<StartResponse>(generationEndpoint("predictLongRunning"), {
    method: "POST",
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
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
  const result = await googleJson<StartResponse>(generationEndpoint("predictLongRunning"), {
    method: "POST",
    body: JSON.stringify({
      instances: [
        {
          prompt,
          video: {
            mimeType: video.mimeType,
            bytesBase64Encoded: video.base64,
          },
        },
      ],
      parameters: {
        sampleCount: 1,
        resolution: "720p",
        generateAudio: true,
      },
    }),
  });

  if (!result.name) throw new Error("Veo did not return an extension job.");
  return result.name;
}

export async function pollVeoClip(operationName: string) {
  const project = getGoogleProjectNumber();
  const expectedPrefix = `projects/${project}/locations/${LOCATION}/publishers/google/models/${MODEL}/operations/`;
  if (!operationName.startsWith(expectedPrefix)) throw new Error("Invalid provider job.");

  const result = await googleJson<StatusResponse>(generationEndpoint("fetchPredictOperation"), {
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
