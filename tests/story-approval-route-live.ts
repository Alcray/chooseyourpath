import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import fixture from "./fixtures/compiled-story-input.json";
import {
  assembleStoryPackage,
  classifyMoralPolicy,
  deterministicGraphChecks,
} from "../app/lib/story-compiler";
import type {
  AdventurePremise,
  MoralSpec,
  PremiseSelection,
  SemanticReview,
  ShotManifestEntry,
  StoryCanon,
  StoryGraph,
} from "../app/lib/story";

const baseUrl = (process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const d1Directory = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const databases = readdirSync(d1Directory)
  .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
  .map((name) => resolve(d1Directory, name));
assert.equal(databases.length, 1, "Expected exactly one local Miniflare D1 database");
const database = databases[0];

function sqlQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlite(sql: string) {
  const result = spawnSync("sqlite3", [database], {
    encoding: "utf8",
    input: `.timeout 5000\n${sql}\n`,
  });
  assert.equal(result.status, 0, result.stderr || "sqlite3 failed");
  return result.stdout.trim();
}

const sourceLesson = "Helping a child understand an autism diagnosis";
const policy = classifyMoralPolicy(sourceLesson);
assert.equal(policy.decision, "REQUIRE_PARENT_REVIEW");
const moralSpec: MoralSpec = {
  ...(fixture.moralSpec as MoralSpec),
  sourceLesson,
  compiledLesson: policy.compiledLesson,
  policyDecision: policy.decision,
  policyReason: policy.reason,
};
const premises = fixture.premiseCandidates as AdventurePremise[];
const graph = fixture.graph as unknown as StoryGraph;
const canon = fixture.canon as StoryCanon;
const plan = assembleStoryPackage({
  moralSpec,
  premiseCandidates: premises,
  premiseSelection: fixture.premiseSelection as PremiseSelection,
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

const blueprintId = crypto.randomUUID();
const idempotencyKey = `approval-gate-${crypto.randomUUID()}`;
const brief = {
  lesson: sourceLesson,
  characterPairId: "pip-momo",
  settingId: "riverside-garden",
  ageBand: "6-8",
  language: "Armenian",
};
const now = Date.now();

try {
  sqlite(`
    INSERT INTO blueprints (id, owner_user_id, brief_json, plan_json, created_at)
    VALUES (${sqlQuote(blueprintId)}, 'local-preview-user', ${sqlQuote(JSON.stringify(brief))}, ${sqlQuote(JSON.stringify(plan))}, ${now});
  `);
  const before = sqlite(`
    SELECT
      (SELECT COUNT(*) FROM stories WHERE idempotency_key = ${sqlQuote(idempotencyKey)}) || '|' ||
      (SELECT COUNT(*) FROM clips WHERE story_id IN (SELECT id FROM stories WHERE idempotency_key = ${sqlQuote(idempotencyKey)}));
  `);
  assert.equal(before, "0|0");

  const response = await fetch(`${baseUrl}/api/stories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blueprintId, idempotencyKey, sensitiveTopicAcknowledged: false }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json() as { error?: string };
  assert.equal(response.status, 400, payload.error ?? "sensitive story start should be rejected");
  assert.match(payload.error ?? "", /acknowledge the sensitive-topic review/i);

  const after = sqlite(`
    SELECT
      (SELECT COUNT(*) FROM stories WHERE idempotency_key = ${sqlQuote(idempotencyKey)}) || '|' ||
      (SELECT COUNT(*) FROM clips WHERE story_id IN (SELECT id FROM stories WHERE idempotency_key = ${sqlQuote(idempotencyKey)}));
  `);
  assert.equal(after, "0|0", "approval rejection must happen before story/clip jobs are persisted");
  console.log("story-approval-route-live: ok (400 response, zero story rows, zero clip jobs)");
} finally {
  sqlite(`
    DELETE FROM clips WHERE story_id IN (SELECT id FROM stories WHERE idempotency_key = ${sqlQuote(idempotencyKey)});
    DELETE FROM stories WHERE idempotency_key = ${sqlQuote(idempotencyKey)};
    DELETE FROM blueprints WHERE id = ${sqlQuote(blueprintId)};
  `);
}
