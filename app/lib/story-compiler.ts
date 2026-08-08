import {
  CLIP_IDS,
  type AdventurePremise,
  type ClipId,
  type HierarchicalStoryOutline,
  type MoralSpec,
  type ParentReview,
  type PolicyDecision,
  type PremiseSelection,
  type SemanticReview,
  type SetupPayoff,
  type ShotManifestEntry,
  type StoryCanon,
  type StoryBeat,
  type StoryChoiceOption,
  type StoryClip,
  type StoryGraph,
  type StoryPackage,
  type StoryPlan,
  type StoryState,
  type StoryValidationCheck,
} from "./story";
import { GEMINI_COMPILER_MODEL } from "./compiler-model";
import { GoogleApiError } from "./api-error";

const UNSAFE_STORY_PATTERN = /(?:\b(?:sexual\w*|rape\w*|nudit\w*|naked|suicid\w*|self[- ]?harm\w*|murder\w*|kill\w*|shoot\w*|stab(?:s)?|stabb(?:ed|ing|er|ers)|gun\w*|weapon\w*|blood\w*|gore|dismember\w*|tortur\w*|kidnap\w*|abduct\w*|poison\w*|overdose\w*|child abuse)\b|սեռական|բռնաբար|մերկ|ինքնասպան|ինքնավնաս|սպան(?!ախ)|կրակել|դանակահար|ատրճանակ|զենք|արյուն|խոշտանգ|առևանգ|թույն|թունավոր)/iu;
const DISCRIMINATORY_PATTERN = /(?:girls? (?:cannot|can't|should(?: not|n't))|boys? (?:cannot|can't|should(?: not|n't))|(?:boys?|men|girls?|women)\s+(?:are\s+)?(?:better|superior|inferior|worse)\s+than\s+(?:boys?|men|girls?|women)|inferior (?:race|religion|people)|hate (?:girls|boys|people)|աղջիկները? չպետք|տղաները? չպետք)/iu;
const FEAR_PUNISHMENT_PATTERN = /(?:scare|terrify|frighten|threaten|beat|hurt|punish).{0,30}(?:child|kid|him|her|them)|վախեց|սարսափեց|պատժ|ծեծ/iu;
const HUMILIATION_PATTERN = /(?:humiliat|degrad|publicly shame|make (?:him|her|them|my (?:son|daughter|child)) ashamed|ամոթահար|նվաստաց)/iu;
const PROMPT_INJECTION_PATTERN = /(?:(?:ignore|disregard|override|forget)\s+(?:(?:all|any)\s+)?(?:previous|prior|above|system|developer)\s+(?:instructions?|messages?|prompts?)|(?:reveal|print|show|expose)\s+(?:(?:the|your)\s+)?(?:hidden\s+)?(?:system prompt|developer message|instructions?|api\s*keys?|secrets?)|<\s*\/?\s*(?:system|assistant|developer)\b|(?:act|pretend)\s+as\s+(?:the\s+)?(?:system|developer|assistant))/iu;
const UNSAFE_OBEDIENCE_PATTERN = /(?:always\s+obey|must\s+obey|should\s+obey|obey\s+(?:every|any|all)\s+(?:adult|person)|obey\s+strangers?|միշտ\s+լսել\s+մեծերին)/iu;
const REVIEW_PATTERN = /(?:diagnos|autis|adhd|depress|anxiety|trauma|religio|politic|therapy|medical|mental health|ախտորոշ|աուտիզմ|դեպրես|անհանգստ|տրավմ|կրոն|քաղաքական|բժշկ)/iu;

type PolicyResult = {
  decision: PolicyDecision;
  compiledLesson: string;
  reason: string;
};

type PremiseDraft = { candidates: AdventurePremise[]; selectedPremiseId: string };
type StoryGraphDraft = {
  title: unknown;
  parentSummary: unknown;
  childIntro: unknown;
  props: unknown;
  states: unknown;
  beats: unknown;
  setupPayoffs: unknown;
  choice: unknown;
  narrationByBranch: unknown;
  outline: unknown;
  reflectionPrompt: unknown;
};
type ShotDraft = { segments: ShotManifestEntry[] };

function cleanText(value: unknown, name: string, min = 1, max = 1200) {
  if (typeof value !== "string") throw new GoogleApiError(`The compiler returned an invalid ${name}.`, 502);
  const cleaned = value.trim();
  if (cleaned.length < min || cleaned.length > max) {
    throw new GoogleApiError(`The compiler returned an invalid ${name}.`, 502);
  }
  return cleaned;
}

function asObject(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GoogleApiError(`The compiler returned an invalid ${name}.`, 502);
  }
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown, name: string, min = 0, max = 20) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new GoogleApiError(`The compiler returned an invalid ${name}.`, 502);
  }
  return value.map((entry, index) => cleanText(entry, `${name} ${index + 1}`, 1, 500));
}

function normalizedTaintText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function assertMoralInterpretationIsIsolated(
  moralSpec: MoralSpec,
  input: { sourceLesson: string; compiledLesson: string },
) {
  const generatedFields = [
    moralSpec.value,
    moralSpec.desiredBehavior,
    moralSpec.temptingAlternative,
    moralSpec.understandableMotive,
    moralSpec.positiveConsequence,
    moralSpec.naturalWrongConsequence,
    moralSpec.repairAction,
    ...moralSpec.forbiddenTreatments,
  ];
  if (generatedFields.some((field) => PROMPT_INJECTION_PATTERN.test(field))) {
    throw new GoogleApiError("The moral interpreter repeated instructions from untrusted parent input.", 502, true);
  }
  const generated = generatedFields.map(normalizedTaintText);
  for (const rawValue of new Set([input.sourceLesson, input.compiledLesson])) {
    const taint = normalizedTaintText(rawValue);
    const wordCount = taint.split(" ").filter(Boolean).length;
    if (taint.length >= 20 && wordCount >= 3 && generated.some((field) => field.includes(taint))) {
      throw new GoogleApiError("The moral interpreter quoted untrusted parent input instead of compiling it.", 502, true);
    }
  }
}

export function classifyMoralPolicy(sourceLesson: string): PolicyResult {
  const lesson = sourceLesson.trim();
  if (PROMPT_INJECTION_PATTERN.test(lesson)) {
    return {
      decision: "REJECT",
      compiledLesson: lesson,
      reason: "The parent lesson contains instructions aimed at the story system rather than a child-learning goal.",
    };
  }
  if (UNSAFE_STORY_PATTERN.test(lesson)) {
    return {
      decision: "REJECT",
      compiledLesson: lesson,
      reason: "The request contains sexual, self-harm, graphic violence, or other content unsuitable for a child story.",
    };
  }
  if (DISCRIMINATORY_PATTERN.test(lesson)) {
    return {
      decision: "REJECT",
      compiledLesson: lesson,
      reason: "The request uses discriminatory framing that cannot become a child lesson.",
    };
  }
  if (FEAR_PUNISHMENT_PATTERN.test(lesson) || HUMILIATION_PATTERN.test(lesson)) {
    return {
      decision: "REJECT",
      compiledLesson: lesson,
      reason: "Fear, threats, humiliation, and punishment cannot be used as teaching tools.",
    };
  }
  if (UNSAFE_OBEDIENCE_PATTERN.test(lesson)) {
    return {
      decision: "TRANSFORM",
      compiledLesson: "Listen to trusted adults while speaking up about unsafe or uncomfortable requests.",
      reason: "Absolute obedience was transformed into trusted-adult guidance plus personal safety boundaries.",
    };
  }
  if (/(?:not cry|stop crying|չլացել|լաց չլինել)/iu.test(lesson)) {
    return {
      decision: "TRANSFORM",
      compiledLesson: "Understand strong feelings and express them safely while asking for support.",
      reason: "Emotional suppression was transformed into safe emotional expression.",
    };
  }
  if (/(?:liars? are bad|people who lie are bad|ստախոս.*վատ)/iu.test(lesson)) {
    return {
      decision: "TRANSFORM",
      compiledLesson: "Tell the truth, understand its consequences, and repair trust after a mistake.",
      reason: "Character labels were transformed into behavior, consequences, and repair.",
    };
  }
  if (REVIEW_PATTERN.test(lesson)) {
    return {
      decision: "REQUIRE_PARENT_REVIEW",
      compiledLesson: lesson,
      reason: "This sensitive topic requires explicit parent review of the compiled premise and branches before rendering.",
    };
  }
  return {
    decision: "ALLOW",
    compiledLesson: lesson,
    reason: "The lesson can be represented through gentle choices and natural consequences.",
  };
}

