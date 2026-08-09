import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { StoryRequest, StoryTree } from "../../../types/story.js";
import type { StoryGeneratorContext, StoryProvider } from "../types.js";

const MODEL = "claude-sonnet-5";

const sceneSchema = {
  type: "object" as const,
  properties: {
    narration_hy: { type: "string" as const, description: "1-2 short simple sentences in natural, warm Eastern Armenian, written for a 5-10 year old. Shown as a caption and read aloud." },
    action_en: { type: "string" as const, description: "English verb phrase describing only what happens visually in this beat (no character name/subject, it will be prepended automatically), e.g. 'happily watering a small seedling and singing softly'. Never in Armenian." },
    mood: { type: "string" as const, enum: ["happy", "curious", "worried", "excited", "proud", "calm"] },
  },
  required: ["narration_hy", "action_en", "mood"],
};

const branchSchema = {
  type: "object" as const,
  properties: {
    consequence: { type: "array" as const, items: sceneSchema, minItems: 2, maxItems: 3 },
    reflectionQuestion_hy: { type: "string" as const, description: "Simple Armenian question inviting the child to reflect on how a character felt or why something happened." },
    reflectionOptions: {
      type: "array" as const,
      items: { type: "object" as const, properties: { label_hy: { type: "string" as const }, icon: { type: "string" as const, description: "single emoji" } }, required: ["label_hy", "icon"] },
      minItems: 2,
      maxItems: 2,
    },
    insight_hy: { type: "string" as const, description: "One warm, positive Armenian sentence with the takeaway, shown after the child answers the reflection question." },
    summaryTitle_hy: { type: "string" as const },
    summaryMessage_hy: { type: "string" as const },
    moralRecap_hy: { type: "string" as const, description: "One short Armenian sentence stating the lesson learned." },
  },
  required: ["consequence", "reflectionQuestion_hy", "reflectionOptions", "insight_hy", "summaryTitle_hy", "summaryMessage_hy", "moralRecap_hy"],
};

const STORY_TOOL = {
  name: "submit_story",
  description: "Submit a short branching moral story for a young child, in Armenian, with separate English scene-action descriptions for video generation.",
  input_schema: {
    type: "object" as const,
    properties: {
      title_hy: { type: "string" as const, description: "Armenian story title." },
      opening: { type: "array" as const, items: sceneSchema, minItems: 2, maxItems: 3 },
      decisionPrompt_hy: { type: "string" as const, description: "Armenian question asking what the character should do." },
      choiceA: {
        type: "object" as const,
        description: "The wiser/kinder choice.",
        properties: { label_hy: { type: "string" as const }, icon: { type: "string" as const, description: "single emoji" }, description_hy: { type: "string" as const } },
        required: ["label_hy", "icon", "description_hy"],
      },
      choiceB: {
        type: "object" as const,
        description: "A believable but less-ideal choice — never scary or shameful.",
        properties: { label_hy: { type: "string" as const }, icon: { type: "string" as const, description: "single emoji" }, description_hy: { type: "string" as const } },
        required: ["label_hy", "icon", "description_hy"],
      },
      branchA: branchSchema,
      branchB: branchSchema,
    },
    required: ["title_hy", "opening", "decisionPrompt_hy", "choiceA", "choiceB", "branchA", "branchB"],
  },
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

// Real-AI provider: asks Claude to write the story, constrained to our schema
// via tool use so we get structured JSON back instead of parsing free text.
// Used automatically when an Anthropic key is set; the route layer falls back
// to the template provider if this throws.
export class AnthropicStoryProvider implements StoryProvider {
  readonly name = "anthropic" as const;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generate(request: StoryRequest, ctx: StoryGeneratorContext): Promise<StoryTree> {
    const prompt = `Write a very short, warm moral story for a child aged 5-10, in natural, child-friendly EASTERN ARMENIAN (the Armenia dialect, not Western Armenian). Do not write stiff or literal-sounding translations — write the way a warm Armenian parent or teacher would actually talk to a child.

Lesson to teach: "${ctx.lessonName}" — this may be a short label or a full free-text description written by a parent, possibly not in Armenian and possibly informally phrased. Understand its intent and teach that lesson naturally in Armenian; do not translate it literally or quote it back.
Main character: ${ctx.characterBible.species}, referred to as "${ctx.nameDef}" (subject form) or "${ctx.nameGen}" (possessive form) — use these exact Armenian forms, do not invent a different grammatical form.
Setting: referred to as "${ctx.placeLoc}" (locative form) — use this exact Armenian form when saying "in the ...".

The story has exactly one decision point where the character must choose between two actions.
Choice A should be the wiser/kinder action. Choice B should be an understandable-but-less-ideal action.
Both branches must resolve warmly and positively — Choice B should NOT be scary or punishing, it should
gently show a natural consequence and let the character learn and recover. Never shame the character.

Every *_hy field must be Armenian. Every *_en field (only action_en) must be English and must NOT
mention the character's name or species — it's a short visual-action phrase only (e.g. "gently watering
a small seedling"), because it gets combined with a separate fixed character/style description later.
Keep icons to a single emoji.

Call the submit_story tool with the full structured story.`;

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      tools: [STORY_TOOL],
      tool_choice: { type: "tool", name: "submit_story" },
      messages: [{ role: "user", content: prompt }],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("Anthropic response did not include a tool_use block");
    }

    const data = toolUse.input as any;
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
      generatedBy: "anthropic",
    };
  }
}
