import { CLIP_IDS, isClipId, type ClipId, type StoryChoice, type StoryPackage } from "./story";
import { assertChildSafePackage, validateStoryPackage } from "./story-compiler";

export const LEGACY_1_0_MISSING_RELEASE_ARTIFACTS = [
  "premiseSelection",
  "outline",
  "graph.state.relationships",
  "graph.setupPayoffs",
  "parentReview",
  "compiler.stages.premise_rank",
  "compiler.stages.outline",
] as const;

export const UNVERSIONED_MISSING_RELEASE_ARTIFACTS = [
  "compiler",
  "moralSpec",
  "premiseCandidates",
  "premiseSelection",
  "selectedPremiseId",
  "outline",
  "canon",
  "graph",
  "shots",
  "parentReview",
  "validation",
] as const;

export const LEGACY_BLUEPRINT_RECOMPILE_MESSAGE =
  "This older blueprint must be rebuilt and reviewed before video generation.";
export const LEGACY_STORY_RECOMPILE_MESSAGE =
  "This older unfinished story cannot continue safely. Rebuild it with the current compiler before generating more video.";

export type LegacyMissingReleaseArtifact = (typeof LEGACY_1_0_MISSING_RELEASE_ARTIFACTS)[number];
export type UnversionedMissingReleaseArtifact = (typeof UNVERSIONED_MISSING_RELEASE_ARTIFACTS)[number];

export type PlaybackOnlyStoryClip = {
  id: ClipId;
  title: string;
  summary: string;
  caption: string;
  extensions: Array<{ caption: string }>;
  branchNarration?: {
    positive: string;
    negative: string;
  };
};

/**
 * The deliberately narrow story shape returned for already-rendered historical
 * media. Provider prompts and compiler evidence are not playback data and must
 * never cross this compatibility boundary.
 */
export type PlaybackOnlyStoryPlan = {
  title: string;
  parentSummary: string;
  childIntro: string;
  choiceQuestion: string;
  positiveChoice: StoryChoice;
  negativeChoice: StoryChoice;
  continuitySeed: number;
  clips: PlaybackOnlyStoryClip[];
};

export type StoryPackageCompatibilityResult =
  | {
      status: "current";
      sourceSchemaVersion: "1.1";
      storyPackage: StoryPackage;
    }
  | {
      status: "legacy_requires_recompile";
      sourceSchemaVersion: "1.0";
      targetSchemaVersion: "1.1";
      reason: "schema_1_0_missing_release_artifacts";
      missingArtifacts: readonly LegacyMissingReleaseArtifact[];
      playablePlan: PlaybackOnlyStoryPlan;
    }
  | {
      status: "unversioned_requires_recompile";
      sourceSchemaVersion: null;
      targetSchemaVersion: "1.1";
      reason: "unversioned_story_missing_release_artifacts";
      missingArtifacts: readonly UnversionedMissingReleaseArtifact[];
      playablePlan: PlaybackOnlyStoryPlan;
    }
  | {
      status: "incompatible";
      sourceSchemaVersion: string | null;
      reason:
        | "missing_schema_version"
        | "unsupported_schema_version"
        | "malformed_current_package"
        | "malformed_legacy_compiler_trace"
        | "malformed_legacy_playback"
        | "malformed_unversioned_playback";
    };

const LEGACY_STAGE_IDS = ["policy", "premises", "story_graph", "independent_review", "shot_manifest"] as const;
const UNVERSIONED_PLAYBACK_KEYS = [
  "childIntro",
  "choiceQuestion",
  "clips",
  "continuitySeed",
  "negativeChoice",
  "parentSummary",
  "positiveChoice",
  "title",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactUnversionedPlaybackShape(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === UNVERSIONED_PLAYBACK_KEYS.length &&
    UNVERSIONED_PLAYBACK_KEYS.every((key, index) => keys[index] === key);
}

function sourceSchemaVersion(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.compiler)) return null;
  return typeof value.compiler.schemaVersion === "string" ? value.compiler.schemaVersion : null;
}

function hasLegacyCompilerTrace(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.compiler)) return false;
  const compiler = value.compiler;
  const stages = compiler.stages;
  if (
    compiler.schemaVersion !== "1.0" ||
    compiler.promptVersion !== "branching-compiler-v1" ||
    typeof compiler.model !== "string" ||
    compiler.model.trim().length === 0 ||
    !Number.isInteger(compiler.compiledAt) ||
    Number(compiler.compiledAt) <= 0 ||
    !Array.isArray(stages) ||
    stages.length !== LEGACY_STAGE_IDS.length
  ) {
    return false;
  }

  return LEGACY_STAGE_IDS.every((id, index) => {
    const stage = stages[index];
    return isRecord(stage) && stage.id === id && stage.status === "passed";
  });
}

function playbackText(value: unknown, minimum: number, maximum: number): string | null {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) return null;
  return value;
}

function copyChoice(value: unknown): StoryChoice | null {
  if (!isRecord(value)) return null;
  const label = playbackText(value.label, 1, 500);
  const explanation = playbackText(value.explanation, 1, 1_200);
  return label && explanation ? { label, explanation } : null;
}

function copyBranchNarration(value: unknown): PlaybackOnlyStoryClip["branchNarration"] | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const positive = playbackText(value.positive, 1, 1_200);
  const negative = playbackText(value.negative, 1, 1_200);
  return positive && negative ? { positive, negative } : null;
}

