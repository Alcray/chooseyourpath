import assert from "node:assert/strict";
import test from "node:test";
import fixture from "./fixtures/compiled-story-input.json";
import { storyPackageMatchesBrief } from "../app/lib/story-package-binding";
import { assembleStoryPackage, deterministicGraphChecks } from "../app/lib/story-compiler";
import type {
  AdventurePremise,
  MoralSpec,
  SemanticReview,
  ShotManifestEntry,
  StoryBrief,
  StoryCanon,
  StoryGraph,
} from "../app/lib/story";

function currentPackage() {
  const graph = fixture.graph as unknown as StoryGraph;
  const canon = fixture.canon as StoryCanon;
  const premises = fixture.premiseCandidates as AdventurePremise[];
  return assembleStoryPackage({
    moralSpec: fixture.moralSpec as MoralSpec,
    premiseCandidates: premises,
    premiseSelection: fixture.premiseSelection,
    selectedPremiseId: fixture.selectedPremiseId,
    outline: fixture.outline,
    title: fixture.title,
    parentSummary: fixture.parentSummary,
    childIntro: fixture.childIntro,
    canon,
    graph,
    shots: fixture.shots as ShotManifestEntry[],
    graphChecks: deterministicGraphChecks(graph, canon, premises, fixture.selectedPremiseId),
    semanticReview: fixture.semanticReview as SemanticReview,
    continuitySeed: fixture.continuitySeed,
  });
}

const brief: StoryBrief = {
  lesson: fixture.moralSpec.sourceLesson,
  characterPairId: "pip-momo",
  settingId: "riverside-garden",
  ageBand: "6-8",
  language: "Armenian",
};

test("binds a current package to the parent's exact catalog-derived canon", async (t) => {
  const plan = currentPackage();
  assert.equal(storyPackageMatchesBrief(plan, brief), true);

  const mutations: Array<[keyof StoryCanon, string]> = [
    ["characterBible", `${plan.canon.characterBible} altered`],
    ["locationBible", `${plan.canon.locationBible} altered`],
    ["visualStyle", `${plan.canon.visualStyle} altered`],
    ["narratorVoiceId", "narrator-hy-unreviewed-v99"],
  ];

  for (const [field, value] of mutations) {
    await t.test(`rejects altered ${field}`, () => {
      const altered = { ...plan, canon: { ...plan.canon, [field]: value } };
      assert.equal(storyPackageMatchesBrief(altered, brief), false);
    });
  }
});