export function validateMoralDraft(
  value: unknown,
  input: { sourceLesson: string; compiledLesson: string; ageBand: string; policyDecision: PolicyDecision; policyReason: string },
): MoralSpec {
  const draft = asObject(value, "moral specification");
  const forbiddenTreatments = asStringArray(draft.forbiddenTreatments, "forbidden treatment", 3, 8);
  const moralSpec: MoralSpec = {
    sourceLesson: input.sourceLesson,
    compiledLesson: input.compiledLesson,
    value: cleanText(draft.value, "moral value", 2, 80),
    desiredBehavior: cleanText(draft.desiredBehavior, "desired behavior", 4, 300),
    temptingAlternative: cleanText(draft.temptingAlternative, "tempting alternative", 4, 300),
    understandableMotive: cleanText(draft.understandableMotive, "understandable motive", 4, 300),
    positiveConsequence: cleanText(draft.positiveConsequence, "positive consequence", 4, 300),
    naturalWrongConsequence: cleanText(draft.naturalWrongConsequence, "natural consequence", 4, 300),
    repairAction: cleanText(draft.repairAction, "repair action", 4, 300),
    ageBand: input.ageBand,
    emotionalIntensity: "gentle",
    forbiddenTreatments,
    policyDecision: input.policyDecision,
    policyReason: input.policyReason,
  };
  assertMoralInterpretationIsIsolated(moralSpec, input);
  assertChildSafePackage(moralSpec);
  return moralSpec;
}

export function validatePremiseDraft(value: unknown): PremiseDraft {
  const draft = asObject(value, "premise candidates");
  if (!Array.isArray(draft.candidates) || draft.candidates.length !== 3) {
    throw new GoogleApiError("The premise compiler must return exactly three candidates.", 502);
  }
  const candidates = draft.candidates.map((candidateValue, index) => {
    const candidate = asObject(candidateValue, `premise ${index + 1}`);
    const score = Number(candidate.storynessScore);
    if (!Number.isInteger(score) || score < 1 || score > 100) {
      throw new GoogleApiError(`Premise ${index + 1} has an invalid storyness score.`, 502);
    }
    return {
      id: cleanText(candidate.id, `premise ${index + 1} id`, 3, 80),
      title: cleanText(candidate.title, `premise ${index + 1} title`, 2, 120),
      logline: cleanText(candidate.logline, `premise ${index + 1} logline`, 20, 600),
      externalGoal: cleanText(candidate.externalGoal, `premise ${index + 1} external goal`, 5, 300),
      relationship: cleanText(candidate.relationship, `premise ${index + 1} relationship`, 5, 300),
      escalatingObstacle: cleanText(candidate.escalatingObstacle, `premise ${index + 1} obstacle`, 5, 300),
      setupPayoff: cleanText(candidate.setupPayoff, `premise ${index + 1} payoff`, 5, 300),
      constructiveEffort: cleanText(candidate.constructiveEffort, `premise ${index + 1} constructive effort`, 5, 300),
      temptingAlternative: cleanText(candidate.temptingAlternative, `premise ${index + 1} temptation`, 5, 300),
      naturalConsequence: cleanText(candidate.naturalConsequence, `premise ${index + 1} consequence`, 5, 300),
      storynessScore: score,
    } satisfies AdventurePremise;
  });
  if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) {
    throw new GoogleApiError("Premise IDs must be unique.", 502);
  }
  const requestedId = cleanText(draft.selectedPremiseId, "selected premise id", 3, 80);
  const selected = candidates.find((candidate) => candidate.id === requestedId)
    ?? [...candidates].sort((a, b) => b.storynessScore - a.storynessScore)[0];
  assertChildSafePackage(candidates);
  return { candidates, selectedPremiseId: selected.id };
}

export function validatePremiseRanking(
  value: unknown,
  candidates: AdventurePremise[],
): { candidates: AdventurePremise[]; selection: PremiseSelection } {
  const ranking = asObject(value, "premise ranking");
  if (!Array.isArray(ranking.evaluations) || ranking.evaluations.length !== 3 || candidates.length !== 3) {
    throw new GoogleApiError("The independent premise ranker must evaluate exactly three candidates.", 502);
  }
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const evaluations = ranking.evaluations.map((evaluationValue, index) => {
    const evaluation = asObject(evaluationValue, `premise evaluation ${index + 1}`);
    const premiseId = cleanText(evaluation.premiseId, `premise evaluation ${index + 1} id`, 3, 80);
    const storynessScore = Number(evaluation.storynessScore);
    if (!candidateIds.has(premiseId) || !Number.isInteger(storynessScore) || storynessScore < 1 || storynessScore > 100) {
      throw new GoogleApiError(`Premise evaluation ${index + 1} is invalid.`, 502);
    }
    return {
      premiseId,
      storynessScore,
      passed: evaluation.passed === true && storynessScore >= 60,
      reason: cleanText(evaluation.reason, `premise evaluation ${index + 1} reason`, 8, 500),
    };
  });
  if (new Set(evaluations.map((evaluation) => evaluation.premiseId)).size !== 3) {
    throw new GoogleApiError("The independent premise ranking must cover every candidate exactly once.", 502);
  }
  const passing = evaluations.filter((evaluation) => evaluation.passed);
  if (passing.length === 0) throw new GoogleApiError("No premise passed independent storyness review.", 502, true);
  const selectedPremiseId = cleanText(ranking.selectedPremiseId, "ranked premise id", 3, 80);
  const selected = passing.find((evaluation) => evaluation.premiseId === selectedPremiseId);
  const bestScore = Math.max(...passing.map((evaluation) => evaluation.storynessScore));
  if (!selected || selected.storynessScore !== bestScore) {
    throw new GoogleApiError("The premise ranker did not select its strongest passing candidate.", 502, true);
  }
  const scoreById = new Map(evaluations.map((evaluation) => [evaluation.premiseId, evaluation.storynessScore]));
  return {
    candidates: candidates.map((candidate) => ({
      ...candidate,
      storynessScore: scoreById.get(candidate.id)!,
    })),
    selection: { selectedPremiseId, evaluations },
  };
}

function validateOutline(value: unknown): HierarchicalStoryOutline {
  const outline = asObject(value, "hierarchical outline");
  return {
    setup: asStringArray(outline.setup, "outline setup", 4, 8),
    choiceDilemma: cleanText(outline.choiceDilemma, "outline dilemma", 8, 500),
    constructiveArc: asStringArray(outline.constructiveArc, "constructive outline", 3, 6),
    harmfulArc: asStringArray(outline.harmfulArc, "harmful outline", 4, 7),
    constructiveBridge: cleanText(outline.constructiveBridge, "constructive outline bridge", 8, 500),
    harmfulBridge: cleanText(outline.harmfulBridge, "harmful outline bridge", 8, 500),
    sharedFinale: cleanText(outline.sharedFinale, "outline finale", 8, 500),
    reflectionGoal: cleanText(outline.reflectionGoal, "outline reflection", 8, 500),
  };
}

