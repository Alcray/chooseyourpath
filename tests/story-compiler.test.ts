import assert from "node:assert/strict";
import test from "node:test";
import fixture from "./fixtures/compiled-story-input.json";
import policyCases from "./fixtures/moral-policy-golden.json";
import {
  assembleStoryPackage,
  classifyMoralPolicy,
  composeVideoPrompt,
  deterministicGraphChecks,
  validateShotDraft,
  validateStoryPackage,
} from "../app/lib/story-compiler";
import type {
  AdventurePremise,
  MoralSpec,
  SemanticReview,
  ShotManifestEntry,
  StoryCanon,
  StoryGraph,
} from "../app/lib/story";

const moralSpec = fixture.moralSpec as MoralSpec;
const premises = fixture.premiseCandidates as AdventurePremise[];
const graph = fixture.graph as unknown as StoryGraph;
const canon = fixture.canon as StoryCanon;
const shots = fixture.shots as ShotManifestEntry[];
const semanticReview = fixture.semanticReview as SemanticReview;

function assembleGolden() {
  return assembleStoryPackage({
    moralSpec,
    premiseCandidates: premises,
    selectedPremiseId: fixture.selectedPremiseId,
    title: fixture.title,
    parentSummary: fixture.parentSummary,
    childIntro: fixture.childIntro,
    canon,
    graph,
    shots,
    graphChecks: deterministicGraphChecks(graph, canon, premises, fixture.selectedPremiseId),
    semanticReview,
    continuitySeed: fixture.continuitySeed,
  });
}

test("golden moral-policy corpus returns the expected policy decisions", () => {
  assert.equal(policyCases.length, 15);
  for (const policyCase of policyCases) {
    assert.equal(
      classifyMoralPolicy(policyCase.lesson).decision,
      policyCase.expected,
      policyCase.lesson,
    );
  }
});

test("assembles and revalidates a convergent four-clip StoryPackage", () => {
  const storyPackage = assembleGolden();
  assert.equal(validateStoryPackage(storyPackage), storyPackage);
  assert.deepEqual(storyPackage.clips.map((clip) => clip.id), ["opening", "positive", "negative", "ending"]);
  assert.deepEqual(storyPackage.clips.map((clip) => clip.extensions.length), [0, 2, 2, 0]);
  assert.equal(storyPackage.shots.length, 8);
  assert.equal(storyPackage.validation.checks.every((check) => check.passed), true);
  assert.match(storyPackage.clips[0].prompt, /Locked visual canon/);
  assert.match(storyPackage.clips[1].extensions[0].prompt, /Veo continuation only/);
});

test("rejects a graph when the harmful path cannot satisfy the shared finale", () => {
  const brokenGraph = structuredClone(graph);
  brokenGraph.branches.harmful.endState.propStates[0].condition = "lost in the stream";
  const failed = deterministicGraphChecks(brokenGraph, canon, premises, fixture.selectedPremiseId).filter((check) => !check.passed);
  assert.deepEqual(failed.map((check) => check.id), ["harmful_convergence"]);
});

test("rejects a shot that invents an unregistered character", () => {
  const brokenShots = structuredClone(shots) as unknown as Array<Record<string, unknown>>;
  brokenShots[3].characterIds = ["pip_fox_v1", "dragon_v1"];
  assert.throws(
    () => validateShotDraft({ segments: brokenShots }, canon),
    /unregistered character/i,
  );
});

test("rejects a stored package after validation evidence is tampered with", () => {
  const storyPackage = assembleGolden();
  const tampered = structuredClone(storyPackage);
  tampered.validation.checks[0].passed = false;
  assert.throws(() => validateStoryPackage(tampered), /has not passed validation/i);
});

test("fresh and extension prompts resolve canon without leaking a raw parent lesson", () => {
  const fresh = composeVideoPrompt(shots[0], canon, fixture.continuitySeed);
  const extension = composeVideoPrompt(shots[1 + 1], canon, fixture.continuitySeed);
  assert.match(fresh, /pip_fox_v1, momo_rabbit_v1/);
  assert.match(fresh, /riverside-garden/);
  assert.match(extension, /Continue from/);
  assert.doesNotMatch(fresh, /Sharing helps friends solve problems together\./);
});
