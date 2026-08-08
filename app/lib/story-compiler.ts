import {
  CLIP_IDS,
  type AdventurePremise,
  type ClipId,
  type MoralSpec,
  type PolicyDecision,
  type SemanticReview,
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
const DISCRIMINATORY_PATTERN = /(?:girls? (?:cannot|can't|should(?: not|n't))|boys? (?:cannot|can't|should(?: not|n't))|inferior (?:race|religion|people)|hate (?:girls|boys|people)|աղջիկները? չպետք|տղաները? չպետք)/iu;
const FEAR_PUNISHMENT_PATTERN = /(?:scare|terrify|frighten|threaten|beat|hurt|punish).{0,30}(?:child|kid|him|her|them)|վախեց|սարսափեց|պատժ|ծեծ/iu;
const REVIEW_PATTERN = /(?:diagnos|autis|adhd|trauma|religio|politic|therapy|medical|ախտորոշ|աուտիզմ|տրավմ|կրոն|քաղաքական|բժշկ)/iu;

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
  choice: unknown;
  narrationByBranch: unknown;
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

export function classifyMoralPolicy(sourceLesson: string): PolicyResult {
  const lesson = sourceLesson.trim();
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
  if (FEAR_PUNISHMENT_PATTERN.test(lesson)) {
    return {
      decision: "REJECT",
      compiledLesson: lesson,
      reason: "Fear, threats, and punishment cannot be used as teaching tools.",
    };
  }
  if (/(?:always obey adults|obey every adult|միշտ լսել մեծերին)/iu.test(lesson)) {
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
  const validCandidates = candidates.filter((candidate) => candidate.storynessScore >= 60);
  if (validCandidates.length === 0) throw new GoogleApiError("No premise passed the storyness contract.", 502, true);
  const requestedId = cleanText(draft.selectedPremiseId, "selected premise id", 3, 80);
  const selected = validCandidates.find((candidate) => candidate.id === requestedId)
    ?? [...validCandidates].sort((a, b) => b.storynessScore - a.storynessScore)[0];
  assertChildSafePackage(candidates);
  return { candidates, selectedPremiseId: selected.id };
}

function validateState(value: unknown, name: string): StoryState {
  const state = asObject(value, name);
  const propStatesRaw = state.propStates;
  const knowledgeRaw = state.characterKnowledge;
  if (!Array.isArray(propStatesRaw) || propStatesRaw.length < 1 || propStatesRaw.length > 4) {
    throw new GoogleApiError(`${name} must track one to four props.`, 502);
  }
  if (!Array.isArray(knowledgeRaw) || knowledgeRaw.length < 2 || knowledgeRaw.length > 6) {
    throw new GoogleApiError(`${name} must track character knowledge.`, 502);
  }
  return {
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
    unresolvedPromises: asStringArray(state.unresolvedPromises, `${name} unresolved promises`, 0, 12),
  };
}

const BEAT_PHASES = new Set<StoryBeat["phase"]>(["setup", "escalation", "choice", "consequence", "repair", "bridge", "finale"]);

function validateBeat(value: unknown, name: string): StoryBeat {
  const beat = asObject(value, name);
  if (typeof beat.phase !== "string" || !BEAT_PHASES.has(beat.phase as StoryBeat["phase"])) {
    throw new GoogleApiError(`${name} has an invalid phase.`, 502);
  }
  return {
    id: cleanText(beat.id, `${name} id`, 2, 80),
    phase: beat.phase as StoryBeat["phase"],
    summary: cleanText(beat.summary, `${name} summary`, 4, 500),
    emotionalTurn: cleanText(beat.emotionalTurn, `${name} emotional turn`, 2, 300),
    reads: asStringArray(beat.reads, `${name} reads`, 0, 12),
    updates: asStringArray(beat.updates, `${name} updates`, 0, 12),
  };
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
  if (!required.presentCharacterIds.every((id) => actual.presentCharacterIds.includes(id))) return false;
  if (!required.unresolvedPromises.every((promise) => actual.unresolvedPromises.includes(promise))) return false;
  return required.propStates.every((requiredProp) =>
    actual.propStates.some((prop) =>
      prop.propId === requiredProp.propId &&
      prop.condition === requiredProp.condition &&
      prop.holderId === requiredProp.holderId
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
    state.characterKnowledge.every((entry) => characterIds.has(entry.characterId)) &&
    state.propStates.every((prop) => propIds.has(prop.propId) && (prop.holderId === "none" || characterIds.has(prop.holderId)))
  );
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
  return [
    check("storyness", "Selected adventure premise passes the storyness contract", Boolean(selectedPremise && selectedPremise.storynessScore >= 60), "The selected premise has a goal, relationship, obstacle, payoff, effort, temptation, and natural consequence."),
    check("two_choices", "Exactly two child-facing choices", optionIds.length === 2 && new Set(optionIds).size === 2 && optionIds.includes("constructive") && optionIds.includes("harmful"), "The decision has one constructive action and one understandable shortcut."),
    check("shared_origin", "Both branches share the same origin state", constructive.originStateId === graph.initialState.id && harmful.originStateId === graph.initialState.id, "Both paths begin from the exact same knowledge, props, location, and promises."),
    check("escalation", "The setup escalates before the choice", graph.commonPrefix.length >= 4 && graph.commonPrefix.some((beat) => beat.phase === "escalation"), "The story earns its choice through a causal setup."),
    check("repair", "The harmful branch contains repair", harmful.beats.some((beat) => beat.phase === "repair"), "The mistaken choice remains a complete mini-arc with a chance to repair harm."),
    check("constructive_effort", "The constructive branch requires effort", constructive.beats.length >= 3, "The caring action is meaningful rather than effortless."),
    check("constructive_convergence", "Constructive path satisfies finale state", stateSatisfies(graph.convergence.requiredState, constructive.endState), "The finale preconditions follow from the constructive path."),
    check("harmful_convergence", "Harmful path satisfies finale state", stateSatisfies(graph.convergence.requiredState, harmful.endState), "The repair path restores every finale precondition."),
    check("canon_ids", "Every state uses locked canon IDs", allGraphIdsAreCanonical(graph, canon), "Characters, location, prop ownership, and knowledge use registered IDs only."),
    check("parameterized_finale", "The shared finale keeps branch-aware narration", Boolean(graph.convergence.narrationByBranch.constructive && graph.convergence.narrationByBranch.harmful), "The shared visual ending can explain either route without contradiction."),
  ];
}

export function validateGraphDraft(
  value: unknown,
  input: { canonBase: Omit<StoryCanon, "props">; premises: AdventurePremise[]; selectedPremiseId: string },
): { graph: StoryGraph; canon: StoryCanon; title: string; parentSummary: string; childIntro: string; checks: StoryValidationCheck[] } {
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
    const knowledgeSummary = cleanText(stateObject.knowledgeSummary, `${stateObject.role} knowledge summary`, 4, 500);
    stateByRole.set(
      stateObject.role as StateRole,
      validateState(
        {
          ...stateObject,
          characterKnowledge: input.canonBase.characterIds.map((characterId) => ({
            characterId,
            facts: [knowledgeSummary],
          })),
        },
        `${stateObject.role} state`,
      ),
    );
  }
  if (!stateRoles.every((role) => stateByRole.has(role))) {
    throw new GoogleApiError("The story graph is missing a required state role.", 502);
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
      value: { ...beat, summary, emotionalTurn, reads: [summary], updates: [emotionalTurn] },
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

  const narration = asObject(draft.narrationByBranch, "branch-aware narration");
  const initialState = stateByRole.get("initial")!;
  const requiredState = stateByRole.get("finale_required")!;
  const reconcileAfterBridge = (endState: StoryState): StoryState => ({
    ...endState,
    time: requiredState.time,
    locationId: requiredState.locationId,
    presentCharacterIds: [...requiredState.presentCharacterIds],
    propStates: requiredState.propStates.map((prop) => ({ ...prop })),
    unresolvedPromises: [...requiredState.unresolvedPromises],
  });
  const graph: StoryGraph = {
    initialState,
    commonPrefix,
    choice: validateChoice(draft.choice),
    branches: {
      constructive: {
        originStateId: initialState.id,
        beats: constructiveBeats,
        endState: reconcileAfterBridge(stateByRole.get("constructive_end")!),
      },
      harmful: {
        originStateId: initialState.id,
        beats: harmfulBeats,
        endState: reconcileAfterBridge(stateByRole.get("harmful_end")!),
      },
    },
    convergence: {
      requiredState,
      constructiveBridge,
      harmfulBridge,
      finale,
      narrationByBranch: {
        constructive: cleanText(narration.constructive, "constructive finale narration", 3, 500),
        harmful: cleanText(narration.harmful, "harmful finale narration", 3, 500),
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
  return { graph, canon, title, parentSummary, childIntro, checks };
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
    if (expected.segmentIndex > 0 && continuityFrom.length < 5) {
      throw new GoogleApiError(`Shot ${index + 1} must name the visible state it continues from.`, 502);
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
  const canonResolution = `Locked visual canon: character IDs ${shot.characterIds.join(", ")} resolve to ${canon.characterBible} Location ID ${canon.locationId} resolves to ${canon.locationBible} Prop IDs in frame: ${shot.propIds.join(", ") || "none"}. Visual style: ${canon.visualStyle}. Landscape 16:9 at 720p, no humans, no brands, no logos, no captions, no on-screen text.`;
  const continuity = shot.segmentIndex === 0
    ? `Fresh clip with shared continuity seed ${continuitySeed}. Preserve the exact character proportions, clothing, palette, light direction, narrator voice ${canon.narratorVoiceId}, and camera language from the locked canon.`
    : `Veo continuation only. Continue from ${shot.continuityFrom} without recap, restart, redesign, wardrobe change, location change, lighting jump, or camera reversal. Preserve narrator voice ${canon.narratorVoiceId}.`;
  return `${canonResolution} ${continuity} One clear continuous action: ${beats} Emotion: ${shot.emotion}. Camera: ${shot.camera}. Audio: ${shot.audioDirection}. Exact spoken narration and dialogue, word-for-word: “${shot.spokenText}” Keep motion physically continuous, expressions child-readable, consequences gentle, and all registered props in their specified condition and ownership state.`;
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
  selectedPremiseId: string;
  title: string;
  parentSummary: string;
  childIntro: string;
  canon: StoryCanon;
  graph: StoryGraph;
  shots: ShotManifestEntry[];
  graphChecks: StoryValidationCheck[];
  semanticReview: SemanticReview;
  continuitySeed: number;
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
      schemaVersion: "1.0",
      promptVersion: "branching-compiler-v1",
      model: GEMINI_COMPILER_MODEL,
      compiledAt: Date.now(),
      stages: ["policy", "premises", "story_graph", "independent_review", "shot_manifest"].map((id) => ({ id: id as StoryPackage["compiler"]["stages"][number]["id"], status: "passed" as const })),
    },
    moralSpec: input.moralSpec,
    premiseCandidates: input.premiseCandidates,
    selectedPremiseId: input.selectedPremiseId,
    canon: input.canon,
    graph: input.graph,
    shots: input.shots,
    validation: { valid: true, checks, semanticReview: input.semanticReview },
  };
  validateStoryPackage(storyPackage);
  return storyPackage;
}

export function assertChildSafePackage(value: unknown) {
  if (!UNSAFE_STORY_PATTERN.test(JSON.stringify(value))) return;
  throw new GoogleApiError("The story compiler could not make this idea safely. Please rephrase the lesson.", 502);
}

export function validateStoryPackage(value: unknown): StoryPackage {
  const plan = asObject(value, "story package") as unknown as StoryPlan;
  if (plan.compiler?.schemaVersion !== "1.0" || !plan.moralSpec || !plan.graph || !plan.canon || !plan.validation) {
    throw new GoogleApiError("The stored story package is missing compiler artifacts.", 422);
  }
  if (!Array.isArray(plan.premiseCandidates) || !Array.isArray(plan.shots) || !Array.isArray(plan.clips)) {
    throw new GoogleApiError("The stored story package is incomplete.", 422);
  }
  if (!plan.premiseCandidates.some((premise) => premise.id === plan.selectedPremiseId)) {
    throw new GoogleApiError("The stored story package has an invalid selected premise.", 422);
  }
  if (plan.clips.length !== CLIP_IDS.length || new Set(plan.clips.map((clip) => clip.id)).size !== CLIP_IDS.length) {
    throw new GoogleApiError("The stored story package must contain four unique clips.", 422);
  }
  if (!plan.validation.valid || plan.validation.checks.some((entry) => !entry.passed) || !plan.validation.semanticReview.approved) {
    throw new GoogleApiError("The stored story package has not passed validation.", 422);
  }
  for (const clipId of CLIP_IDS) {
    const clip = plan.clips.find((candidate) => candidate.id === clipId);
    const expectedExtensions = clipId === "positive" || clipId === "negative" ? 2 : 0;
    if (!clip || clip.prompt.length < 500 || clip.prompt.length > 2600 || clip.caption.length < 1 || clip.caption.length > 350 || clip.extensions.length !== expectedExtensions) {
      throw new GoogleApiError(`The stored ${clipId} render plan is invalid.`, 422);
    }
    for (const extension of clip.extensions) {
      if (extension.prompt.length < 500 || extension.prompt.length > 2600 || extension.caption.length < 1 || extension.caption.length > 350) {
        throw new GoogleApiError(`The stored ${clipId} extension plan is invalid.`, 422);
      }
    }
  }
  const checks = deterministicGraphChecks(plan.graph, plan.canon, plan.premiseCandidates, plan.selectedPremiseId);
  if (checks.some((entry) => !entry.passed)) {
    throw new GoogleApiError("The stored story package no longer satisfies compiler invariants.", 422);
  }
  validateShotDraft({ segments: plan.shots }, plan.canon);
  assertChildSafePackage(plan);
  return plan as StoryPackage;
}
