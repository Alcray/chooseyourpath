import { getGoogleApiKey, getGoogleProjectNumber, googleJson, GoogleApiError } from "./google";
import {
  CHARACTER_IMAGE_MODEL,
  imageGenerationRequest,
  validateProviderImageEnvelope,
  type ProviderImage,
} from "./image-provider-contract";

export {
  CHARACTER_IMAGE_MODEL,
  decodeValidatedReferenceImage,
  imageGenerationRequest,
  validateProviderImageEnvelope,
} from "./image-provider-contract";

type VertexImageResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string };
      }>;
    };
  }>;
};

type GeminiInteractionResponse = {
  output_image?: { data?: string; mime_type?: string };
  outputs?: Array<{
    type?: string;
    data?: string;
    mime_type?: string;
  }>;
};

function vertexImageEndpoint(projectNumber: string) {
  return `https://aiplatform.googleapis.com/v1/projects/${projectNumber}/locations/global/publishers/google/models/${CHARACTER_IMAGE_MODEL}:generateContent`;
}

function geminiImageEndpoint() {
  return "https://generativelanguage.googleapis.com/v1beta/interactions";
}

function imageFromVertex(response: VertexImageResponse) {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const image = parts.find((part) => typeof part.inlineData?.data === "string")?.inlineData;
  return image ? { base64: image.data, mimeType: image.mimeType } : null;
}

function imageFromInteraction(response: GeminiInteractionResponse) {
  const image = response.output_image ?? response.outputs?.find((output) => output.type === "image");
  return image ? { base64: image.data, mimeType: image.mime_type } : null;
}

export interface ImageProvider {
  readonly id: typeof CHARACTER_IMAGE_MODEL;
  generate(prompt: string): Promise<ProviderImage>;
}

const googleImageProvider: ImageProvider = {
  id: CHARACTER_IMAGE_MODEL,
  async generate(prompt) {
    const projectNumber = getGoogleProjectNumber();
    const vertex = Boolean(projectNumber);
    const response = await googleJson<VertexImageResponse | GeminiInteractionResponse>(
      projectNumber ? vertexImageEndpoint(projectNumber) : geminiImageEndpoint(),
      {
        method: "POST",
        headers: { "x-goog-api-key": getGoogleApiKey() },
        body: JSON.stringify(imageGenerationRequest(prompt, vertex)),
        signal: AbortSignal.timeout(120_000),
      },
    );
    const candidate = vertex
      ? imageFromVertex(response as VertexImageResponse)
      : imageFromInteraction(response as GeminiInteractionResponse);
    const image = validateProviderImageEnvelope(candidate);
    if (!image) {
      throw new GoogleApiError("The character image provider returned no valid PNG image.", 502);
    }
    return image;
  },
};

export function getImageProvider(): ImageProvider {
  return googleImageProvider;
}