function validateState(value: unknown, name: string): StoryState {
  const state = asObject(value, name);
  const propStatesRaw = state.propStates;
  const knowledgeRaw = state.characterKnowledge;
  const relationshipsRaw = state.relationships;
  if (!Array.isArray(propStatesRaw) || propStatesRaw.length < 1 || propStatesRaw.length > 4) {
    throw new GoogleApiError(`${name} must track one to four props.`, 502);
  }
  if (!Array.isArray(knowledgeRaw) || knowledgeRaw.length < 2 || knowledgeRaw.length > 6) {
    throw new GoogleApiError(`${name} must track character knowledge.`, 502);
  }
  if (!Array.isArray(relationshipsRaw) || relationshipsRaw.length < 1 || relationshipsRaw.length > 12) {
    throw new GoogleApiError(`${name} must track relationship state.`, 502);
  }
  const result: StoryState = {
    id: cleanText(state.id, `${name} id`, 2, 80),
    time: cleanText(state.time, `${name} time`, 2, 80),
    locationId: cleanText(state.locationId, `${name} location`, 2, 80),
    presentCharacterIds: asStringArray(state.presentCharacterIds, `${name} present characters`, 1, 6),
    propStates: propStatesRaw.map((propValue, index) => {
      const prop = asObject(propValue, `${name} prop ${index + 1}`);
      return {
        propId: cleanText(prop.propId, `${name} prop id`, 2, 80),
        condition: cleanText(prop.condition, `${name} prop condition`, 2, 160),
        holderId: cleanText(prop.holderId, `${name} prop holder`, 2, 80),
      };
    }),
    characterKnowledge: knowledgeRaw.map((knowledgeValue, index) => {
      const knowledge = asObject(knowledgeValue, `${name} knowledge ${index + 1}`);
      return {
        characterId: cleanText(knowledge.characterId, `${name} knowledge character`, 2, 80),
        facts: asStringArray(knowledge.facts, `${name} knowledge facts`, 0, 12),
      };
    }),
    relationships: relationshipsRaw.map((relationshipValue, index) => {
      const relationship = asObject(relationshipValue, `${name} relationship ${index + 1}`);
      return {
        fromCharacterId: cleanText(relationship.fromCharacterId, `${name} relationship source`, 2, 80),
        toCharacterId: cleanText(relationship.toCharacterId, `${name} relationship target`, 2, 80),
        status: cleanText(relationship.status, `${name} relationship status`, 2, 200),
      };
    }),
    unresolvedPromises: asStringArray(state.unresolvedPromises, `${name} unresolved promises`, 0, 12),
  };
  if (new Set(result.propStates.map((entry) => entry.propId)).size !== result.propStates.length) {
    throw new GoogleApiError(`${name} contains duplicate prop state.`, 502);
  }
  if (new Set(result.presentCharacterIds).size !== result.presentCharacterIds.length) {
    throw new GoogleApiError(`${name} contains duplicate present characters.`, 502);
  }
  if (new Set(result.unresolvedPromises).size !== result.unresolvedPromises.length) {
    throw new GoogleApiError(`${name} contains duplicate unresolved promises.`, 502);
  }
  if (result.unresolvedPromises.some((promiseId) => !/^[a-z][a-z0-9_-]*$/i.test(promiseId))) {
    throw new GoogleApiError(`${name} contains an invalid promise ID.`, 502);
  }
  if (new Set(result.characterKnowledge.map((entry) => entry.characterId)).size !== result.characterKnowledge.length) {
    throw new GoogleApiError(`${name} contains duplicate character knowledge.`, 502);
  }
  if (result.characterKnowledge.some((entry) => new Set(entry.facts).size !== entry.facts.length)) {
    throw new GoogleApiError(`${name} contains duplicate character knowledge facts.`, 502);
  }
  const relationshipKeys = result.relationships.map((entry) => `${entry.fromCharacterId}:${entry.toCharacterId}`);
  if (new Set(relationshipKeys).size !== relationshipKeys.length) {
    throw new GoogleApiError(`${name} contains duplicate relationship state.`, 502);
  }
  if (result.relationships.some((entry) => entry.fromCharacterId === entry.toCharacterId)) {
    throw new GoogleApiError(`${name} contains a self-relationship instead of a relationship between characters.`, 502);
  }
  return result;
}

const BEAT_PHASES = new Set<StoryBeat["phase"]>(["setup", "escalation", "choice", "consequence", "repair", "bridge", "finale"]);

function validateBeat(value: unknown, name: string): StoryBeat {
  const beat = asObject(value, name);
  if (typeof beat.phase !== "string" || !BEAT_PHASES.has(beat.phase as StoryBeat["phase"])) {
    throw new GoogleApiError(`${name} has an invalid phase.`, 502);
  }
  const result: StoryBeat = {
    id: cleanText(beat.id, `${name} id`, 2, 80),
    phase: beat.phase as StoryBeat["phase"],
    summary: cleanText(beat.summary, `${name} summary`, 4, 500),
    emotionalTurn: cleanText(beat.emotionalTurn, `${name} emotional turn`, 2, 300),
    reads: asStringArray(beat.reads, `${name} reads`, 1, 12),
    updates: asStringArray(beat.updates, `${name} updates`, 1, 12),
  };
  if (new Set(result.reads).size !== result.reads.length || new Set(result.updates).size !== result.updates.length) {
    throw new GoogleApiError(`${name} contains duplicate state-fact references.`, 502);
  }
  return result;
}

function validateBeatArray(value: unknown, name: string, min: number, max: number) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new GoogleApiError(`${name} must contain ${min}–${max} beats.`, 502);
  }
  const beats = value.map((beat, index) => validateBeat(beat, `${name} beat ${index + 1}`));
  if (new Set(beats.map((beat) => beat.id)).size !== beats.length) {
    throw new GoogleApiError(`${name} beat IDs must be unique.`, 502);
  }
  return beats;
}

function validateChoice(value: unknown): StoryGraph["choice"] {
  const choice = asObject(value, "story choice");
  if (!Array.isArray(choice.options) || choice.options.length !== 2) {
    throw new GoogleApiError("The story choice must contain exactly two options.", 502);
  }
  const options = choice.options.map((optionValue, index) => {
    const option = asObject(optionValue, `choice option ${index + 1}`);
    if (option.id !== "constructive" && option.id !== "harmful") {
      throw new GoogleApiError(`Choice option ${index + 1} has an invalid ID.`, 502);
    }
    return {
      id: option.id,
      childText: cleanText(option.childText, `choice option ${index + 1} child text`, 2, 120),
      explanation: cleanText(option.explanation, `choice option ${index + 1} explanation`, 4, 500),
    } satisfies StoryChoiceOption;
  });
  if (new Set(options.map((option) => option.id)).size !== 2) {
    throw new GoogleApiError("The constructive and harmful choice IDs must both be present.", 502);
  }
  return {
    question: cleanText(choice.question, "choice question", 4, 300),
    options: options as [StoryChoiceOption, StoryChoiceOption],
  };
}

function stateSatisfies(required: StoryState, actual: StoryState) {
  if (required.time !== actual.time || required.locationId !== actual.locationId) return false;
  const sameSet = (left: string[], right: string[]) => {
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    return leftSet.size === left.length && rightSet.size === right.length && leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
  };
  if (!sameSet(required.presentCharacterIds, actual.presentCharacterIds)) return false;
  if (!sameSet(required.unresolvedPromises, actual.unresolvedPromises)) return false;
  if (!required.propStates.every((requiredProp) =>
    actual.propStates.some((prop) =>
      prop.propId === requiredProp.propId &&
      prop.condition === requiredProp.condition &&
      prop.holderId === requiredProp.holderId
    ),
  )) return false;
  if (!required.characterKnowledge.every((requiredKnowledge) => {
    const actualKnowledge = actual.characterKnowledge.find((entry) => entry.characterId === requiredKnowledge.characterId);
    return Boolean(actualKnowledge && requiredKnowledge.facts.every((fact) => actualKnowledge.facts.includes(fact)));
  })) return false;
  return required.relationships.every((requiredRelationship) =>
    actual.relationships.some((relationship) =>
      relationship.fromCharacterId === requiredRelationship.fromCharacterId &&
      relationship.toCharacterId === requiredRelationship.toCharacterId &&
      relationship.status === requiredRelationship.status
    ),
  );
}

function check(id: string, label: string, passed: boolean, detail: string): StoryValidationCheck {
  return { id, label, passed, detail };
}

