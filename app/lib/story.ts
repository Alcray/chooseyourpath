export const CLIP_IDS = ["opening", "positive", "negative", "ending"] as const;

export type ClipId = (typeof CLIP_IDS)[number];

export type StoryBrief = {
  lesson: string;
  characterPairId: string;
  settingId: string;
  ageBand: string;
  language: string;
};

export type StoryChoice = {
  label: string;
  explanation: string;
};

export type StoryClipExtension = {
  prompt: string;
  caption: string;
};

export type StoryClip = {
  id: ClipId;
  title: string;
  summary: string;
  caption: string;
  prompt: string;
  extensions: StoryClipExtension[];
  branchNarration?: {
    positive: string;
    negative: string;
  };
};

export const POLICY_DECISIONS = ["ALLOW", "TRANSFORM", "REQUIRE_PARENT_REVIEW", "REJECT"] as const;
export type PolicyDecision = (typeof POLICY_DECISIONS)[number];

export type MoralSpec = {
  sourceLesson: string;
  compiledLesson: string;
  value: string;
  desiredBehavior: string;
  temptingAlternative: string;
  understandableMotive: string;
  positiveConsequence: string;
  naturalWrongConsequence: string;
  repairAction: string;
  ageBand: string;
  emotionalIntensity: "gentle";
  forbiddenTreatments: string[];
  policyDecision: PolicyDecision;
  policyReason: string;
};

export type AdventurePremise = {
  id: string;
  title: string;
  logline: string;
  externalGoal: string;
  relationship: string;
  escalatingObstacle: string;
  setupPayoff: string;
  constructiveEffort: string;
  temptingAlternative: string;
  naturalConsequence: string;
  storynessScore: number;
};

export type PremiseEvaluation = {
  premiseId: string;
  storynessScore: number;
  passed: boolean;
  reason: string;
};

export type PremiseSelection = {
  selectedPremiseId: string;
  evaluations: PremiseEvaluation[];
};

export type HierarchicalStoryOutline = {
  setup: string[];
  choiceDilemma: string;
  constructiveArc: string[];
  harmfulArc: string[];
  constructiveBridge: string;
  harmfulBridge: string;
  sharedFinale: string;
  reflectionGoal: string;
};

export type CanonProp = {
  id: string;
  name: string;
  ownerId: string;
  initialCondition: string;
};

export type StoryState = {
  id: string;
  time: string;
  locationId: string;
  presentCharacterIds: string[];
  propStates: Array<{
    propId: string;
    condition: string;
    holderId: string;
  }>;
  characterKnowledge: Array<{
    characterId: string;
    facts: string[];
  }>;
  relationships: Array<{
    fromCharacterId: string;
    toCharacterId: string;
    status: string;
  }>;
  unresolvedPromises: string[];
};

export type StoryBeat = {
  id: string;
  phase: "setup" | "escalation" | "choice" | "consequence" | "repair" | "bridge" | "finale";
  summary: string;
  emotionalTurn: string;
  reads: string[];
  updates: string[];
};

export type SetupPayoff = {
  setupBeatId: string;
  constructivePayoffBeatId: string;
  harmfulPayoffBeatId: string;
};

export type StoryChoiceOption = {
  id: string;
  childText: string;
  explanation: string;
};

export type StoryBranch = {
  originStateId: string;
  beats: StoryBeat[];
  endState: StoryState;
};

export type StoryGraph = {
  initialState: StoryState;
  commonPrefix: StoryBeat[];
  setupPayoffs: SetupPayoff[];
  choice: {
    question: string;
    options: [StoryChoiceOption, StoryChoiceOption];
  };
  branches: {
    constructive: StoryBranch;
    harmful: StoryBranch;
  };
  convergence: {
    requiredState: StoryState;
    constructiveBridge: StoryBeat[];
    harmfulBridge: StoryBeat[];
    finale: StoryBeat[];
    narrationByBranch: {
      constructive: string;
      harmful: string;
    };
  };
  reflectionPrompt: string;
};

export type StoryCanon = {
  characterIds: string[];
  characterBible: string;
  locationId: string;
  locationBible: string;
  props: CanonProp[];
  visualStyle: string;
  narratorVoiceId: string;
};

export type ShotManifestEntry = {
  id: string;
  clipId: ClipId;
  segmentIndex: number;
  durationSeconds: 6 | 7 | 8;
  characterIds: string[];
  locationId: string;
  propIds: string[];
  timedBeats: [string, string, string];
  emotion: string;
  camera: string;
  audioDirection: string;
  spokenText: string;
  continuityFrom: string;
};

export type StoryValidationCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type SemanticReview = {
  approved: boolean;
  storyInterest: number;
  causalContinuity: number;
  choiceMeaning: number;
  consequenceProportion: number;
  repairQuality: number;
  ageFit: number;
  moralClarity: number;
  childSafety: number;
  convergence: number;
  concerns: string[];
};

export type CompilerTrace = {
  schemaVersion: "1.1";
  promptVersion: "branching-compiler-v2";
  model: string;
  compiledAt: number;
  stages: Array<{
    id: "policy" | "premises" | "premise_rank" | "outline" | "story_graph" | "independent_review" | "shot_manifest";
    status: "passed";
  }>;
};

export type ParentReview = {
  status: "pending" | "approved";
  reviewedAt: number | null;
  sensitiveTopicAcknowledged: boolean;
};

