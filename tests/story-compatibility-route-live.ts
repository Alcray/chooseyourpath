import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import fixture from "./fixtures/compiled-story-input.json";
import {
  approveStoryPackageForRender,
  assembleStoryPackage,
  deterministicGraphChecks,
} from "../app/lib/story-compiler";
import type {
  AdventurePremise,
  MoralSpec,
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

function currentPackage(canonOverrides: Partial<StoryCanon> = {}) {
  const graph = fixture.graph as unknown as StoryGraph;
  const canon = { ...(fixture.canon as StoryCanon), ...canonOverrides } as StoryCanon;
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

function legacyPackage() {
  const current = currentPackage();
  const legacy = structuredClone(current) as unknown as Record<string, unknown>;
  legacy.compiler = {
    schemaVersion: "1.0",
    promptVersion: "branching-compiler-v1",
    model: "gemini-3.5-flash-lite",
    compiledAt: Date.now(),
    stages: ["policy", "premises", "story_graph", "independent_review", "shot_manifest"].map((id) => ({ id, status: "passed" })),
  };
  delete legacy.premiseSelection;
  delete legacy.outline;
  delete legacy.parentReview;
  const legacyGraph = legacy.graph as Record<string, unknown>;
  delete legacyGraph.setupPayoffs;
  return legacy;
}

const blueprintId = crypto.randomUUID();
const storyId = crypto.randomUUID();
const idempotencyKey = `legacy-compat-${crypto.randomUUID()}`;
const now = Date.now();
const plan = legacyPackage();
const currentPlan = currentPackage();
const conflictPlan = structuredClone(currentPlan);
conflictPlan.title = `${conflictPlan.title} — alternate blueprint`;
const approvedCurrentPlan = approveStoryPackageForRender(currentPlan, {
  sensitiveTopicAcknowledged: false,
  reviewedAt: now - 1_000,
});
const brief = {
  lesson: fixture.moralSpec.sourceLesson,
  characterPairId: "pip-momo",
  settingId: "riverside-garden",
  ageBand: "6-8",
  language: "Armenian",
};
const malformedBriefBlueprintId = crypto.randomUUID();
const malformedBriefStoryId = crypto.randomUUID();
const malformedBriefIdempotencyKey = `malformed-brief-${crypto.randomUUID()}`;
const conflictBlueprintId = crypto.randomUUID();
const conflictStoryId = crypto.randomUUID();
const conflictIdempotencyKey = `idempotency-conflict-${crypto.randomUUID()}`;
const missingMediaStoryId = crypto.randomUUID();
const missingMediaIdempotencyKey = `missing-media-${crypto.randomUUID()}`;
const tamperedCanonBlueprintId = crypto.randomUUID();
const tamperedCanonStoryId = crypto.randomUUID();
const tamperedCanonIdempotencyKey = `tampered-canon-${crypto.randomUUID()}`;
const tamperedCanonPlan = currentPackage({ characterBible: "An altered character bible that was not selected by the parent." });
const approvedTamperedCanonPlan = approveStoryPackageForRender(tamperedCanonPlan, {
  sensitiveTopicAcknowledged: false,
  reviewedAt: now - 1_000,
});
const malformedBrief = { ...brief, unexpected: "must be rejected" };

function clipSnapshot() {
  return sqlite(`
    SELECT slot || '|' || status || '|' || COALESCE(provider_job_id, '') || '|' || extension_count || '|' || updated_at
    FROM clips WHERE story_id = ${sqlQuote(storyId)} ORDER BY slot;
  `);
}

function storyClipSnapshot(targetStoryId: string) {
  return sqlite(`
    SELECT slot || '|' || status || '|' || COALESCE(provider_job_id, '') || '|' || extension_count || '|' || updated_at
    FROM clips WHERE story_id = ${sqlQuote(targetStoryId)} ORDER BY slot;
  `);
}

try {
  sqlite(`
    INSERT INTO blueprints (id, owner_user_id, brief_json, plan_json, created_at)
    VALUES (${sqlQuote(blueprintId)}, 'local-preview-user', ${sqlQuote(JSON.stringify(brief))}, ${sqlQuote(JSON.stringify(plan))}, ${now});

    INSERT INTO stories (id, owner_user_id, idempotency_key, status, brief_json, plan_json, created_at, updated_at)
    VALUES (${sqlQuote(storyId)}, 'local-preview-user', ${sqlQuote(idempotencyKey)}, 'partial', ${sqlQuote(JSON.stringify(brief))}, ${sqlQuote(JSON.stringify(plan))}, ${now}, ${now + 100});

    INSERT INTO clips (id, story_id, slot, status, provider_job_id, extension_count, r2_key, mime_type, error_message, created_at, updated_at) VALUES
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(storyId)}, 'opening', 'ready', NULL, 0, 'missing/legacy-opening.mp4', 'video/mp4', NULL, ${now}, ${now}),
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(storyId)}, 'positive', 'failed', 'legacy-positive-job', 1, NULL, NULL, 'old failure', ${now + 1}, ${now + 1}),
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(storyId)}, 'negative', 'rendering', 'legacy-negative-job', 1, NULL, NULL, NULL, ${now + 2}, ${now + 2}),
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(storyId)}, 'ending', 'starting', NULL, 0, NULL, NULL, NULL, ${now + 3}, ${now + 3});

    INSERT INTO blueprints (id, owner_user_id, brief_json, plan_json, created_at)
    VALUES (${sqlQuote(malformedBriefBlueprintId)}, 'local-preview-user', ${sqlQuote(JSON.stringify(malformedBrief))}, ${sqlQuote(JSON.stringify(currentPlan))}, ${now});

    INSERT INTO stories (id, owner_user_id, idempotency_key, status, brief_json, plan_json, created_at, updated_at)
    VALUES (${sqlQuote(malformedBriefStoryId)}, 'local-preview-user', ${sqlQuote(malformedBriefIdempotencyKey)}, 'partial', ${sqlQuote(JSON.stringify(malformedBrief))}, ${sqlQuote(JSON.stringify(approvedCurrentPlan))}, ${now}, ${now});

    INSERT INTO clips (id, story_id, slot, status, provider_job_id, extension_count, r2_key, mime_type, error_message, created_at, updated_at) VALUES
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(malformedBriefStoryId)}, 'opening', 'starting', NULL, 0, NULL, NULL, NULL, 0, 0),
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(malformedBriefStoryId)}, 'positive', 'failed', NULL, 0, NULL, NULL, 'test failure', 1, 1),
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(malformedBriefStoryId)}, 'negative', 'failed', NULL, 0, NULL, NULL, 'test failure', 2, 2),
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(malformedBriefStoryId)}, 'ending', 'failed', NULL, 0, NULL, NULL, 'test failure', 3, 3);

    INSERT INTO blueprints (id, owner_user_id, brief_json, plan_json, created_at)
    VALUES (${sqlQuote(conflictBlueprintId)}, 'local-preview-user', ${sqlQuote(JSON.stringify(brief))}, ${sqlQuote(JSON.stringify(conflictPlan))}, ${now});

    INSERT INTO stories (id, owner_user_id, idempotency_key, status, brief_json, plan_json, created_at, updated_at)
    VALUES (${sqlQuote(conflictStoryId)}, 'local-preview-user', ${sqlQuote(conflictIdempotencyKey)}, 'partial', ${sqlQuote(JSON.stringify(brief))}, ${sqlQuote(JSON.stringify(approvedCurrentPlan))}, ${now}, ${now});

    INSERT INTO clips (id, story_id, slot, status, provider_job_id, extension_count, r2_key, mime_type, error_message, created_at, updated_at) VALUES
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(conflictStoryId)}, 'opening', 'failed', NULL, 0, NULL, NULL, 'test failure', ${now}, ${now}),
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(conflictStoryId)}, 'positive', 'failed', NULL, 0, NULL, NULL, 'test failure', ${now + 1}, ${now + 1}),
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(conflictStoryId)}, 'negative', 'failed', NULL, 0, NULL, NULL, 'test failure', ${now + 2}, ${now + 2}),
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(conflictStoryId)}, 'ending', 'failed', NULL, 0, NULL, NULL, 'test failure', ${now + 3}, ${now + 3});

    INSERT INTO stories (id, owner_user_id, idempotency_key, status, brief_json, plan_json, created_at, updated_at)
    VALUES (${sqlQuote(missingMediaStoryId)}, 'local-preview-user', ${sqlQuote(missingMediaIdempotencyKey)}, 'ready', ${sqlQuote(JSON.stringify(brief))}, ${sqlQuote(JSON.stringify(approvedCurrentPlan))}, ${now}, ${now});

    INSERT INTO clips (id, story_id, slot, status, provider_job_id, extension_count, r2_key, mime_type, error_message, created_at, updated_at) VALUES
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(missingMediaStoryId)}, 'opening', 'ready', 'done-opening', 0, 'stories/${missingMediaStoryId}/opening.mp4', 'video/mp4', NULL, ${now}, ${now}),
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(missingMediaStoryId)}, 'positive', 'ready', 'done-positive', 2, 'stories/${missingMediaStoryId}/positive.mp4', 'video/mp4', NULL, ${now + 1}, ${now + 1}),
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(missingMediaStoryId)}, 'negative', 'ready', 'done-negative', 2, 'stories/${missingMediaStoryId}/negative.mp4', 'video/mp4', NULL, ${now + 2}, ${now + 2}),
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(missingMediaStoryId)}, 'ending', 'ready', 'done-ending', 0, 'stories/${missingMediaStoryId}/ending.mp4', 'video/mp4', NULL, ${now + 3}, ${now + 3});

    INSERT INTO blueprints (id, owner_user_id, brief_json, plan_json, created_at)
    VALUES (${sqlQuote(tamperedCanonBlueprintId)}, 'local-preview-user', ${sqlQuote(JSON.stringify(brief))}, ${sqlQuote(JSON.stringify(tamperedCanonPlan))}, ${now});

    INSERT INTO stories (id, owner_user_id, idempotency_key, status, brief_json, plan_json, created_at, updated_at)
    VALUES (${sqlQuote(tamperedCanonStoryId)}, 'local-preview-user', ${sqlQuote(tamperedCanonIdempotencyKey)}, 'partial', ${sqlQuote(JSON.stringify(brief))}, ${sqlQuote(JSON.stringify(approvedTamperedCanonPlan))}, ${now}, ${now});

    INSERT INTO clips (id, story_id, slot, status, provider_job_id, extension_count, r2_key, mime_type, error_message, created_at, updated_at) VALUES
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(tamperedCanonStoryId)}, 'opening', 'failed', NULL, 0, NULL, NULL, 'test failure', ${now}, ${now}),
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(tamperedCanonStoryId)}, 'positive', 'failed', NULL, 0, NULL, NULL, 'test failure', ${now + 1}, ${now + 1}),
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(tamperedCanonStoryId)}, 'negative', 'failed', NULL, 0, NULL, NULL, 'test failure', ${now + 2}, ${now + 2}),
      (${sqlQuote(crypto.randomUUID())}, ${sqlQuote(tamperedCanonStoryId)}, 'ending', 'failed', NULL, 0, NULL, NULL, 'test failure', ${now + 3}, ${now + 3});
  `);

  const tamperedCanonStart = await fetch(`${baseUrl}/api/stories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blueprintId: tamperedCanonBlueprintId,
      idempotencyKey: `${tamperedCanonIdempotencyKey}-start`,
      sensitiveTopicAcknowledged: false,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(tamperedCanonStart.status, 422, await tamperedCanonStart.text());
  assert.equal(
    sqlite(`SELECT COUNT(*) FROM stories WHERE idempotency_key = ${sqlQuote(`${tamperedCanonIdempotencyKey}-start`)};`),
    "0",
    "an altered catalog canon must be rejected before provider setup or inserts",
  );

  const tamperedCanonBefore = storyClipSnapshot(tamperedCanonStoryId);
  const tamperedCanonPoll = await fetch(`${baseUrl}/api/stories/${tamperedCanonStoryId}`, {
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(tamperedCanonPoll.status, 422, await tamperedCanonPoll.text());
  assert.equal(storyClipSnapshot(tamperedCanonStoryId), tamperedCanonBefore);
  const tamperedCanonRetry = await fetch(`${baseUrl}/api/stories/${tamperedCanonStoryId}/retry`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(tamperedCanonRetry.status, 422, await tamperedCanonRetry.text());
  assert.equal(
    storyClipSnapshot(tamperedCanonStoryId),
    tamperedCanonBefore,
    "poll and retry must not mutate a story whose canon no longer matches the parent's selection",
  );

  const malformedBlueprintStart = await fetch(`${baseUrl}/api/stories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blueprintId: malformedBriefBlueprintId,
      idempotencyKey: `${malformedBriefIdempotencyKey}-start`,
      sensitiveTopicAcknowledged: false,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(malformedBlueprintStart.status, 422, await malformedBlueprintStart.text());
  assert.equal(
    sqlite(`SELECT COUNT(*) FROM stories WHERE idempotency_key = ${sqlQuote(`${malformedBriefIdempotencyKey}-start`)};`),
    "0",
    "a malformed stored blueprint brief must be rejected before provider setup or inserts",
  );

  const malformedStoryBefore = storyClipSnapshot(malformedBriefStoryId);
  const malformedPoll = await fetch(`${baseUrl}/api/stories/${malformedBriefStoryId}`, {
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(malformedPoll.status, 422, await malformedPoll.text());
  assert.equal(
    storyClipSnapshot(malformedBriefStoryId),
    malformedStoryBefore,
    "malformed story brief polling must not mutate a stale current workflow",
  );
  const malformedRetry = await fetch(`${baseUrl}/api/stories/${malformedBriefStoryId}/retry`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(malformedRetry.status, 422, await malformedRetry.text());
  assert.equal(
    storyClipSnapshot(malformedBriefStoryId),
    malformedStoryBefore,
    "malformed story brief retry must not reset failed current clips",
  );

  const conflictBefore = storyClipSnapshot(conflictStoryId);
  const conflictResponse = await fetch(`${baseUrl}/api/stories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blueprintId: conflictBlueprintId,
      idempotencyKey: conflictIdempotencyKey,
      sensitiveTopicAcknowledged: false,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const conflictPayload = await conflictResponse.json() as { error?: string; code?: string };
  assert.equal(conflictResponse.status, 409, conflictPayload.error);
  assert.equal(conflictPayload.code, "IDEMPOTENCY_KEY_CONFLICT");
  assert.equal(storyClipSnapshot(conflictStoryId), conflictBefore, "a conflicting request key must not mutate its original story");

  const missingMediaRetry = await fetch(`${baseUrl}/api/stories/${missingMediaStoryId}/retry`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
  });
  const missingMediaRetryPayload = await missingMediaRetry.json() as { error?: string; restartedCount?: number };
  assert.equal(missingMediaRetry.status, 202, missingMediaRetryPayload.error);
  assert.equal(missingMediaRetryPayload.restartedCount, 4);
  assert.equal(
    sqlite(`SELECT COUNT(*) FROM clips WHERE story_id = ${sqlQuote(missingMediaStoryId)} AND status = 'starting' AND extension_count = 0 AND r2_key IS NULL AND mime_type IS NULL;`),
    "4",
    "one retry must reset every ready row whose canonical object is missing",
  );

  const startResponse = await fetch(`${baseUrl}/api/stories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blueprintId, idempotencyKey: `${idempotencyKey}-start`, sensitiveTopicAcknowledged: false }),
    signal: AbortSignal.timeout(15_000),
  });
  const startPayload = await startResponse.json() as { error?: string; code?: string };
  assert.equal(startResponse.status, 409, startPayload.error);
  assert.equal(startPayload.code, "BLUEPRINT_RECOMPILE_REQUIRED");
  assert.equal(
    sqlite(`SELECT COUNT(*) FROM stories WHERE idempotency_key = ${sqlQuote(`${idempotencyKey}-start`)};`),
    "0",
    "legacy blueprint rejection must occur before story and clip insertion",
  );

  const before = clipSnapshot();
  const pollResponse = await fetch(`${baseUrl}/api/stories/${storyId}`, { signal: AbortSignal.timeout(15_000) });
  const pollPayload = await pollResponse.json() as { error?: string; code?: string };
  assert.equal(pollResponse.status, 409, pollPayload.error);
  assert.equal(pollPayload.code, "STORY_RECOMPILE_REQUIRED");
  assert.equal(clipSnapshot(), before, "legacy polling must not mutate clip workflow state");

  const retryResponse = await fetch(`${baseUrl}/api/stories/${storyId}/retry`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
  });
  const retryPayload = await retryResponse.json() as { error?: string; code?: string };
  assert.equal(retryResponse.status, 409, retryPayload.error);
  assert.equal(retryPayload.code, "STORY_RECOMPILE_REQUIRED");
  assert.equal(clipSnapshot(), before, "legacy retry must not reset failed clips");

  sqlite(`UPDATE stories SET updated_at = ${now + 10_000} WHERE id = ${sqlQuote(storyId)};`);
  const latestResponse = await fetch(`${baseUrl}/api/stories`, { signal: AbortSignal.timeout(15_000) });
  const latestPayload = await latestResponse.json() as { story?: { id?: string; compatibility?: { mode?: string; providerActionsAllowed?: boolean } } };
  assert.equal(latestResponse.status, 200);
  assert.equal(latestPayload.story?.id, storyId);
  assert.equal(latestPayload.story?.compatibility?.mode, "recompile_required");
  assert.equal(latestPayload.story?.compatibility?.providerActionsAllowed, false);

  sqlite(`
    UPDATE clips
    SET status = 'ready', provider_job_id = NULL, error_message = NULL,
        extension_count = CASE WHEN slot IN ('positive', 'negative') THEN 2 ELSE 0 END,
        r2_key = 'stories/${storyId}/' || slot || '.mp4', mime_type = 'video/mp4'
    WHERE story_id = ${sqlQuote(storyId)};
  `);
  const missingObjectSnapshot = clipSnapshot();
  const missingObjectResponse = await fetch(`${baseUrl}/api/stories/${storyId}`, { signal: AbortSignal.timeout(15_000) });
  const missingObjectPayload = await missingObjectResponse.json() as { error?: string; code?: string };
  assert.equal(missingObjectResponse.status, 409, missingObjectPayload.error);
  assert.equal(missingObjectPayload.code, "STORY_RECOMPILE_REQUIRED");
  assert.equal(clipSnapshot(), missingObjectSnapshot, "missing legacy media must not trigger provider work or row mutation");

  sqlite(`DELETE FROM clips WHERE story_id = ${sqlQuote(storyId)} AND slot = 'ending';`);
  const incompleteLegacySnapshot = clipSnapshot();
  const incompleteLegacyResponse = await fetch(`${baseUrl}/api/stories/${storyId}`, {
    signal: AbortSignal.timeout(15_000),
  });
  const incompleteLegacyPayload = await incompleteLegacyResponse.json() as { error?: string; code?: string };
  assert.equal(incompleteLegacyResponse.status, 409, incompleteLegacyPayload.error);
  assert.equal(incompleteLegacyPayload.code, "STORY_RECOMPILE_REQUIRED");
  assert.equal(
    clipSnapshot(),
    incompleteLegacySnapshot,
    "a recognized historical story with an incomplete clip set must keep the stable recompile response without mutation",
  );

  console.log("story-compatibility-route-live: ok (legacy, brief/canon, media, and idempotency gates preserve state)");
} finally {
  sqlite(`
    DELETE FROM clips WHERE story_id IN (${sqlQuote(storyId)}, ${sqlQuote(malformedBriefStoryId)}, ${sqlQuote(conflictStoryId)}, ${sqlQuote(missingMediaStoryId)}, ${sqlQuote(tamperedCanonStoryId)});
    DELETE FROM stories WHERE id IN (${sqlQuote(storyId)}, ${sqlQuote(malformedBriefStoryId)}, ${sqlQuote(conflictStoryId)}, ${sqlQuote(missingMediaStoryId)}, ${sqlQuote(tamperedCanonStoryId)})
      OR idempotency_key IN (${sqlQuote(`${idempotencyKey}-start`)}, ${sqlQuote(`${malformedBriefIdempotencyKey}-start`)}, ${sqlQuote(`${tamperedCanonIdempotencyKey}-start`)});
    DELETE FROM blueprints WHERE id IN (${sqlQuote(blueprintId)}, ${sqlQuote(malformedBriefBlueprintId)}, ${sqlQuote(conflictBlueprintId)}, ${sqlQuote(tamperedCanonBlueprintId)});
  `);
}