function allGraphIdsAreCanonical(graph: StoryGraph, canon: StoryCanon) {
  const characterIds = new Set(canon.characterIds);
  const propIds = new Set(canon.props.map((prop) => prop.id));
  const states = [
    graph.initialState,
    graph.branches.constructive.endState,
    graph.branches.harmful.endState,
    graph.convergence.requiredState,
  ];
  return states.every((state) =>
    state.locationId === canon.locationId &&
    state.presentCharacterIds.every((id) => characterIds.has(id)) &&
    state.characterKnowledge.length === canon.characterIds.length &&
    state.characterKnowledge.every((entry) => characterIds.has(entry.characterId)) &&
    state.relationships.every((entry) => characterIds.has(entry.fromCharacterId) && characterIds.has(entry.toCharacterId)) &&
    state.propStates.length === canon.props.length &&
    state.propStates.every((prop) => propIds.has(prop.propId) && (prop.holderId === "none" || characterIds.has(prop.holderId)))
  ) && canon.props.every((canonProp) =>
    graph.initialState.propStates.some((stateProp) =>
      stateProp.propId === canonProp.id &&
      stateProp.condition === canonProp.initialCondition &&
      stateProp.holderId === canonProp.ownerId
    )
  );
}

function allStoryBeats(graph: StoryGraph) {
  return [
    ...graph.commonPrefix,
    ...graph.branches.constructive.beats,
    ...graph.branches.harmful.beats,
    ...graph.convergence.constructiveBridge,
    ...graph.convergence.harmfulBridge,
    ...graph.convergence.finale,
  ];
}

function validateSetupPayoffs(
  value: unknown,
  commonPrefix: StoryBeat[],
  constructiveBeats: StoryBeat[],
  harmfulBeats: StoryBeat[],
  constructiveBridge: StoryBeat[],
  harmfulBridge: StoryBeat[],
  finale: StoryBeat[],
): SetupPayoff[] {
  const setupBeats = commonPrefix.filter((beat) => beat.phase === "setup");
  if (!Array.isArray(value) || setupBeats.length < 1 || value.length !== setupBeats.length) {
    throw new GoogleApiError("Every setup beat must have one constructive and one harmful payoff mapping.", 502);
  }
  const mappings = value.map((mappingValue, index) => {
    const mapping = asObject(mappingValue, `setup payoff ${index + 1}`);
    return {
      setupBeatId: cleanText(mapping.setupBeatId, `setup payoff ${index + 1} setup beat`, 2, 80),
      constructivePayoffBeatId: cleanText(mapping.constructivePayoffBeatId, `setup payoff ${index + 1} constructive beat`, 2, 80),
      harmfulPayoffBeatId: cleanText(mapping.harmfulPayoffBeatId, `setup payoff ${index + 1} harmful beat`, 2, 80),
    } satisfies SetupPayoff;
  });
  const setupIds = new Set(setupBeats.map((beat) => beat.id));
  const mappedSetupIds = new Set(mappings.map((mapping) => mapping.setupBeatId));
  const constructivePayoffIds = new Set([...constructiveBeats, ...constructiveBridge, ...finale].map((beat) => beat.id));
  const harmfulPayoffIds = new Set([...harmfulBeats, ...harmfulBridge, ...finale].map((beat) => beat.id));
  if (
    mappedSetupIds.size !== mappings.length ||
    mappedSetupIds.size !== setupIds.size ||
    [...setupIds].some((id) => !mappedSetupIds.has(id)) ||
    mappings.some((mapping) =>
      !constructivePayoffIds.has(mapping.constructivePayoffBeatId) ||
      !harmfulPayoffIds.has(mapping.harmfulPayoffBeatId)
    )
  ) {
    throw new GoogleApiError("Setup payoff mappings must resolve every setup to real later beats on both paths.", 502);
  }
  return mappings;
}

function validateStoredGraphStructure(graph: StoryGraph) {
  const states = [
    validateState(graph.initialState, "stored initial state"),
    validateState(graph.branches.constructive.endState, "stored constructive end state"),
    validateState(graph.branches.harmful.endState, "stored harmful end state"),
    validateState(graph.convergence.requiredState, "stored finale-required state"),
  ];
  if (new Set(states.map((state) => state.id)).size !== states.length) {
    throw new GoogleApiError("Stored story state IDs must be unique.", 502);
  }
  const commonPrefix = validateBeatArray(graph.commonPrefix, "stored common prefix", 4, 8);
  const constructiveBeats = validateBeatArray(graph.branches.constructive.beats, "stored constructive branch", 3, 6);
  const harmfulBeats = validateBeatArray(graph.branches.harmful.beats, "stored harmful branch", 3, 6);
  const constructiveBridge = validateBeatArray(graph.convergence.constructiveBridge, "stored constructive bridge", 1, 3);
  const harmfulBridge = validateBeatArray(graph.convergence.harmfulBridge, "stored harmful bridge", 1, 3);
  const finale = validateBeatArray(graph.convergence.finale, "stored finale", 1, 3);
  const beatIds = [...commonPrefix, ...constructiveBeats, ...harmfulBeats, ...constructiveBridge, ...harmfulBridge, ...finale].map((beat) => beat.id);
  if (new Set(beatIds).size !== beatIds.length) {
    throw new GoogleApiError("Stored story beat IDs must be unique across every path.", 502);
  }
  validateSetupPayoffs(graph.setupPayoffs, commonPrefix, constructiveBeats, harmfulBeats, constructiveBridge, harmfulBridge, finale);
  validateChoice(graph.choice);
  cleanText(graph.convergence.narrationByBranch.constructive, "stored constructive narration", 3, 240);
  cleanText(graph.convergence.narrationByBranch.harmful, "stored harmful narration", 3, 240);
  cleanText(graph.reflectionPrompt, "stored reflection prompt", 3, 300);
}

function isDeclaredStateFact(reference: string, canon: StoryCanon, graph: StoryGraph) {
  if (reference === "time" || reference === "location") return true;
  const parts = reference.split(".");
  if (parts[0] === "presence" && parts.length === 2) return canon.characterIds.includes(parts[1]);
  if (parts[0] === "knowledge" && parts.length === 2) return canon.characterIds.includes(parts[1]);
  if (parts[0] === "promise" && parts.length === 2) {
    const declaredPromises = new Set([
      ...graph.initialState.unresolvedPromises,
      ...graph.branches.constructive.endState.unresolvedPromises,
      ...graph.branches.harmful.endState.unresolvedPromises,
      ...graph.convergence.requiredState.unresolvedPromises,
    ]);
    return declaredPromises.has(parts[1]);
  }
  if (parts[0] === "prop" && parts.length === 3) {
    return canon.props.some((prop) => prop.id === parts[1]) && (parts[2] === "condition" || parts[2] === "holder");
  }
  if (parts[0] === "relationship" && parts.length === 3) {
    const relationshipKeys = new Set([
      ...graph.initialState.relationships,
      ...graph.branches.constructive.endState.relationships,
      ...graph.branches.harmful.endState.relationships,
      ...graph.convergence.requiredState.relationships,
    ].map((entry) => `${entry.fromCharacterId}:${entry.toCharacterId}`));
    return canon.characterIds.includes(parts[1]) && canon.characterIds.includes(parts[2]) && relationshipKeys.has(`${parts[1]}:${parts[2]}`);
  }
  return false;
}

function setupPayoffsAreValid(graph: StoryGraph) {
  try {
    validateSetupPayoffs(
      graph.setupPayoffs,
      graph.commonPrefix,
      graph.branches.constructive.beats,
      graph.branches.harmful.beats,
      graph.convergence.constructiveBridge,
      graph.convergence.harmfulBridge,
      graph.convergence.finale,
    );
    return true;
  } catch {
    return false;
  }
}

