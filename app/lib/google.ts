import { env } from "cloudflare:workers";
import { GoogleApiError } from "./api-error";

export { GoogleApiError } from "./api-error";

type JsonRecord = Record<string, unknown>;

type GenerationEnv = {
  GOOGLE_API_KEY?: string;
  GOOGLE_CLOUD_PROJECT_NUMBER?: string;
  MEDIA?: R2Bucket;
};

function generationEnv() {
  return env as unknown as GenerationEnv;
}

export function getGoogleApiKey() {
  const value = generationEnv().GOOGLE_API_KEY?.trim();
  if (!value) {
    throw new GoogleApiError(
      "Google generation is not configured yet. Add the Google Cloud API key and try again.",
      503,
    );
  }
  return value;
}

export function getGoogleProjectNumber() {
  const value = generationEnv().GOOGLE_CLOUD_PROJECT_NUMBER?.trim();
  if (!value || !/^\d{6,20}$/.test(value)) {
    throw new GoogleApiError(
      "Video generation is missing its Google Cloud project configuration.",
      503,
    );
  }
  return value;
}

export function getMediaBucket() {
  const bucket = generationEnv().MEDIA;
  if (!bucket) throw new GoogleApiError("Generated-media storage is unavailable.", 503);
  return bucket;
}

export async function googleJson<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": getGoogleApiKey(),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const maximumResponseBytes = 48 * 1024 * 1024;
  const contentLength = Number(response.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximumResponseBytes) {
    throw new GoogleApiError("The generation service returned a video that is too large to store safely.", 502);
  }

  let payload: JsonRecord = {};
  try {
    payload = (await response.json()) as JsonRecord;
  } catch {
    throw new GoogleApiError("The generation service returned an unreadable response.", 502, true);
  }

  if (!response.ok) {
    const error = payload.error as JsonRecord | undefined;
    const message = typeof error?.message === "string" ? error.message : "Generation request failed.";
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw new GoogleApiError(message, response.status, retryable);
  }

  return payload as T;
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof GoogleApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unexpected generation error.";
  return Response.json({ error: message }, { status: 500 });
}
