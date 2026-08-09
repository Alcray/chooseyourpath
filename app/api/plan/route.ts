import { getDb } from "../../../db";
import { blueprints } from "../../../db/schema";
import {
  AGE_BANDS,
  CHARACTER_PAIRS,
  LANGUAGES,
  SETTINGS,
  getAgeBand,
  getCharacterPair,
  getSetting,
  type SemanticReview,
  type StoryBrief,
} from "../../lib/story";
import { apiErrorResponse, GoogleApiError } from "../../lib/google";
import { requestOwnerId } from "../../lib/story-store";
import { runStructuredCompilerStage } from "../../lib/gemini-structured";
import {
  buildMoralPrompt,
  buildPremisePrompt,
  buildPremiseRankingPrompt,
  buildReviewPrompt,
  buildShotManifestPrompt,
  buildStoryGraphPrompt,
  moralSpecSchema,
  premiseCandidatesSchema,
  premiseRankingSchema,
  semanticReviewSchema,
  shotManifestSchema,
  storyGraphBeatsSchema,
  storyGraphMetaSchema,
  storyGraphStatesSchema,
} from "../../lib/compiler-config";
import {
  assembleStoryPackage,
  classifyMoralPolicy,
  validateGraphDraft,
  validateMoralDraft,
  validatePremiseDraft,
  validatePremiseRanking,
  validateSemanticReview,
  validateShotDraft,
} from "../../lib/story-compiler";

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

  const characterPairId = typeof brief.characterPairId === "string" ? brief.characterPairId : "";
  const settingId = typeof brief.settingId === "string" ? brief.settingId : "";
  const ageBand = typeof brief.ageBand === "string" ? brief.ageBand : "";
  const language = typeof brief.language === "string" ? brief.language : "";
  if (!CHARACTER_PAIRS.some((pair) => pair.id === characterPairId)) throw new GoogleApiError("Choose a valid character pair.", 400);
  if (!SETTINGS.some((setting) => setting.id === settingId)) throw new GoogleApiError("Choose a valid story world.", 400);
  if (!AGE_BANDS.some((age) => age.id === ageBand)) throw new GoogleApiError("Choose a valid age band.", 400);
  if (!LANGUAGES.some((option) => option.id === language)) throw new GoogleApiError("Choose a supported language.", 400);
  return { lesson, characterPairId, settingId, ageBand, language };
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
    const policy = classifyMoralPolicy(brief.lesson);
    if (policy.decision === "REJECT") {
      throw new GoogleApiError(policy.reason, 400);
    }

    const moralDraft = await runStructuredCompilerStage<unknown>({
      stageLabel: "Moral interpretation",
      systemInstruction: "You are a child-development policy interpreter. Convert an allowed or transformed parent lesson into behavior, motive, natural consequences, and repair. The deterministic policy is authoritative.",
      prompt: buildMoralPrompt({
        sourceLesson: brief.lesson,
        compiledLesson: policy.compiledLesson,
        policyDecision: policy.decision,
        policyReason: policy.reason,
        ageBand: age.label,
      }),
      responseJsonSchema: moralSpecSchema,
      maxOutputTokens: 4096,
    });
    const moralSpec = validateMoralDraft(moralDraft, {
      sourceLesson: brief.lesson,
      compiledLesson: policy.compiledLesson,
      ageBand: brief.ageBand,
      policyDecision: policy.decision,
      policyReason: policy.reason,
    });

    const premiseDraft = await runStructuredCompilerStage<unknown>({
      stageLabel: "Adventure premise selection",
      systemInstruction: "You are a children's adventure editor. The moral may control the decision, but it may not replace the external plot.",
      prompt: buildPremisePrompt({
        moralSpec,
        characterIds: [...pair.characterIds],
        settingId: setting.id,
      }),
      responseJsonSchema: premiseCandidatesSchema,
      maxOutputTokens: 6144,
    });
    const generatedPremises = validatePremiseDraft(premiseDraft);
    const rankingDraft = await runStructuredCompilerStage<unknown>({
      stageLabel: "Independent premise ranking",
      systemInstruction: "You are an independent children's adventure premise judge. You did not write the candidates. Apply the seven-part storyness contract strictly and ignore the writer's self-scores.",
      prompt: buildPremiseRankingPrompt({
        moralSpec,
        candidates: generatedPremises.candidates,
        ageGuidance: age.guidance,
      }),
      responseJsonSchema: premiseRankingSchema,
      maxOutputTokens: 4_096,
    });
    const rankedPremises = validatePremiseRanking(rankingDraft, generatedPremises.candidates);
    const premises = {
      candidates: rankedPremises.candidates,
      selectedPremiseId: rankedPremises.selection.selectedPremiseId,
    };
    const selectedPremise = premises.candidates.find((candidate) => candidate.id === premises.selectedPremiseId)!;
    const canonBase = {
      characterIds: [...pair.characterIds],
      characterBible: pair.bible,
      locationId: setting.id,
      locationBible: setting.bible,
      visualStyle: pair.style,
      narratorVoiceId: `narrator-${brief.language === "Armenian" ? "hy" : "en"}-warm-v1`,
    };

    let graphResult: ReturnType<typeof validateGraphDraft> | null = null;
    let semanticReview: SemanticReview | null = null;
    let revisionConcerns: string[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const graphPrompt = buildStoryGraphPrompt({
          moralSpec,
          premise: selectedPremise,
          canon: canonBase,
          targetLanguage: brief.language,
          ageGuidance: age.guidance,
          revisionConcerns,
        });
        const metaDraft = await runStructuredCompilerStage<unknown>({
          stageLabel: attempt === 0 ? "Hierarchical story outline" : "Story outline revision",
          systemInstruction: "You are a hierarchical children's story writer. Return the complete act-level outline plus story metadata, registered props, the binary choice, branch-aware finale narration, and reflection requested by the schema. Prop ownerId must be a locked character ID or none. The moral controls the choice, not the external plot.",
          prompt: graphPrompt,
          responseJsonSchema: storyGraphMetaSchema,
          maxOutputTokens: 4_096,
        });
        const graphMeta = metaDraft && typeof metaDraft === "object" && !Array.isArray(metaDraft)
          ? metaDraft as Record<string, unknown>
          : {};
        const statesDraft = await runStructuredCompilerStage<unknown>({
          stageLabel: "Typed story states",
          systemInstruction: "Return exactly four typed states with unique roles initial, constructive_end, harmful_end, and finale_required. Use the exact locked locationId in every state and no character IDs except the locked characterIds. In every state, characterKnowledge must contain exactly one entry for each locked character ID, propStates must contain exactly one entry for each registered prop ID, relationships may contain only locked character IDs, and each holderId must be a locked character ID or none. Build the initial propStates by mechanically copying every LOCKED STORY META props item: propId equals id, condition equals initialCondition, and holderId equals ownerId, character-for-character. Unresolved promises are unique snake_case fact IDs, never prose. Design finale_required first. Then copy its time, locationId, presentCharacterIds, propStates, relationships, and unresolvedPromises exactly into both branch end states; include every finale-required knowledge fact in the matching character entry of both ends. Never use synonyms for copied condition or relationship status values. The compiler will reject mismatches and will never rewrite an end state.",
          prompt: `${graphPrompt}\n\nLOCKED STORY META:\n${JSON.stringify(graphMeta)}`,
          responseJsonSchema: storyGraphStatesSchema,
          maxOutputTokens: 4_096,
        });
        const beatsDraft = await runStructuredCompilerStage<unknown>({
          stageLabel: "Causal branch beats",
          systemInstruction: "Return only the ordered flat beats and setup-to-payoff links requested by the schema. Use every path: common 4–8 beats, constructive 3–6, harmful 3–6, constructive_bridge 1–3, harmful_bridge 1–3, and finale 1–3. Orders begin at one within each path. Make common order 1 the only beat anywhere with phase setup; all other common beats must escalate toward the choice. Return exactly one setupPayoffs entry whose setupBeatId is that first beat and whose constructivePayoffBeatId and harmfulPayoffBeatId reference real later beats on their respective path (a shared finale beat may serve both). The harmful path has a gentle consequence before repair; every summary visibly follows from the previous beat. Every beat must declare nonempty reads and updates using only typed state-fact keys that are valid for the locked typed states. Use exact registered prop IDs, exact locked character IDs, exact directed relationship pairs, and only promise IDs present in those states.",
          prompt: `${graphPrompt}\n\nLOCKED STORY META:\n${JSON.stringify(graphMeta)}\n\nLOCKED TYPED STATES:\n${JSON.stringify(statesDraft)}`,
          responseJsonSchema: storyGraphBeatsSchema,
          maxOutputTokens: 8_192,
        });
        const graphDraft = {
          ...graphMeta,
          ...(beatsDraft && typeof beatsDraft === "object" && !Array.isArray(beatsDraft) ? beatsDraft : {}),
          ...(statesDraft && typeof statesDraft === "object" && !Array.isArray(statesDraft) ? statesDraft : {}),
        };
        graphResult = validateGraphDraft(graphDraft, {
          canonBase,
          premises: premises.candidates,
          selectedPremiseId: premises.selectedPremiseId,
        });
      } catch (error) {
        if (attempt === 1) throw error;
        revisionConcerns = [error instanceof Error ? error.message : "The graph failed deterministic validation."];
        continue;
      }

      const reviewDraft = await runStructuredCompilerStage<unknown>({
        stageLabel: "Independent story review",
        systemInstruction: "You are an independent children's story safety and narrative judge. You did not write this story. Score it strictly and reject shame, fear, stereotypes, preaching, broken causality, or artificial convergence.",
        prompt: buildReviewPrompt({ moralSpec, outline: graphResult.outline, graph: graphResult.graph, ageBand: age.label }),
        responseJsonSchema: semanticReviewSchema,
        maxOutputTokens: 4096,
      });
      semanticReview = validateSemanticReview(reviewDraft);
      if (semanticReview.approved) break;
      if (attempt === 1) {
        throw new GoogleApiError(
          `The independent editor did not approve this story${semanticReview.concerns.length ? `: ${semanticReview.concerns.join("; ")}` : "."}`,
          502,
          true,
        );
      }
      revisionConcerns = semanticReview.concerns.length
        ? semanticReview.concerns
        : ["Raise every independent review score to at least three out of five."];
    }

    if (!graphResult || !semanticReview?.approved) {
      throw new GoogleApiError("The branching story graph could not pass review. Please try again.", 502, true);
    }

    const shotDraft = await runStructuredCompilerStage<unknown>({
      stageLabel: "Shot manifest compilation",
      systemInstruction: "You are an animation screenplay compiler. Convert a validated story graph into bounded motion segments that reference locked canon IDs. Do not redesign characters or invent story state.",
      prompt: buildShotManifestPrompt({
        moralSpec,
        premise: selectedPremise,
        graph: graphResult.graph,
        canon: graphResult.canon,
        targetLanguage: brief.language,
      }),
      responseJsonSchema: shotManifestSchema,
      maxOutputTokens: 8_192,
    });
    const shots = validateShotDraft(shotDraft, graphResult.canon);
    const continuitySeed = crypto.getRandomValues(new Uint32Array(1))[0];
    const storyPackage = assembleStoryPackage({
      moralSpec,
      premiseCandidates: premises.candidates,
      premiseSelection: rankedPremises.selection,
      selectedPremiseId: premises.selectedPremiseId,
      outline: graphResult.outline,
      title: graphResult.title,
      parentSummary: graphResult.parentSummary,
      childIntro: graphResult.childIntro,
      canon: graphResult.canon,
      graph: graphResult.graph,
      shots,
      graphChecks: graphResult.checks,
      semanticReview,
      continuitySeed,
    });

    const blueprintId = crypto.randomUUID();
    await getDb().insert(blueprints).values({
      id: blueprintId,
      ownerUserId,
      briefJson: JSON.stringify(brief),
      planJson: JSON.stringify(storyPackage),
      createdAt: Date.now(),
    });
    return Response.json({ blueprintId, plan: storyPackage, storyPackage });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