export function deterministicGraphChecks(
  graph: StoryGraph,
  canon: StoryCanon,
  premises: AdventurePremise[],
  selectedPremiseId?: string,
) {
  const constructive = graph.branches.constructive;
  const harmful = graph.branches.harmful;
  const optionIds = graph.choice.options.map((option) => option.id);
  const selectedPremise = premises.find((premise) => premise.id === selectedPremiseId)
    ?? [...premises].sort((a, b) => b.storynessScore - a.storynessScore)[0];
  const harmfulConsequenceIndex = harmful.beats.findIndex((beat) => beat.phase === "consequence");
  const harmfulRepairIndex = harmful.beats.findIndex((beat) => beat.phase === "repair");
  const factReferences = allStoryBeats(graph).flatMap((beat) => [...beat.reads, ...beat.updates]);
  return [
    check("storyness", "Selected adventure premise passes the storyness contract", Boolean(selectedPremise && selectedPremise.storynessScore >= 60), "The selected premise has a goal, relationship, obstacle, payoff, effort, temptation, and natural consequence."),
    check("two_choices", "Exactly two child-facing choices", optionIds.length === 2 && new Set(optionIds).size === 2 && optionIds.includes("constructive") && optionIds.includes("harmful"), "The decision has one constructive action and one understandable shortcut."),
    check("shared_origin", "Both branches share the same origin state", constructive.originStateId === graph.initialState.id && harmful.originStateId === graph.initialState.id, "Both paths begin from the exact same knowledge, props, location, and promises."),
    check("escalation", "The setup escalates before the choice", graph.commonPrefix.length >= 4 && graph.commonPrefix.some((beat) => beat.phase === "escalation"), "The story earns its choice through a causal setup."),
    check("setup_payoffs", "Every setup pays off on both paths", setupPayoffsAreValid(graph), "Every setup-phase beat maps to a real later payoff or resolution on the constructive and harmful paths."),
    check("repair", "The harmful branch contains consequence followed by repair", harmfulConsequenceIndex >= 0 && harmfulRepairIndex > harmfulConsequenceIndex, "The mistaken choice remains a complete mini-arc with a natural consequence before repair."),
    check("constructive_effort", "The constructive branch requires effort", constructive.beats.length >= 3, "The caring action is meaningful rather than effortless."),
    check("constructive_convergence", "Constructive path satisfies finale state", stateSatisfies(graph.convergence.requiredState, constructive.endState), "The finale preconditions follow from the constructive path."),
    check("harmful_convergence", "Harmful path satisfies finale state", stateSatisfies(graph.convergence.requiredState, harmful.endState), "The repair path restores every finale precondition."),
    check("canon_ids", "Every state uses locked canon IDs", allGraphIdsAreCanonical(graph, canon), "Characters, location, prop ownership, and knowledge use registered IDs only."),
    check("state_fact_refs", "Every beat reads and updates declared state facts", allStoryBeats(graph).every((beat) => beat.reads.length > 0 && beat.updates.length > 0) && factReferences.every((reference) => isDeclaredStateFact(reference, canon, graph)), "Beat transitions use typed keys for time, place, presence, props, knowledge, relationships, and promises declared by the graph."),
    check("parameterized_finale", "The shared finale keeps distinct branch-aware narration", Boolean(graph.convergence.narrationByBranch.constructive && graph.convergence.narrationByBranch.harmful && graph.convergence.narrationByBranch.constructive !== graph.convergence.narrationByBranch.harmful), "The shared visual ending explains the selected route without erasing the child's choice."),
  ];
}

export function validateGraphDraft(
  value: unknown,
  input: { canonBase: Omit<StoryCanon, "props">; premises: AdventurePremise[]; selectedPremiseId: string },
): { graph: StoryGraph; outline: HierarchicalStoryOutline; canon: StoryCanon; title: string; parentSummary: string; childIntro: string; checks: StoryValidationCheck[] } {
  const draft = asObject(value, "story graph") as unknown as StoryGraphDraft;
  if (!Array.isArray(draft.props) || draft.props.length < 1 || draft.props.length > 4) {
    throw new GoogleApiError("The story graph must register one to four props.", 502);
  }
  const props = draft.props.map((propValue, index) => {
    const prop = asObject(propValue, `canon prop ${index + 1}`);
    const ownerId = cleanText(prop.ownerId, `canon prop ${index + 1} owner`, 2, 80);
    if (ownerId !== "none" && !input.canonBase.characterIds.includes(ownerId)) {
      throw new GoogleApiError(`Canon prop ${index + 1} has an unregistered owner.`, 502);
    }
    return {
      id: cleanText(prop.id, `canon prop ${index + 1} id`, 2, 80),
      name: cleanText(prop.name, `canon prop ${index + 1} name`, 2, 120),
      ownerId,
      initialCondition: cleanText(prop.initialCondition, `canon prop ${index + 1} condition`, 2, 160),
    };
  });
  if (new Set(props.map((prop) => prop.id)).size !== props.length) {
    throw new GoogleApiError("Canon prop IDs must be unique.", 502);
  }
  const canon: StoryCanon = { ...input.canonBase, props };

  if (!Array.isArray(draft.states) || draft.states.length !== 4) {
    throw new GoogleApiError("The story graph must contain exactly four typed states.", 502);
  }
  const stateRoles = ["initial", "constructive_end", "harmful_end", "finale_required"] as const;
  type StateRole = (typeof stateRoles)[number];
  const stateByRole = new Map<StateRole, StoryState>();
  for (const [index, stateValue] of draft.states.entries()) {
    const stateObject = asObject(stateValue, `typed state ${index + 1}`);
    if (typeof stateObject.role !== "string" || !stateRoles.includes(stateObject.role as StateRole) || stateByRole.has(stateObject.role as StateRole)) {
      throw new GoogleApiError(`Typed state ${index + 1} has an invalid or duplicate role.`, 502);
    }
    stateByRole.set(
      stateObject.role as StateRole,
      validateState(stateObject, `${stateObject.role} state`),
    );
  }
  if (!stateRoles.every((role) => stateByRole.has(role))) {
    throw new GoogleApiError("The story graph is missing a required state role.", 502);
  }
  const stateIds = [...stateByRole.values()].map((state) => state.id);
  if (new Set(stateIds).size !== stateIds.length) {
    throw new GoogleApiError("Story state IDs must be unique.", 502);
  }

  if (!Array.isArray(draft.beats) || draft.beats.length < 13 || draft.beats.length > 29) {
    throw new GoogleApiError("The story graph must contain 13–29 ordered beats.", 502);
  }
  const beatPaths = ["common", "constructive", "harmful", "constructive_bridge", "harmful_bridge", "finale"] as const;
  type BeatPath = (typeof beatPaths)[number];
  const rawBeats = draft.beats.map((beatValue, index) => {
    const beat = asObject(beatValue, `flat beat ${index + 1}`);
    if (typeof beat.path !== "string" || !beatPaths.includes(beat.path as BeatPath)) {
      throw new GoogleApiError(`Flat beat ${index + 1} has an invalid path.`, 502);
    }
    const order = Number(beat.order);
    if (!Number.isInteger(order) || order < 1 || order > 8) {
      throw new GoogleApiError(`Flat beat ${index + 1} has an invalid order.`, 502);
    }
    const summary = cleanText(beat.summary, `flat beat ${index + 1} summary`, 4, 500);
    const emotionalTurn = cleanText(beat.emotionalTurn, `flat beat ${index + 1} emotional turn`, 2, 300);
    return {
      path: beat.path as BeatPath,
      order,
      value: {
        ...beat,
        summary,
        emotionalTurn,
        reads: asStringArray(beat.reads, `flat beat ${index + 1} reads`, 1, 12),
        updates: asStringArray(beat.updates, `flat beat ${index + 1} updates`, 1, 12),
      },
    };
  });
  const groupedBeats = (path: BeatPath, name: string, min: number, max: number) => {
    const group = rawBeats.filter((beat) => beat.path === path).sort((a, b) => a.order - b.order);
    if (!group.every((beat, index) => beat.order === index + 1)) {
      throw new GoogleApiError(`${name} beat order must start at one and remain contiguous.`, 502);
    }
    return validateBeatArray(group.map((beat) => beat.value), name, min, max);
  };
  const commonPrefix = groupedBeats("common", "common prefix", 4, 8);
  const constructiveBeats = groupedBeats("constructive", "constructive branch", 3, 6);
  const harmfulBeats = groupedBeats("harmful", "harmful branch", 3, 6);
  const constructiveBridge = groupedBeats("constructive_bridge", "constructive bridge", 1, 3);
  const harmfulBridge = groupedBeats("harmful_bridge", "harmful bridge", 1, 3);
  const finale = groupedBeats("finale", "shared finale", 1, 3);
  const allBeatIds = [...commonPrefix, ...constructiveBeats, ...harmfulBeats, ...constructiveBridge, ...harmfulBridge, ...finale].map((beat) => beat.id);
  if (new Set(allBeatIds).size !== allBeatIds.length) {
    throw new GoogleApiError("Story beat IDs must be unique across every path.", 502);
  }
  const setupPayoffs = validateSetupPayoffs(
    draft.setupPayoffs,
    commonPrefix,
    constructiveBeats,
    harmfulBeats,
    constructiveBridge,
    harmfulBridge,
    finale,
  );

  const narration = asObject(draft.narrationByBranch, "branch-aware narration");
  const outline = validateOutline(draft.outline);
  const initialState = stateByRole.get("initial")!;
  const requiredState = stateByRole.get("finale_required")!;
  const constructiveNarration = cleanText(narration.constructive, "constructive finale narration", 3, 240);
  const harmfulNarration = cleanText(narration.harmful, "harmful finale narration", 3, 240);
  if ([constructiveNarration, harmfulNarration].some((line) => line.split(/\s+/u).filter(Boolean).length > 32)) {
    throw new GoogleApiError("Branch-aware finale narration must fit the shared eight-second ending.", 502, true);
  }
  const graph: StoryGraph = {
    initialState,
    commonPrefix,
    setupPayoffs,
    choice: validateChoice(draft.choice),
    branches: {
      constructive: {
        originStateId: initialState.id,
        beats: constructiveBeats,
        endState: stateByRole.get("constructive_end")!,
      },
      harmful: {
        originStateId: initialState.id,
        beats: harmfulBeats,
        endState: stateByRole.get("harmful_end")!,
      },
    },
    convergence: {
      requiredState,
      constructiveBridge,
      harmfulBridge,
      finale,
      narrationByBranch: {
        constructive: constructiveNarration,
        harmful: harmfulNarration,
      },
    },
    reflectionPrompt: cleanText(draft.reflectionPrompt, "reflection prompt", 3, 300),
  };
  const checks = deterministicGraphChecks(graph, canon, input.premises, input.selectedPremiseId);
  const failed = checks.filter((entry) => !entry.passed);
  if (failed.length > 0) {
    throw new GoogleApiError(`The story graph failed validation: ${failed.map((entry) => entry.label).join(", ")}.`, 502, true);
  }
  const title = cleanText(draft.title, "story title", 2, 120);
  const parentSummary = cleanText(draft.parentSummary, "parent summary", 20, 600);
  const childIntro = cleanText(draft.childIntro, "narrator setup", 5, 500);
  assertChildSafePackage({ graph, canon, title, parentSummary, childIntro });
  return { graph, outline, canon, title, parentSummary, childIntro, checks };
}

