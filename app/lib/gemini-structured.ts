import { googleJson, GoogleApiError } from "./google";
import { GEMINI_COMPILER_MODEL } from "./compiler-model";

export { GEMINI_COMPILER_MODEL } from "./compiler-model";
export const GEMINI_COMPILER_ENDPOINT =
  `https://aiplatform.googleapis.com/v1/publishers/google/models/${GEMINI_COMPILER_MODEL}:generateContent`;

type GeminiResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
  promptFeedback?: { blockReason?: string };
};

function parseStructuredResponse(response: GeminiResponse, stageLabel: string) {
  const candidate = response.candidates?.[0];
  if (!candidate) {
    throw new GoogleApiError(
      response.promptFeedback?.blockReason
        ? `${stageLabel} was blocked by the child-safety policy.`
        : `${stageLabel} returned no structured result.`,
      502,
    );
  }
  if (candidate.finishReason === "MAX_TOKENS") {
    throw new GoogleApiError(`${stageLabel} was cut short. Please try again.`, 502, true);
  }
  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    throw new GoogleApiError(`${stageLabel} could not finish safely.`, 502);
  }

  const raw = (candidate.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  if (!raw) throw new GoogleApiError(`${stageLabel} returned no structured result.`, 502);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new GoogleApiError(`${stageLabel} returned unreadable structured data.`, 502, true);
  }
}

export async function runStructuredCompilerStage<T>(input: {
  stageLabel: string;
  systemInstruction: string;
  prompt: string;
  responseJsonSchema: object;
  maxOutputTokens?: number;
}): Promise<T> {
  let response: GeminiResponse;
  try {
    response = await googleJson<GeminiResponse>(GEMINI_COMPILER_ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: input.prompt }] }],
        generationConfig: {
          maxOutputTokens: input.maxOutputTokens ?? 8192,
          responseMimeType: "application/json",
          responseJsonSchema: input.responseJsonSchema,
        },
      }),
    });
  } catch (error) {
    if (error instanceof GoogleApiError) {
      console.warn("Gemini compiler stage failed", {
        stage: input.stageLabel,
        status: error.status,
        retryable: error.retryable,
        providerMessage: error.message.slice(0, 1_000),
      });
      if (error.status === 503 && !error.retryable) throw error;
      throw new GoogleApiError(
        error.retryable
          ? `${input.stageLabel} is temporarily busy. Please try again.`
          : `${input.stageLabel} could not complete. Please try again.`,
        error.retryable ? 503 : 502,
        error.retryable,
      );
    }
    throw new GoogleApiError(`${input.stageLabel} is temporarily unreachable. Please try again.`, 503, true);
  }
  return parseStructuredResponse(response, input.stageLabel) as T;
}
