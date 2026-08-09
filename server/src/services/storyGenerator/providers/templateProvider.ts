import { randomUUID } from "node:crypto";
import type { StoryRequest, StoryTree, Scene } from "../../../types/story.js";
import { LESSON_TEMPLATES, type SceneTpl } from "../templates.js";
import type { StoryGeneratorContext, StoryProvider } from "../types.js";

function fill(text: string, ctx: StoryGeneratorContext) {
  return text
    .replaceAll("{nameDef}", ctx.nameDef)
    .replaceAll("{nameGen}", ctx.nameGen)
    .replaceAll("{placeLoc}", ctx.placeLoc)
    .replaceAll("{name}", ctx.characterName)
    .replaceAll("{place}", ctx.settingName);
}

function buildScenes(tpls: SceneTpl[], ctx: StoryGeneratorContext): Scene[] {
  return tpls.map((t) => ({ id: randomUUID(), narration: fill(t.narration, ctx), action: t.action, mood: t.mood }));
}

// Deterministic, offline story generator. No API key required — this is what
// keeps the app fully demoable without any AI provider configured, and it's
// also the fallback if the Anthropic provider errors out.
export class TemplateStoryProvider implements StoryProvider {
  readonly name = "template" as const;

  async generate(request: StoryRequest, ctx: StoryGeneratorContext): Promise<StoryTree> {
    if (!request.lessonId) {
      throw new Error("Custom free-text lessons require an AI provider — the template provider has no template for arbitrary text.");
    }
    const tpl = LESSON_TEMPLATES[request.lessonId];
    if (!tpl) {
      throw new Error(`No story template for lesson "${request.lessonId}"`);
    }

    const choiceAId = randomUUID();
    const choiceBId = randomUUID();

    return {
      id: randomUUID(),
      lessonId: request.lessonId,
      title: fill(tpl.title, ctx),
      characterName: ctx.characterName,
      settingName: ctx.settingName,
      opening: buildScenes(tpl.opening, ctx),
      decision: {
        prompt: fill(tpl.decisionPrompt, ctx),
        choices: [
          { id: choiceAId, label: tpl.choiceA.label, icon: tpl.choiceA.icon, description: fill(tpl.choiceA.description, ctx) },
          { id: choiceBId, label: tpl.choiceB.label, icon: tpl.choiceB.icon, description: fill(tpl.choiceB.description, ctx) },
        ],
      },
      branches: [
        {
          choiceId: choiceAId,
          consequence: buildScenes(tpl.branchA.consequence, ctx),
          reflection: {
            question: fill(tpl.branchA.reflectionQuestion, ctx),
            options: tpl.branchA.reflectionOptions.map((o) => ({ id: randomUUID(), label: fill(o.label, ctx), icon: o.icon })),
            insight: fill(tpl.branchA.insight, ctx),
          },
          summary: {
            title: fill(tpl.branchA.summaryTitle, ctx),
            message: fill(tpl.branchA.summaryMessage, ctx),
            moralRecap: fill(tpl.branchA.moralRecap, ctx),
            stars: 3,
          },
        },
        {
          choiceId: choiceBId,
          consequence: buildScenes(tpl.branchB.consequence, ctx),
          reflection: {
            question: fill(tpl.branchB.reflectionQuestion, ctx),
            options: tpl.branchB.reflectionOptions.map((o) => ({ id: randomUUID(), label: fill(o.label, ctx), icon: o.icon })),
            insight: fill(tpl.branchB.insight, ctx),
          },
          summary: {
            title: fill(tpl.branchB.summaryTitle, ctx),
            message: fill(tpl.branchB.summaryMessage, ctx),
            moralRecap: fill(tpl.branchB.moralRecap, ctx),
            stars: 2,
          },
        },
      ],
      generatedBy: "template",
    };
  }
}
