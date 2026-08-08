import {
  AGE_BANDS,
  CHARACTER_PAIRS,
  CLIP_IDS,
  LANGUAGES,
  SETTINGS,
  getAgeBand,
  getCharacterPair,
  getSetting,
  isClipId,
  type StoryBrief,
  type StoryPlan,
} from "../../lib/story";
import { apiErrorResponse, googleJson, GoogleApiError } from "../../lib/google";
import {
  buildGeminiPlannerBody,
  buildPlannerPrompt,
  GEMINI_PLANNER_ENDPOINT,
} from "../../lib/planner-config";
import { getDb } from "../../../db";
import { blueprints } from "../../../db/schema";
import { requestOwnerId } from "../../lib/story-store";

type GeminiResponse = {
  candidates?: Array<{
    finishReason?: string;
    finishMessage?: string;
    content?: {
      parts?: Array<{ text?: string; thought?: boolean }>;
    };
  }>;
  promptFeedback?: {
    blockReason?: string;
    blockReasonMessage?: string;
  };
};

const UNSAFE_STORY_PATTERN = /(?:\b(?:sexual\w*|rape\w*|nudit\w*|naked|suicid\w*|self[- ]?harm\w*|murder\w*|kill\w*|shoot\w*|stab\w*|gun\w*|weapon\w*|blood\w*|gore|dismember\w*|tortur\w*|kidnap\w*|abduct\w*|poison\w*|overdose\w*|child abuse)\b|սեռական|բռնաբար|մերկ|ինքնասպան|ինքնավնաս|սպան(?!ախ)|կրակել|դանակահար|ատրճանակ|զենք|արյուն|խոշտանգ|առևանգ|թույն|թունավոր)/iu;

function assertChildSafeText(value: string, source: "brief" | "plan") {
  if (!UNSAFE_STORY_PATTERN.test(value)) return;
  throw new GoogleApiError(
    source === "brief"
      ? "Use a gentle, age-appropriate lesson without sexual, self-harm, or graphic violent content."
      : "The story planner could not make this idea safely. Please rephrase the lesson.",
    source === "brief" ? 400 : 502,
  );
}

function authenticatedOwnerId(request: Request) {
  try {
    return requestOwnerId(request);
  } catch {
    throw new GoogleApiError("Please sign in to use the parent story studio.", 401);
  }
}

function cleanBrief(input: unknown): StoryBrief {
  const brief = (input ?? {}) as Partial<StoryBrief>;
  const lesson = typeof brief.lesson === "string" ? brief.lesson.trim() : "";

  if (lesson.length < 8 || lesson.length > 500) {
    throw new GoogleApiError("Describe the lesson in 8–500 characters.", 400);
  }
  assertChildSafeText(lesson, "brief");

  const characterPairId = typeof brief.characterPairId === "string" ? brief.characterPairId : "";
  const settingId = typeof brief.settingId === "string" ? brief.settingId : "";
  const ageBand = typeof brief.ageBand === "string" ? brief.ageBand : "";
  const language = typeof brief.language === "string" ? brief.language : "";

  if (!CHARACTER_PAIRS.some((pair) => pair.id === characterPairId)) {
    throw new GoogleApiError("Choose a valid character pair.", 400);
  }
  if (!SETTINGS.some((setting) => setting.id === settingId)) {
    throw new GoogleApiError("Choose a valid story world.", 400);
  }
  if (!AGE_BANDS.some((age) => age.id === ageBand)) {
    throw new GoogleApiError("Choose a valid age band.", 400);
  }
  if (!LANGUAGES.some((option) => option.id === language)) {
    throw new GoogleApiError("Choose a supported language.", 400);
  }

  return {
    lesson,
    characterPairId,
    settingId,
    ageBand,
    language,
  };
}

