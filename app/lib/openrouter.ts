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
  const error = payload.error as JsonRecord | undefined;
  const raw = typeof error?.message === "string" ? error.message.trim() : "";

  if (status === 401) return "The story-planner key is invalid or has expired. Replace the OpenRouter key.";
  if (status === 402) return "The story-planner budget is exhausted or the key has expired. Replace the OpenRouter key.";
  if (status === 403) return "The story-planner key does not have permission to use this DeepSeek request.";
  if (status === 404) {
    return /no (?:allowed )?providers?|no endpoints?/i.test(raw)
      ? "DeepSeek is available, but this key's provider policy cannot serve the requested planner mode."
      : "This OpenRouter key cannot access the configured DeepSeek planning model.";
  }
  if (status === 429) return "The story planner is busy. Please try again shortly.";

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
        "X-OpenRouter-Metadata": "enabled",
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
    const status = providerStatus === 401 || providerStatus === 402 || providerStatus === 404 ? 503 : providerStatus;
    const retryable = providerStatus === 408 || providerStatus === 429 || providerStatus >= 500;
    const error = payload.error as JsonRecord | undefined;
    const metadata = payload.openrouter_metadata as JsonRecord | undefined;
    console.warn("OpenRouter planning request failed", {
      status: providerStatus,
      code: typeof error?.code === "number" ? error.code : undefined,
      errorType:
        error?.metadata && typeof error.metadata === "object"
          ? (error.metadata as JsonRecord).error_type
          : undefined,
      category:
        providerStatus === 404 && typeof error?.message === "string" && /no (?:allowed )?providers?|no endpoints?/i.test(error.message)
          ? "no_provider"
          : providerStatus === 404
            ? "not_found"
            : "provider_error",
      routingSummary: typeof metadata?.summary === "string" ? metadata.summary.slice(0, 300) : undefined,
    });
    throw new GoogleApiError(providerErrorMessage(providerStatus, payload), status, retryable);
  }

  return payload as T;
}