export function validateSemanticReview(value: unknown): SemanticReview {
  const review = asObject(value, "semantic review");
  const scoreNames = ["storyInterest", "causalContinuity", "choiceMeaning", "consequenceProportion", "repairQuality", "ageFit", "moralClarity", "childSafety", "convergence"] as const;
  const scores = Object.fromEntries(scoreNames.map((name) => {
    const score = Number(review[name]);
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new GoogleApiError(`The independent review returned an invalid ${name} score.`, 502);
    }
    return [name, score];
  })) as Record<(typeof scoreNames)[number], number>;
  return {
    approved: review.approved === true && scoreNames.every((name) => scores[name] >= 3),
    ...scores,
    concerns: asStringArray(review.concerns, "review concern", 0, 8),
  };
}

const EXPECTED_SEGMENTS: Array<{ clipId: ClipId; segmentIndex: number; durationSeconds: 6 | 7 | 8 }> = [
  { clipId: "opening", segmentIndex: 0, durationSeconds: 8 },
  { clipId: "positive", segmentIndex: 0, durationSeconds: 6 },
  { clipId: "positive", segmentIndex: 1, durationSeconds: 7 },
  { clipId: "positive", segmentIndex: 2, durationSeconds: 7 },
  { clipId: "negative", segmentIndex: 0, durationSeconds: 6 },
  { clipId: "negative", segmentIndex: 1, durationSeconds: 7 },
  { clipId: "negative", segmentIndex: 2, durationSeconds: 7 },
  { clipId: "ending", segmentIndex: 0, durationSeconds: 8 },
];

export function validateShotDraft(value: unknown, canon: StoryCanon): ShotManifestEntry[] {
  const draft = asObject(value, "shot manifest") as unknown as ShotDraft;
  if (!Array.isArray(draft.segments) || draft.segments.length !== EXPECTED_SEGMENTS.length) {
    throw new GoogleApiError("The shot compiler must return exactly eight segments.", 502);
  }
  const canonicalCharacters = new Set(canon.characterIds);
  const canonicalProps = new Set(canon.props.map((prop) => prop.id));
  const ids = new Set<string>();
  const shots = draft.segments.map((shotValue, index) => {
    const shot = asObject(shotValue, `shot ${index + 1}`);
    const expected = EXPECTED_SEGMENTS[index];
    const id = cleanText(shot.id, `shot ${index + 1} id`, 2, 80);
    if (ids.has(id)) throw new GoogleApiError("Shot IDs must be unique.", 502);
    ids.add(id);
    if (shot.clipId !== expected.clipId || shot.segmentIndex !== expected.segmentIndex || shot.durationSeconds !== expected.durationSeconds) {
      throw new GoogleApiError(`Shot ${index + 1} does not match the required four-clip layout.`, 502);
    }
    const characterIds = asStringArray(shot.characterIds, `shot ${index + 1} characters`, 1, 6);
    const propIds = asStringArray(shot.propIds, `shot ${index + 1} props`, 0, 4);
    if (!characterIds.every((characterId) => canonicalCharacters.has(characterId))) {
      throw new GoogleApiError(`Shot ${index + 1} introduces an unregistered character.`, 502);
    }
    if (!propIds.every((propId) => canonicalProps.has(propId))) {
      throw new GoogleApiError(`Shot ${index + 1} introduces an unregistered prop.`, 502);
    }
    if (shot.locationId !== canon.locationId) {
      throw new GoogleApiError(`Shot ${index + 1} changes the locked location.`, 502);
    }
    const timedBeats = asStringArray(shot.timedBeats, `shot ${index + 1} timed beats`, 3, 3) as [string, string, string];
    const continuityFrom = typeof shot.continuityFrom === "string" ? shot.continuityFrom.trim().slice(0, 160) : "";
    if (expected.segmentIndex === 0 && continuityFrom) {
      throw new GoogleApiError(`Shot ${index + 1} is a fresh clip and cannot depend on provider video continuity.`, 502);
    }
    if (expected.segmentIndex > 0) {
      const previousShot = asObject(draft.segments[index - 1], `shot ${index} predecessor`);
      const previousShotId = cleanText(previousShot.id, `shot ${index} predecessor id`, 2, 80);
      if (continuityFrom !== previousShotId || previousShot.clipId !== expected.clipId) {
        throw new GoogleApiError(`Shot ${index + 1} must continue from the exact previous segment ID.`, 502);
      }
    }
    const spokenText = cleanText(shot.spokenText, `shot ${index + 1} spoken text`, 1, 350);
    const wordCount = spokenText.split(/\s+/u).filter(Boolean).length;
    if (wordCount > expected.durationSeconds * 4) {
      throw new GoogleApiError(`Shot ${index + 1} contains too much dialogue for its duration.`, 502, true);
    }
    return {
      id,
      clipId: expected.clipId,
      segmentIndex: expected.segmentIndex,
      durationSeconds: expected.durationSeconds,
      characterIds,
      locationId: canon.locationId,
      propIds,
      timedBeats,
      emotion: cleanText(shot.emotion, `shot ${index + 1} emotion`, 2, 300),
      camera: cleanText(shot.camera, `shot ${index + 1} camera`, 2, 300),
      audioDirection: cleanText(shot.audioDirection, `shot ${index + 1} audio direction`, 2, 300),
      spokenText,
      continuityFrom,
    } satisfies ShotManifestEntry;
  });
  assertChildSafePackage(shots);
  return shots;
}

