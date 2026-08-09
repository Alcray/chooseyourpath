import { randomUUID } from "node:crypto";
import type { StoryRequest, StoryTree } from "../../../types/story.js";
import type { StoryGeneratorContext, StoryProvider } from "../types.js";

const MOOD_ENUM = ["happy", "curious", "worried", "excited", "proud", "calm"];

const sceneSchema = {
  type: "OBJECT",
  properties: {
    narration_hy: { type: "STRING", description: "1-2 short simple sentences in natural, warm Eastern Armenian (Unicode Armenian script), written for a 5-10 year old. Shown as a caption and read aloud." },
    action_en: { type: "STRING", description: "English verb phrase describing only what happens visually in this beat (no character name/subject, it will be prepended automatically), e.g. 'happily watering a small seedling and singing softly'. Never in Armenian." },
    mood: { type: "STRING", enum: MOOD_ENUM },
  },
  required: ["narration_hy", "action_en", "mood"],
};

const branchSchema = {
  type: "OBJECT",
  properties: {
    consequence: { type: "ARRAY", items: sceneSchema, minItems: 2, maxItems: 3 },
    reflectionQuestion_hy: { type: "STRING", description: "Simple Armenian question inviting the child to reflect on how a character felt or why something happened." },
    reflectionOptions: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { label_hy: { type: "STRING" }, icon: { type: "STRING", description: "single emoji" } }, required: ["label_hy", "icon"] },
      minItems: 2,
      maxItems: 2,
    },
    insight_hy: { type: "STRING", description: "One warm, positive Armenian sentence with the takeaway, shown after the child answers the reflection question." },
    summaryTitle_hy: { type: "STRING" },
    summaryMessage_hy: { type: "STRING" },
    moralRecap_hy: { type: "STRING", description: "One short Armenian sentence stating the lesson learned." },
  },
  required: ["consequence", "reflectionQuestion_hy", "reflectionOptions", "insight_hy", "summaryTitle_hy", "summaryMessage_hy", "moralRecap_hy"],
};

const STORY_SCHEMA = {
  type: "OBJECT",
  properties: {
    title_hy: { type: "STRING", description: "Armenian story title." },
    opening: { type: "ARRAY", items: sceneSchema, minItems: 2, maxItems: 3 },
    decisionPrompt_hy: { type: "STRING", description: "Armenian question asking what the character should do." },
    choiceA: {
      type: "OBJECT",
      description: "The wiser/kinder choice.",
      properties: { label_hy: { type: "STRING" }, icon: { type: "STRING", description: "single emoji" }, description_hy: { type: "STRING" } },
      required: ["label_hy", "icon", "description_hy"],
    },
    choiceB: {
      type: "OBJECT",
      description: "A believable but less-ideal choice — never scary or shameful.",
      properties: { label_hy: { type: "STRING" }, icon: { type: "STRING", description: "single emoji" }, description_hy: { type: "STRING" } },
      required: ["label_hy", "icon", "description_hy"],
    },
    branchA: branchSchema,
    branchB: branchSchema,
  },
  required: ["title_hy", "opening", "decisionPrompt_hy", "choiceA", "choiceB", "branchA", "branchB"],
};

function mapBranch(data: any, choiceId: string, stars: 1 | 2 | 3) {
  return {
    choiceId,
    consequence: data.consequence.map((s: any) => ({ id: randomUUID(), narration: s.narration_hy, action: s.action_en, mood: s.mood })),
    reflection: {
      question: data.reflectionQuestion_hy,
      options: data.reflectionOptions.map((o: any) => ({ id: randomUUID(), label: o.label_hy, icon: o.icon })),
      insight: data.insight_hy,
    },
    summary: { title: data.summaryTitle_hy, message: data.summaryMessage_hy, moralRecap: data.moralRecap_hy, stars },
  };
}

// Alternative LLM provider: reuses the same GEMINI_API_KEY already configured
// for narration (see narrationGenerator/providers/geminiTtsProvider.ts), so a
// single Google AI Studio key covers both story text and voice — no separate
// Anthropic key required. Preferred over AnthropicStoryProvider when
// GEMINI_API_KEY is set (see storyGenerator/index.ts for the selection
// order). Also the only provider that can fulfill a parent-written custom
// lesson (see StoryRequest.customLesson) — the template provider has no way
// to handle arbitrary free text.
export class GeminiStoryProvider implements StoryProvider {
  readonly name = "gemini" as const;

  constructor(
    private apiKey: string,
    private model: string
  ) {}

  async generate(request: StoryRequest, ctx: StoryGeneratorContext): Promise<StoryTree> {
    const prompt = `Write a very short, warm moral story for a child aged 5-10, in natural, child-friendly EASTERN ARMENIAN (the Armenia dialect, not Western Armenian).

CRITICAL: every *_hy field MUST be written using the Armenian alphabet (Unicode Armenian script, հայերեն այբուբեն) — for example "Բարև, բալիկս" — NEVER Latin transliteration (never "Barev, balikս"). Do not write stiff or literal-sounding translations — write the way a warm Armenian parent or teacher would actually talk to a child.

Lesson to teach: "${ctx.lessonName}" — this may be a short label or a full free-text description written by a parent, possibly not in Armenian and possibly informally phrased. Understand its intent and teach that lesson naturally in Armenian; do not translate it literally or quote it back.
Main character: ${ctx.characterBible.species}, referred to as "${ctx.nameDef}" (subject form) or "${ctx.nameGen}" (possessive form) — use these exact Armenian forms, do not invent a different grammatical form.
Setting: referred to as "${ctx.placeLoc}" (locative form) — use this exact Armenian form when saying "in the ...".

The story has exactly one decision point where the character must choose between two actions.
Choice A should be the wiser/kinder action. Choice B should be an understandable-but-less-ideal action.
Both branches must resolve warmly and positively — Choice B should NOT be scary or punishing, it should
gently show a natural consequence and let the character learn and recover. Never shame the character.

Every *_en field (only action_en) must be English and must NOT mention the character's name or species —
it's a short visual-action phrase only (e.g. "gently watering a small seedling"), because it gets combined
with a separate fixed character/style description later. Keep icons to a single emoji.

Respond with JSON matching the provided schema.`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: STORY_SCHEMA },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Gemini story generation failed: ${res.status} ${errText}`);
    }

    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini story response had no text content");

    const data = JSON.parse(text);
    const choiceAId = randomUUID();
    const choiceBId = randomUUID();

    return {
      id: randomUUID(),
      lessonId: request.lessonId ?? "custom",
      title: data.title_hy,
      characterName: ctx.characterName,
      settingName: ctx.settingName,
      opening: data.opening.map((s: any) => ({ id: randomUUID(), narration: s.narration_hy, action: s.action_en, mood: s.mood })),
      decision: {
        prompt: data.decisionPrompt_hy,
        choices: [
          { id: choiceAId, label: data.choiceA.label_hy, icon: data.choiceA.icon, description: data.choiceA.description_hy },
          { id: choiceBId, label: data.choiceB.label_hy, icon: data.choiceB.icon, description: data.choiceB.description_hy },
        ],
      },
      branches: [mapBranch(data.branchA, choiceAId, 3), mapBranch(data.branchB, choiceBId, 2)],
      generatedBy: "gemini",
    };
  }
}
