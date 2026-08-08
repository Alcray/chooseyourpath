import { env } from "cloudflare:workers";
import { GoogleApiError } from "./google";

type OpenRouterEnv = {
  OPENROUTER_API_KEY?: string;
};

type JsonRecord = Record<string, unknown>;

function getOpenRouterApiKey() {
  const value = (env as unknown as OpenRouterEnv).OPENROUTER_API_KEY?.trim();
  if (!value) {
    throw new GoogleApiError(
      "Story planning is not configured yet. Add the OpenRouter API key and try again.",
      503,
    );
  }
  return value;
}

function providerErrorMessage(status: number, payload: JsonRecord) {
  if (status === 401) return "The story-planner key is invalid or has expired. Replace the OpenRouter key.";
  if (status === 402) return "The story-planner budget is exhausted or the key has expired. Replace the OpenRouter key.";
  if (status === 404) return "The configured DeepSeek planning model is unavailable.";
  if (status === 429) return "The story planner is busy. Please try again shortly.";

  const error = payload.error as JsonRecord | undefined;
  const raw = typeof error?.message === "string" ? error.message.trim() : "";
  return raw && raw.length <= 300 ? raw : "The story planner request failed.";
}

export async function openRouterJson<T>(body: JsonRecord): Promise<T> {
  const apiKey = getOpenRouterApiKey();
  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "KindPath Story Studio",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new GoogleApiError("The story planner is temporarily unreachable. Please try again.", 503, true);
  }

  const maximumResponseBytes = 2 * 1024 * 1024;
  const contentLength = Number(response.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximumResponseBytes) {
    throw new GoogleApiError("The story planner returned an unexpectedly large response.", 502, true);
  }

  let payload: JsonRecord;
  try {
    payload = (await response.json()) as JsonRecord;
  } catch {
    throw new GoogleApiError("The story planner returned an unreadable response.", 502, true);
  }

  if (!response.ok || payload.error) {
    const providerStatus = response.ok ? 502 : response.status;
    const status = providerStatus === 401 || providerStatus === 402 ? 503 : providerStatus;
    const retryable = providerStatus === 408 || providerStatus === 429 || providerStatus >= 500;
    throw new GoogleApiError(providerErrorMessage(providerStatus, payload), status, retryable);
  }

  return payload as T;
}