function timingLabels(duration: 6 | 7 | 8) {
  if (duration === 8) return ["[0-2s]", "[2-6s]", "[6-8s]"];
  if (duration === 6) return ["[0-2s]", "[2-5s]", "[5-6s]"];
  return ["[0-3s]", "[3-6s]", "[6-7s]"];
}

export function composeVideoPrompt(shot: ShotManifestEntry, canon: StoryCanon, continuitySeed: number) {
  const timing = timingLabels(shot.durationSeconds);
  const beats = shot.timedBeats.map((beat, index) => `${timing[index]} ${beat}`).join(" ");
  const resolvedProps = shot.propIds.map((propId) => {
    const prop = canon.props.find((candidate) => candidate.id === propId)!;
    return `${prop.id} is the ${prop.name}; registered owner ${prop.ownerId}; initial condition ${prop.initialCondition}`;
  }).join("; ") || "none";
  const canonResolution = `Locked visual canon: character IDs ${shot.characterIds.join(", ")} resolve to ${canon.characterBible} Location ID ${canon.locationId} resolves to ${canon.locationBible} Registered props in frame resolve as: ${resolvedProps}. Visual style: ${canon.visualStyle}. Landscape 16:9 at 720p, no humans, no brands, no logos, no captions, no on-screen text.`;
  const spoken = `Exact spoken narration and dialogue, word-for-word: “${shot.spokenText}”`;
  if (shot.segmentIndex === 0) {
    return `${canonResolution} Fresh clip with shared continuity seed ${continuitySeed}. Preserve the exact character proportions, clothing, palette, light direction, narrator voice ${canon.narratorVoiceId}, and camera language from the locked canon. One clear continuous action: ${beats} Emotion: ${shot.emotion}. Camera: ${shot.camera}. Audio: ${shot.audioDirection}. ${spoken} Keep motion physically continuous, expressions child-readable, consequences gentle, and every registered prop visually consistent with its resolved identity and the timed action.`;
  }
  return `Provider continuation from segment ${shot.continuityFrom}. Describe only the next action; inherit the exact existing characters, wardrobe, props, location, lighting, voice, and camera axis from the supplied video. Do not recap, restart, redesign, change wardrobe, change location, jump lighting, or reverse the camera. Next continuous action: ${beats} Emotion: ${shot.emotion}. Camera motion: ${shot.camera}. Audio continuation: ${shot.audioDirection}. ${spoken} Keep motion physically continuous and consequences gentle.`;
}

function clipFromShots(
  clipId: ClipId,
  shots: ShotManifestEntry[],
  graph: StoryGraph,
  canon: StoryCanon,
  continuitySeed: number,
): StoryClip {
  const clipShots = shots.filter((shot) => shot.clipId === clipId).sort((a, b) => a.segmentIndex - b.segmentIndex);
  const first = clipShots[0];
  if (!first) throw new GoogleApiError(`The ${clipId} shot is missing.`, 502);
  const constructive = graph.choice.options.find((option) => option.id === "constructive")!;
  const harmful = graph.choice.options.find((option) => option.id === "harmful")!;
  const summaries = clipId === "opening"
    ? graph.commonPrefix.map((beat) => beat.summary)
    : clipId === "positive"
      ? graph.branches.constructive.beats.map((beat) => beat.summary)
      : clipId === "negative"
        ? graph.branches.harmful.beats.map((beat) => beat.summary)
        : graph.convergence.finale.map((beat) => beat.summary);
  return {
    id: clipId,
    title: clipId === "positive" ? constructive.childText : clipId === "negative" ? harmful.childText : clipId === "ending" ? "Shared ending" : "Adventure setup",
    summary: summaries.join(" ").slice(0, 500),
    prompt: composeVideoPrompt(first, canon, continuitySeed),
    caption: first.spokenText,
    extensions: clipShots.slice(1).map((shot) => ({
      prompt: composeVideoPrompt(shot, canon, continuitySeed),
      caption: shot.spokenText,
    })),
    ...(clipId === "ending" ? {
      branchNarration: {
        positive: graph.convergence.narrationByBranch.constructive,
        negative: graph.convergence.narrationByBranch.harmful,
      },
    } : {}),
  };
}

function shotChecks(shots: ShotManifestEntry[], canon: StoryCanon) {
  const durations = Object.fromEntries(CLIP_IDS.map((clipId) => [clipId, shots.filter((shot) => shot.clipId === clipId).reduce((sum, shot) => sum + shot.durationSeconds, 0)]));
  return [
    check("shot_count", "Eight short segments are compiled", shots.length === 8, "The four playback clips are assembled from eight bounded generation segments."),
    check("duration_budget", "Every clip matches its duration budget", durations.opening === 8 && durations.positive === 20 && durations.negative === 20 && durations.ending === 8, "Clip durations are 8s, 20s, 20s, and 8s."),
    check("shot_canon", "Every shot uses locked visual canon", shots.every((shot) => shot.locationId === canon.locationId && shot.characterIds.every((id) => canon.characterIds.includes(id)) && shot.propIds.every((id) => canon.props.some((prop) => prop.id === id))), "No shot can introduce an unregistered character, prop, or location."),
    check("single_action", "Every segment has three timed motion beats", shots.every((shot) => shot.timedBeats.length === 3), "Each short render has bounded, inspectable motion."),
  ];
}

export function assembleStoryPackage(input: {
  moralSpec: MoralSpec;
  premiseCandidates: AdventurePremise[];
  premiseSelection: PremiseSelection;
  selectedPremiseId: string;
  outline: HierarchicalStoryOutline;
  title: string;
  parentSummary: string;
  childIntro: string;
  canon: StoryCanon;
  graph: StoryGraph;
  shots: ShotManifestEntry[];
  graphChecks: StoryValidationCheck[];
  semanticReview: SemanticReview;
  continuitySeed: number;
  parentReview?: ParentReview;
}): StoryPackage {
  const constructive = input.graph.choice.options.find((option) => option.id === "constructive");
  const harmful = input.graph.choice.options.find((option) => option.id === "harmful");
  if (!constructive || !harmful) throw new GoogleApiError("The story choices are incomplete.", 502);
  const checks = [...input.graphChecks, ...shotChecks(input.shots, input.canon)];
  checks.push(check("semantic_review", "Independent semantic review approved", input.semanticReview.approved, input.semanticReview.concerns.length ? input.semanticReview.concerns.join("; ") : "All semantic scores meet the release threshold."));
  if (checks.some((entry) => !entry.passed)) {
    throw new GoogleApiError("The compiled story did not pass every release check.", 502, true);
  }
  const storyPackage: StoryPackage = {
    title: input.title,
    parentSummary: input.parentSummary,
    childIntro: input.childIntro,
    choiceQuestion: input.graph.choice.question,
    positiveChoice: { label: constructive.childText, explanation: constructive.explanation },
    negativeChoice: { label: harmful.childText, explanation: harmful.explanation },
    continuitySeed: input.continuitySeed,
    clips: CLIP_IDS.map((clipId) => clipFromShots(clipId, input.shots, input.graph, input.canon, input.continuitySeed)),
    compiler: {
      schemaVersion: "1.1",
      promptVersion: "branching-compiler-v2",
      model: GEMINI_COMPILER_MODEL,
      compiledAt: Date.now(),
      stages: ["policy", "premises", "premise_rank", "outline", "story_graph", "independent_review", "shot_manifest"].map((id) => ({ id: id as StoryPackage["compiler"]["stages"][number]["id"], status: "passed" as const })),
    },
    moralSpec: input.moralSpec,
    premiseCandidates: input.premiseCandidates,
    premiseSelection: input.premiseSelection,
    selectedPremiseId: input.selectedPremiseId,
    outline: input.outline,
    canon: input.canon,
    graph: input.graph,
    shots: input.shots,
    parentReview: input.parentReview ?? {
      status: "pending",
      reviewedAt: null,
      sensitiveTopicAcknowledged: false,
    },
    validation: { valid: true, checks, semanticReview: input.semanticReview },
  };
  validateStoryPackage(storyPackage);
  return storyPackage;
}