export type LegacyStoryPlan = {
  title: string;
  parentSummary: string;
  childIntro: string;
  choiceQuestion: string;
  positiveChoice: StoryChoice;
  negativeChoice: StoryChoice;
  continuitySeed: number;
  clips: StoryClip[];
};

export type StoryPackage = LegacyStoryPlan & {
  compiler: CompilerTrace;
  moralSpec: MoralSpec;
  premiseCandidates: AdventurePremise[];
  premiseSelection: PremiseSelection;
  selectedPremiseId: string;
  outline: HierarchicalStoryOutline;
  canon: StoryCanon;
  graph: StoryGraph;
  shots: ShotManifestEntry[];
  parentReview: ParentReview;
  validation: {
    valid: boolean;
    checks: StoryValidationCheck[];
    semanticReview: SemanticReview;
  };
};

export type StoryPlan = LegacyStoryPlan & Partial<Omit<StoryPackage, keyof LegacyStoryPlan>>;

export function isStoryPackage(plan: StoryPlan): plan is StoryPackage {
  return Boolean(
    plan.compiler?.schemaVersion === "1.1" &&
      plan.moralSpec &&
      plan.premiseSelection &&
      plan.outline &&
      plan.canon &&
      plan.graph &&
      Array.isArray(plan.premiseCandidates) &&
      Array.isArray(plan.shots) &&
      plan.parentReview &&
      plan.validation,
  );
}

export const CHARACTER_PAIRS = [
  {
    id: "pip-momo",
    characterIds: ["pip_fox_v1", "momo_rabbit_v1"],
    names: "Pip & Momo",
    emoji: "🦊 🐰",
    tagline: "Curious woodland friends",
    style: "Warm watercolor storybook animation",
    bible:
      "Pip is a small orange fox with a cream muzzle, large kind brown eyes, and a knitted forest-green scarf. Momo is a small sky-blue rabbit with pink inner ears, round dark-blue eyes, and a mustard-yellow vest. Pip is thoughtful and energetic; Momo is gentle and observant. Both have rounded child-friendly proportions.",
  },
  {
    id: "beni-sisi",
    characterIds: ["beni_bear_v1", "sisi_squirrel_v1"],
    names: "Beni & Sisi",
    emoji: "🐻 🐿️",
    tagline: "Cozy forest neighbors",
    style: "Soft handcrafted clay animation",
    bible:
      "Beni is a small caramel-brown bear cub with a round muzzle, teal-blue overalls, and a tiny cream neckerchief. Sisi is a russet squirrel with a large fluffy tail, bright hazel eyes, and a plum-purple crossbody satchel. Beni is careful and sincere; Sisi is lively and encouraging. Both look like tactile handmade clay figures.",
  },
  {
    id: "olli-dori",
    characterIds: ["olli_otter_v1", "dori_duck_v1"],
    names: "Olli & Dori",
    emoji: "🦦 🦆",
    tagline: "Playful riverside explorers",
    style: "Bright polished 3D family animation",
    bible:
      "Olli is a small teal-brown otter with a pale belly, expressive green eyes, and a burnt-orange beanie. Dori is a sunny-yellow duckling with an orange bill, a mint-green backpack, and wide dark eyes. Olli is inventive and bold; Dori is patient and warm. Both have clean rounded shapes and soft natural textures.",
  },
] as const;

export const SETTINGS = [
  {
    id: "woodland-picnic",
    name: "Woodland picnic",
    emoji: "🌳",
    bible:
      "A sunlit woodland clearing with a yellow gingham picnic blanket, old oak trees, tiny white flowers, warm afternoon light, and gentle birdsong.",
  },
  {
    id: "village-bakery",
    name: "Cozy village bakery",
    emoji: "🥖",
    bible:
      "A cozy animal village bakery with honey-colored wooden shelves, a round window, flour-dusted counters, warm morning light, and quiet cheerful kitchen sounds.",
  },
  {
    id: "riverside-garden",
    name: "Riverside garden",
    emoji: "🌿",
    bible:
      "A bright riverside community garden with stepping stones, vegetable beds, a tiny wooden bridge, soft moving water, and fresh early-evening light.",
  },
] as const;

export const AGE_BANDS = [
  { id: "3-5", label: "Ages 3–5", guidance: "very simple language, one concrete dilemma" },
  { id: "6-8", label: "Ages 6–8", guidance: "clear cause and effect, emotionally specific language" },
  { id: "9-11", label: "Ages 9–11", guidance: "a nuanced but still binary dilemma, no lecturing" },
] as const;

export const LANGUAGES = [
  { id: "Armenian", label: "Armenian", local: "Հայերեն" },
  { id: "English", label: "English", local: "English" },
] as const;

export function getCharacterPair(id: string) {
  return CHARACTER_PAIRS.find((pair) => pair.id === id) ?? CHARACTER_PAIRS[0];
}

export function getSetting(id: string) {
  return SETTINGS.find((setting) => setting.id === id) ?? SETTINGS[0];
}

export function getAgeBand(id: string) {
  return AGE_BANDS.find((age) => age.id === id) ?? AGE_BANDS[1];
}

export function isClipId(value: unknown): value is ClipId {
  return typeof value === "string" && CLIP_IDS.includes(value as ClipId);
}

export function isExtendedClip(id: ClipId) {
  return id === "positive" || id === "negative";
}

export function baseClipDuration(id: ClipId): 6 | 8 {
  return isExtendedClip(id) ? 6 : 8;
}