function validatePlan(value: unknown): Omit<StoryPlan, "continuitySeed"> {
  const plan = value as Omit<StoryPlan, "continuitySeed">;
  if (!plan || typeof plan !== "object") throw new GoogleApiError("The story blueprint was incomplete.", 502);
  if (!Array.isArray(plan.clips) || plan.clips.length !== 4) {
    throw new GoogleApiError("The story blueprint must contain exactly four clips.", 502);
  }

  const byId = new Map(plan.clips.filter((clip) => isClipId(clip?.id)).map((clip) => [clip.id, clip]));
  if (byId.size !== CLIP_IDS.length) {
    throw new GoogleApiError("The story blueprint returned invalid clip roles.", 502);
  }

  const text = (field: unknown, name: string, min: number, max: number) => {
    if (typeof field !== "string") throw new GoogleApiError(`The story blueprint has an invalid ${name}.`, 502);
    const cleaned = field.trim();
    if (cleaned.length < min || cleaned.length > max) {
      throw new GoogleApiError(`The story blueprint has an invalid ${name}.`, 502);
    }
    return cleaned;
  };

  const positiveChoice = plan.positiveChoice;
  const negativeChoice = plan.negativeChoice;
  if (!positiveChoice || typeof positiveChoice !== "object" || !negativeChoice || typeof negativeChoice !== "object") {
    throw new GoogleApiError("The story blueprint returned invalid choices.", 502);
  }

  const validated = {
    title: text(plan.title, "title", 1, 120),
    parentSummary: text(plan.parentSummary, "parent summary", 1, 600),
    childIntro: text(plan.childIntro, "child introduction", 1, 500),
    choiceQuestion: text(plan.choiceQuestion, "choice question", 1, 300),
    positiveChoice: {
      label: text(positiveChoice.label, "positive choice label", 1, 100),
      explanation: text(positiveChoice.explanation, "positive choice explanation", 1, 500),
    },
    negativeChoice: {
      label: text(negativeChoice.label, "negative choice label", 1, 100),
      explanation: text(negativeChoice.explanation, "negative choice explanation", 1, 500),
    },
    clips: CLIP_IDS.map((id) => {
      const clip = byId.get(id)! as StoryPlan["clips"][number] & {
        caption?: unknown;
        extensions?: unknown;
      };
      const expectedExtensionCount = id === "positive" || id === "negative" ? 2 : 0;
      if (!Array.isArray(clip.extensions) || clip.extensions.length !== expectedExtensionCount) {
        throw new GoogleApiError(
          `${id === "positive" || id === "negative" ? "Each choice" : `The ${id}`} clip has an invalid extension plan.`,
          502,
        );
      }
      return {
        id,
        title: text(clip.title, `${id} clip title`, 1, 100),
        summary: text(clip.summary, `${id} clip summary`, 1, 500),
        prompt: text(clip.prompt, `${id} clip prompt`, 500, 1800),
        caption: text(clip.caption, `${id} clip caption`, 1, 350),
        extensions: clip.extensions.map((extension, index) => {
          if (!extension || typeof extension !== "object" || Array.isArray(extension)) {
            throw new GoogleApiError(`The ${id} extension ${index + 1} is invalid.`, 502);
          }
          const beat = extension as { prompt?: unknown; caption?: unknown };
          return {
            prompt: text(beat.prompt, `${id} extension ${index + 1} prompt`, 500, 1800),
            caption: text(beat.caption, `${id} extension ${index + 1} caption`, 1, 350),
          };
        }),
      };
    }),
  };
  assertChildSafeText(JSON.stringify(validated), "plan");
  return validated;
}

function parseGeminiPlan(response: GeminiResponse) {
  const candidate = response.candidates?.[0];
  if (!candidate) {
    throw new GoogleApiError(
      response.promptFeedback?.blockReason
        ? "The story idea could not be planned safely. Try rephrasing the lesson."
        : "The story planner returned no blueprint. Please try again.",
      502,
    );
  }

  if (candidate.finishReason === "MAX_TOKENS") {
    throw new GoogleApiError("The story blueprint was cut short. Please try again.", 502);
  }
  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    throw new GoogleApiError(
      candidate.finishReason === "SAFETY" || candidate.finishReason === "PROHIBITED_CONTENT"
        ? "The story idea could not be planned safely. Try rephrasing the lesson."
        : "The story planner could not finish this blueprint. Please try again.",
      502,
    );
  }

  const raw = (candidate.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!raw) throw new GoogleApiError("The story planner returned no blueprint. Please try again.", 502);

  const cleanJson = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleanJson) as unknown;
  } catch {
    throw new GoogleApiError("The story planner returned an incomplete blueprint. Please try again.", 502);
  }
}

export async function POST(request: Request) {
  try {
    const ownerUserId = authenticatedOwnerId(request);
    let requestBody: unknown;
    try {
      requestBody = await request.json();
    } catch {
      throw new GoogleApiError("Send a valid story brief.", 400);
    }
    const brief = cleanBrief(requestBody);
    const pair = getCharacterPair(brief.characterPairId);
    const setting = getSetting(brief.settingId);
    const age = getAgeBand(brief.ageBand);
    const targetLanguage = brief.language;

    const prompt = buildPlannerPrompt({
      lesson: brief.lesson,
      characterBible: pair.bible,
      worldBible: setting.bible,
      visualDirection: pair.style,
      ageLabel: age.label,
      ageGuidance: age.guidance,
      targetLanguage,
    });

    let response: GeminiResponse;
    try {
      response = await googleJson<GeminiResponse>(
        GEMINI_PLANNER_ENDPOINT,
        {
          method: "POST",
          signal: AbortSignal.timeout(45_000),
          body: JSON.stringify(buildGeminiPlannerBody(prompt)),
        },
      );
    } catch (error) {
      if (error instanceof GoogleApiError) {
        console.warn("Gemini planning request failed", { status: error.status, retryable: error.retryable });
        throw new GoogleApiError(
          error.retryable
            ? "The story planner is temporarily busy. Please try again."
            : "The story planner could not create this blueprint. Please try again.",
          error.retryable ? 503 : 502,
          error.retryable,
        );
      }
      throw new GoogleApiError("The story planner is temporarily unreachable. Please try again.", 503, true);
    }

    const plan = validatePlan(parseGeminiPlan(response));
    const continuitySeed = crypto.getRandomValues(new Uint32Array(1))[0];
    const storedPlan = { ...plan, continuitySeed } satisfies StoryPlan;
    const blueprintId = crypto.randomUUID();

    await getDb().insert(blueprints).values({
      id: blueprintId,
      ownerUserId,
      briefJson: JSON.stringify(brief),
      planJson: JSON.stringify(storedPlan),
      createdAt: Date.now(),
    });

    return Response.json({ blueprintId, plan: storedPlan });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