export function assertChildSafePackage(value: unknown) {
  const excludedKeys = new Set(["sourceLesson", "forbiddenTreatments", "policyReason", "concerns"]);
  const text: string[] = [];
  const visit = (entry: unknown, key = "") => {
    if (excludedKeys.has(key)) return;
    if (typeof entry === "string") {
      text.push(entry);
      return;
    }
    if (Array.isArray(entry)) {
      entry.forEach((item) => visit(item, key));
      return;
    }
    if (entry && typeof entry === "object") {
      Object.entries(entry as Record<string, unknown>).forEach(([childKey, child]) => visit(child, childKey));
    }
  };
  visit(value);
  const generatedText = text.join("\n");
  if (
    !UNSAFE_STORY_PATTERN.test(generatedText) &&
    !DISCRIMINATORY_PATTERN.test(generatedText) &&
    !FEAR_PUNISHMENT_PATTERN.test(generatedText) &&
    !HUMILIATION_PATTERN.test(generatedText) &&
    !PROMPT_INJECTION_PATTERN.test(generatedText)
  ) return;
  throw new GoogleApiError("The story compiler produced content outside the child-safety policy. Please try a different framing.", 502);
}

export function validateStoryPackage(value: unknown, options: { requireParentApproval?: boolean } = {}): StoryPackage {
  const plan = asObject(value, "story package") as unknown as StoryPlan;
  if (
    plan.compiler?.schemaVersion !== "1.1" ||
    plan.compiler.promptVersion !== "branching-compiler-v2" ||
    plan.compiler.model !== GEMINI_COMPILER_MODEL ||
    !plan.moralSpec ||
    !plan.premiseSelection ||
    !plan.outline ||
    !plan.graph ||
    !plan.canon ||
    !plan.parentReview ||
    !plan.validation
  ) {
    throw new GoogleApiError("The stored story package is missing compiler artifacts.", 422);
  }
  const expectedStages: StoryPackage["compiler"]["stages"][number]["id"][] = [
    "policy",
    "premises",
    "premise_rank",
    "outline",
    "story_graph",
    "independent_review",
    "shot_manifest",
  ];
  if (
    !Array.isArray(plan.compiler.stages) ||
    plan.compiler.stages.length !== expectedStages.length ||
    !expectedStages.every((id, index) => plan.compiler!.stages[index]?.id === id && plan.compiler!.stages[index]?.status === "passed")
  ) {
    throw new GoogleApiError("The stored compiler trace is incomplete.", 422);
  }
  if (!Array.isArray(plan.premiseCandidates) || plan.premiseCandidates.length !== 3 || !Array.isArray(plan.shots) || !Array.isArray(plan.clips)) {
    throw new GoogleApiError("The stored story package is incomplete.", 422);
  }

  const policy = classifyMoralPolicy(plan.moralSpec.sourceLesson);
  if (
    policy.decision === "REJECT" ||
    plan.moralSpec.policyDecision !== policy.decision ||
    plan.moralSpec.compiledLesson !== policy.compiledLesson ||
    plan.moralSpec.policyReason !== policy.reason
  ) {
    throw new GoogleApiError("The stored moral policy is invalid or no longer renderable.", 422);
  }
  const validatedMoral = validateMoralDraft(plan.moralSpec, {
    sourceLesson: plan.moralSpec.sourceLesson,
    compiledLesson: policy.compiledLesson,
    ageBand: plan.moralSpec.ageBand,
    policyDecision: policy.decision,
    policyReason: policy.reason,
  });
  if (JSON.stringify(validatedMoral) !== JSON.stringify(plan.moralSpec)) {
    throw new GoogleApiError("The stored moral specification is malformed.", 422);
  }

  const premiseDraft = validatePremiseDraft({
    candidates: plan.premiseCandidates,
    selectedPremiseId: plan.selectedPremiseId,
  });
  const ranked = validatePremiseRanking(plan.premiseSelection, plan.premiseCandidates);
  if (
    premiseDraft.candidates.length !== 3 ||
    JSON.stringify(premiseDraft.candidates) !== JSON.stringify(plan.premiseCandidates) ||
    ranked.selection.selectedPremiseId !== plan.selectedPremiseId ||
    ranked.selection.evaluations.some((evaluation) =>
      plan.premiseCandidates!.find((premise) => premise.id === evaluation.premiseId)?.storynessScore !== evaluation.storynessScore
    )
  ) {
    throw new GoogleApiError("The stored premise ranking is inconsistent.", 422);
  }
  const validatedOutline = validateOutline(plan.outline);
  if (JSON.stringify(validatedOutline) !== JSON.stringify(plan.outline)) {
    throw new GoogleApiError("The stored hierarchical outline is malformed.", 422);
  }

  const parentReview = plan.parentReview;
  const reviewShapeValid = parentReview.status === "pending"
    ? parentReview.reviewedAt === null && parentReview.sensitiveTopicAcknowledged === false
    : parentReview.status === "approved" && Number.isInteger(parentReview.reviewedAt) && Number(parentReview.reviewedAt) > 0;
  if (
    !reviewShapeValid ||
    (options.requireParentApproval && parentReview.status !== "approved") ||
    (options.requireParentApproval && policy.decision === "REQUIRE_PARENT_REVIEW" && !parentReview.sensitiveTopicAcknowledged)
  ) {
    throw new GoogleApiError("The story requires a valid parent approval before rendering.", 422);
  }

  if (plan.clips.length !== CLIP_IDS.length || new Set(plan.clips.map((clip) => clip.id)).size !== CLIP_IDS.length) {
    throw new GoogleApiError("The stored story package must contain four unique clips.", 422);
  }
  if (!Number.isInteger(plan.continuitySeed) || plan.continuitySeed < 0 || plan.continuitySeed > 0xffff_ffff) {
    throw new GoogleApiError("The stored continuity seed is invalid.", 422);
  }
  const semanticReview = validateSemanticReview(plan.validation.semanticReview);
  if (!plan.validation.valid || !semanticReview.approved) {
    throw new GoogleApiError("The stored story package has not passed validation.", 422);
  }

  validateStoredGraphStructure(plan.graph);
  const validatedShots = validateShotDraft({ segments: plan.shots }, plan.canon);
  const checks = [
    ...deterministicGraphChecks(plan.graph, plan.canon, plan.premiseCandidates, plan.selectedPremiseId),
    ...shotChecks(validatedShots, plan.canon),
    check("semantic_review", "Independent semantic review approved", semanticReview.approved, semanticReview.concerns.length ? semanticReview.concerns.join("; ") : "All semantic scores meet the release threshold."),
  ];
  const expectedCheckIds = checks.map((entry) => entry.id);
  const storedCheckIds = Array.isArray(plan.validation.checks) ? plan.validation.checks.map((entry) => entry.id) : [];
  if (
    checks.some((entry) => !entry.passed) ||
    storedCheckIds.length !== expectedCheckIds.length ||
    !expectedCheckIds.every((id) => storedCheckIds.includes(id)) ||
    plan.validation.checks.some((entry) => !entry.passed)
  ) {
    throw new GoogleApiError("The stored story package no longer satisfies compiler invariants.", 422);
  }

  const expectedClips = CLIP_IDS.map((clipId) => clipFromShots(clipId, validatedShots, plan.graph!, plan.canon!, plan.continuitySeed));
  if (JSON.stringify(plan.clips) !== JSON.stringify(expectedClips)) {
    throw new GoogleApiError("The stored render prompts no longer match the validated story package.", 422);
  }
  assertChildSafePackage(plan);
  return plan as StoryPackage;
}

export function approveStoryPackageForRender(
  value: unknown,
  input: { sensitiveTopicAcknowledged: boolean; reviewedAt: number },
) {
  const blueprintPlan = validateStoryPackage(value);
  if (blueprintPlan.moralSpec.policyDecision === "REQUIRE_PARENT_REVIEW" && !input.sensitiveTopicAcknowledged) {
    throw new GoogleApiError("Please acknowledge the sensitive-topic review before rendering.", 400);
  }
  return validateStoryPackage(
    {
      ...blueprintPlan,
      parentReview: {
        status: "approved",
        reviewedAt: input.reviewedAt,
        sensitiveTopicAcknowledged: input.sensitiveTopicAcknowledged,
      },
    },
    { requireParentApproval: true },
  );
}