function copyClip(value: unknown, allowPreExtensionShape: boolean): PlaybackOnlyStoryClip | null {
  if (!isRecord(value) || !isClipId(value.id)) return null;
  const rawExtensions = Array.isArray(value.extensions)
    ? value.extensions
    : allowPreExtensionShape && value.extensions === undefined
      ? []
      : null;
  if (!rawExtensions) return null;
  const title = playbackText(value.title, 1, 500);
  const summary = playbackText(value.summary, 1, 1_200);
  const caption = playbackText(value.caption, 1, 350);
  const branchNarration = copyBranchNarration(value.branchNarration);
  const isBranch = value.id === "positive" || value.id === "negative";
  const extensionCountAllowed = isBranch
    ? rawExtensions.length === 2 || (allowPreExtensionShape && rawExtensions.length === 0)
    : rawExtensions.length === 0;
  if (!title || !summary || !caption || branchNarration === null || !extensionCountAllowed) return null;

  const extensions = rawExtensions.map((entry) => {
    if (!isRecord(entry)) return null;
    const extensionCaption = playbackText(entry.caption, 1, 350);
    return extensionCaption ? { caption: extensionCaption } : null;
  });
  if (extensions.some((entry) => entry === null)) return null;

  return {
    id: value.id,
    title,
    summary,
    caption,
    extensions: extensions as PlaybackOnlyStoryClip["extensions"],
    ...(branchNarration ? { branchNarration } : {}),
  };
}

function copyLegacyPlayback(value: unknown, allowPreExtensionShape: boolean): PlaybackOnlyStoryPlan | null {
  if (!isRecord(value) || !Array.isArray(value.clips)) return null;
  const title = playbackText(value.title, 1, 500);
  const parentSummary = playbackText(value.parentSummary, 1, 2_000);
  const childIntro = playbackText(value.childIntro, 1, 2_000);
  const choiceQuestion = playbackText(value.choiceQuestion, 1, 1_000);
  const positiveChoice = copyChoice(value.positiveChoice);
  const negativeChoice = copyChoice(value.negativeChoice);
  const continuitySeed = value.continuitySeed;
  const clips = value.clips.map((clip) => copyClip(clip, allowPreExtensionShape));
  const clipIds = clips.map((clip) => clip?.id);
  const completeClipSet = clips.length === CLIP_IDS.length &&
    new Set(clipIds).size === CLIP_IDS.length &&
    CLIP_IDS.every((id) => clipIds.includes(id));

  if (
    !title ||
    !parentSummary ||
    !childIntro ||
    !choiceQuestion ||
    !positiveChoice ||
    !negativeChoice ||
    !Number.isInteger(continuitySeed) ||
    Number(continuitySeed) < 0 ||
    Number(continuitySeed) > 0xffff_ffff ||
    !completeClipSet
  ) {
    return null;
  }

  return {
    title,
    parentSummary,
    childIntro,
    choiceQuestion,
    positiveChoice,
    negativeChoice,
    continuitySeed: Number(continuitySeed),
    clips: clips as PlaybackOnlyStoryClip[],
  };
}

function safePlaybackProjection(value: unknown, allowPreExtensionShape = false): PlaybackOnlyStoryPlan | null {
  const playablePlan = copyLegacyPlayback(value, allowPreExtensionShape);
  if (!playablePlan) return null;
  try {
    assertChildSafePackage(playablePlan);
    return playablePlan;
  } catch {
    return null;
  }
}

/**
 * Classifies persisted story data without inventing schema 1.1 evidence.
 *
 * A schema 1.0 package may still be played from its legacy fields, but it must
 * be recompiled before approval, rendering, or publication. Its model-authored
 * artifacts are intentionally not promoted into a schema 1.1 StoryPackage.
 */
export function classifyStoryPackageCompatibility(value: unknown): StoryPackageCompatibilityResult {
  const version = sourceSchemaVersion(value);
  if (version === null) {
    if (isRecord(value) && !("compiler" in value)) {
      if (!hasExactUnversionedPlaybackShape(value)) {
        return { status: "incompatible", sourceSchemaVersion: null, reason: "malformed_unversioned_playback" };
      }
      const playablePlan = safePlaybackProjection(value, true);
      if (!playablePlan) {
        return { status: "incompatible", sourceSchemaVersion: null, reason: "malformed_unversioned_playback" };
      }
      return {
        status: "unversioned_requires_recompile",
        sourceSchemaVersion: null,
        targetSchemaVersion: "1.1",
        reason: "unversioned_story_missing_release_artifacts",
        missingArtifacts: UNVERSIONED_MISSING_RELEASE_ARTIFACTS,
        playablePlan,
      };
    }
    return { status: "incompatible", sourceSchemaVersion: null, reason: "missing_schema_version" };
  }

  if (version === "1.1") {
    try {
      return { status: "current", sourceSchemaVersion: "1.1", storyPackage: validateStoryPackage(value) };
    } catch {
      return { status: "incompatible", sourceSchemaVersion: "1.1", reason: "malformed_current_package" };
    }
  }

  if (version === "1.0") {
    if (!hasLegacyCompilerTrace(value)) {
      return { status: "incompatible", sourceSchemaVersion: "1.0", reason: "malformed_legacy_compiler_trace" };
    }
    const playablePlan = safePlaybackProjection(value);
    if (!playablePlan) {
      return { status: "incompatible", sourceSchemaVersion: "1.0", reason: "malformed_legacy_playback" };
    }
    return {
      status: "legacy_requires_recompile",
      sourceSchemaVersion: "1.0",
      targetSchemaVersion: "1.1",
      reason: "schema_1_0_missing_release_artifacts",
      missingArtifacts: LEGACY_1_0_MISSING_RELEASE_ARTIFACTS,
      playablePlan,
    };
  }

  return { status: "incompatible", sourceSchemaVersion: version, reason: "unsupported_schema_version" };
}
