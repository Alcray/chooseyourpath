import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the KindPath parent studio", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>KindPath — Branching story studio for parents<\/title>/i);
  assert.match(html, /Turn one lesson into a story your child can choose\./);
  assert.match(html, /Beginning/);
  assert.match(html, /Caring choice/);
  assert.match(html, /Learning choice/);
  assert.match(html, /Shared ending/);
  assert.match(html, /Private parent workspace/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps the four-clip workflow and hosted assets wired", async () => {
  const [
    studio,
    plannerRoute,
    storyRoute,
    statusRoute,
    retryRoute,
    veo,
    storyStore,
    schema,
    openRouter,
    migration,
    hosting,
  ] = await Promise.all([
    readFile(new URL("../app/studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/plan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stories/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stories/[storyId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stories/[storyId]/retry/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/veo.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/story-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/openrouter.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_giant_maddog.sql", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    access(new URL("../public/og.png", import.meta.url)),
    access(new URL("../public/favicon.png", import.meta.url)),
  ]);

  assert.match(studio, /chooseBranch\("positive"\)/);
  assert.match(studio, /chooseBranch\("negative"\)/);
  assert.match(studio, /playClip\("ending"\)/);
  assert.match(studio, /preload="auto"/);
  assert.match(studio, /CLIP_IDS\.map\(\(clipId\)/);
  assert.match(studio, /visibleClipId === clipId/);
  assert.doesNotMatch(studio, /key=\{activeClipId\}/);
  assert.match(studio, /onProgress=\{\(\) => updateClipBuffer\(clipId\)\}/);
  assert.match(studio, /onLoadedData=\{\(\) => markClipBuffered\(clipId\)\}/);
  assert.match(studio, /handleMediaError\(clipId\)/);
  assert.match(studio, /transitionWatchdogRef/);
  assert.match(studio, /\/api\/stories\/\$\{storyId\}/);
  assert.match(studio, /className="progress-track"/);
  assert.match(studio, /aria-valuenow=\{readyCount\}/);
  assert.match(studio, /00:00:06\.000 --> 00:00:13\.000/);
  assert.match(studio, /00:00:13\.000 --> 00:00:20\.000/);
  assert.match(studio, /extensionCount: clip\.extensionCount \?\? 0/);
  assert.match(studio, /generation stages complete/);
  assert.match(studio, /Each choice path is extended to 20 seconds/);
  assert.match(studio, /const playbackStartAvailable = Boolean\(videoUrls\.opening\)/);
  assert.doesNotMatch(studio, /allowEarlyPlayback/);
  assert.match(studio, /warmClip\("ending"\)/);
  assert.match(studio, /warmingClipsRef/);
  assert.match(studio, /!seamlessTransition/);
  assert.match(studio, /clipDurationLabel\(plan, "positive"\)/);
  assert.match(plannerRoute, /deepseek\/deepseek-v4-pro/);
  assert.match(plannerRoute, /type: "json_schema"/);
  assert.match(plannerRoute, /strict: true/);
  assert.match(plannerRoute, /require_parameters: true/);
  assert.match(plannerRoute, /max_tokens: 40000/);
  assert.match(plannerRoute, /reasoning: \{ effort: "high", exclude: true \}/);
  assert.match(plannerRoute, /minLength: 500, maxLength: 1800/);
  assert.match(plannerRoute, /response-healing/);
  assert.match(plannerRoute, /UNSAFE_STORY_PATTERN/);
  assert.match(plannerRoute, /assertChildSafeText\(JSON\.stringify\(validated\), "plan"\)/);
  assert.match(plannerRoute, /choice\.finish_reason === "length"/);
  assert.match(plannerRoute, /expectedExtensionCount = id === "positive" \|\| id === "negative" \? 2 : 0/);
  assert.match(plannerRoute, /incomplete blueprint\. Please try again\./);
  assert.doesNotMatch(plannerRoute, /gemini-2\.5-flash|googleJson/);
  assert.match(openRouter, /OPENROUTER_API_KEY/);
  assert.match(openRouter, /https:\/\/openrouter\.ai\/api\/v1\/chat\/completions/);
  assert.match(openRouter, /const apiKey = getOpenRouterApiKey\(\)/);
  assert.match(openRouter, /Authorization: `Bearer \$\{apiKey\}`/);
  assert.match(openRouter, /AbortSignal\.timeout\(90_000\)/);
  assert.match(storyRoute, /startVeoClip/);
  assert.match(storyRoute, /baseClipDuration\(clip\.id\)/);
  assert.match(statusRoute, /pollVeoClip/);
  assert.match(statusRoute, /startVeoExtension/);
  assert.match(statusRoute, /"extension_retry"/);
  assert.match(statusRoute, /nextClip\.status === "extension_retry" \? "extension_retry" : "rendering"/);
  assert.match(statusRoute, /status = \?, error_message = NULL, updated_at = \?.*"extending"/s);
  assert.match(statusRoute, /getMediaBucket\(\)\.put/);
  assert.match(statusRoute, /provider_job_id = \? AND extension_count = \? AND updated_at = \?/);
  assert.match(veo, /durationSeconds: 6 \| 8 = 8/);
  assert.match(veo, /task: "extend"/);
  assert.match(veo, /video: \{[\s\S]*bytesBase64Encoded: video\.base64/);
  assert.match(storyStore, /extensionCount: clip\?\.extensionCount \?\? 0/);
  assert.match(schema, /extensionCount: integer\("extension_count"\)\.notNull\(\)\.default\(0\)/);
  assert.match(migration, /ADD `extension_count` integer DEFAULT 0 NOT NULL/);
  assert.match(retryRoute, /extension_count = 0/);
  assert.doesNotMatch(retryRoute, /startVeoClip/);
  assert.deepEqual(JSON.parse(hosting), {
    project_id: "appgprj_6a76f9dddcd08191b025b1859772fa43",
    d1: "DB",
    r2: "MEDIA",
  });
});
