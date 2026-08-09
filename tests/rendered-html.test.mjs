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
    compilerConfig,
    storyCompiler,
    storyMigrations,
    structuredGemini,
    compilerModel,
    storyRoute,
    statusRoute,
    retryRoute,
    mediaRoute,
    veo,
    videoProvider,
    providerMedia,
    storyStore,
    storyPackageBinding,
    storyMedia,
    schema,
    migration,
    hosting,
  ] = await Promise.all([
    readFile(new URL("../app/studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/plan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/compiler-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/story-compiler.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/story-migrations.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/gemini-structured.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/compiler-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stories/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stories/[storyId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stories/[storyId]/retry/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stories/[storyId]/clips/[slot]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/veo.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/video-provider.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/provider-media.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/story-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/story-package-binding.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/story-media.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
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
  assert.match(studio, /const generationPlaybackMediaIncomplete = readyCount === CLIP_IDS\.length/);
  assert.match(studio, /readyCount < 4 \|\| generationPlaybackMediaIncomplete/);
  assert.match(studio, /Recheck missing media/);
  assert.doesNotMatch(studio, /allowEarlyPlayback/);
  assert.match(studio, /warmClip\("ending"\)/);
  assert.match(studio, /warmingClipsRef/);
  assert.match(studio, /<h1 lang=\{storyLanguage\}>\{plan\.title\}<\/h1>/);
  assert.match(studio, /<small lang=\{storyLanguage\}>\{plan\.positiveChoice\.label\}<\/small>/);
  assert.match(studio, /<span lang=\{storyLanguage\}>\{compiledPackage\.graph\.reflectionPrompt\}<\/span>/);
  assert.match(studio, /!seamlessTransition/);
  assert.match(studio, /clipDurationLabel\(plan, "positive"\)/);
  assert.match(studio, /NARRATOR SETUP · ՊԱՏՄՈՂԻ ՆԵՐԱԾՈՒԹՅՈՒՆ/);
  assert.match(studio, /"narrator-intro"/);
  assert.match(studio, /playback === "intro"/);
  assert.match(studio, /COMPILER_STAGES/);
  assert.match(studio, /Story compiler progress/);
  assert.match(studio, /Selected adventure premise/);
  assert.match(studio, /Validated branch graph/);
  assert.match(studio, /Compiler-approved for rendering/);
  assert.match(compilerModel, /gemini-3\.5-flash-lite/);
  assert.match(structuredGemini, /responseMimeType: "application\/json"/);
  assert.match(structuredGemini, /responseJsonSchema/);
  assert.doesNotMatch(structuredGemini, /responseSchema:/);
  assert.match(structuredGemini, /AbortSignal\.timeout\(45_000\)/);
  assert.match(compilerConfig, /moralSpecSchema/);
  assert.match(compilerConfig, /premiseCandidatesSchema/);
  assert.match(compilerConfig, /storyGraphSchema/);
  assert.match(compilerConfig, /semanticReviewSchema/);
  assert.match(compilerConfig, /shotManifestSchema/);
  assert.match(compilerConfig, /exactly three adventure premises/i);
  assert.match(storyCompiler, /classifyMoralPolicy/);
  assert.match(storyCompiler, /deterministicGraphChecks/);
  assert.match(storyCompiler, /validateStoryPackage/);
  assert.match(storyCompiler, /assertChildSafePackage/);
  assert.match(storyCompiler, /Provider continuation/);
  assert.match(plannerRoute, /runStructuredCompilerStage/);
  assert.match(plannerRoute, /Adventure premise selection/);
  assert.match(plannerRoute, /Independent premise ranking/);
  assert.match(plannerRoute, /Independent story review/);
  assert.match(plannerRoute, /Shot manifest compilation/);
  assert.match(plannerRoute, /assembleStoryPackage/);
  assert.doesNotMatch(plannerRoute, /DeepSeek|OpenRouter|deepseek|openRouterJson/);
  assert.match(storyRoute, /approveStoryPackageForRender/);
  assert.match(storyRoute, /BLUEPRINT_RECOMPILE_REQUIRED/);
  assert.match(storyRoute, /classifyStoryPackageCompatibility/);
  assert.match(storyRoute, /sensitiveTopicAcknowledged/);
  assert.ok(
    storyRoute.indexOf("approveStoryPackageForRender(compatibility.storyPackage") < storyRoute.indexOf("const videoProvider = getVideoProvider()"),
    "parent approval must be validated before a video provider can start",
  );
  assert.match(storyRoute, /getVideoProvider/);
  assert.doesNotMatch(storyRoute, /startVeoClip/);
  assert.match(storyRoute, /baseClipDuration\(clip\.id\)/);
  assert.match(storyRoute, /INSERT OR IGNORE INTO stories[\s\S]*VALUES \(\?, \?, \?, \?, \?, \?, \?, \?\)/);
  assert.doesNotMatch(storyRoute, /MAX_NEW_STORIES_PER_WINDOW|STORY_WINDOW_MS|three new stories every 24 hours/);
  assert.match(statusRoute, /validateStoryPackage/);
  assert.match(statusRoute, /mode: "playback_only"/);
  assert.match(statusRoute, /STORY_RECOMPILE_REQUIRED/);
  assert.ok(
    statusRoute.indexOf('compatibility.status === "legacy_requires_recompile"') < statusRoute.indexOf("const videoProvider = getVideoProvider()"),
    "legacy compatibility must be decided before a video provider can run",
  );
  assert.ok(
    statusRoute.indexOf('compatibility.status === "unversioned_requires_recompile"') < statusRoute.indexOf("const videoProvider = getVideoProvider()"),
    "unversioned compatibility must be decided before a video provider can run",
  );
  assert.match(statusRoute, /videoProvider\.poll/);
  assert.match(statusRoute, /videoProvider\.extend/);
  assert.match(statusRoute, /decodeValidatedProviderVideo/);
  assert.ok(
    statusRoute.indexOf("decodeValidatedProviderVideo(providerResultVideo") < statusRoute.indexOf("videoProvider.extend(completedVideo.video"),
    "provider media must be validated and decoded before any extension call",
  );
  assert.ok(
    statusRoute.indexOf("decodeValidatedProviderVideo(providerResultVideo") < statusRoute.indexOf("getMediaBucket().put"),
    "provider media must be validated and decoded before storage",
  );
  assert.match(statusRoute, /contentType: "video\/mp4"/);
  assert.match(statusRoute, /"The generation provider returned an invalid video/);
  assert.match(statusRoute, /"extension_retry"/);
  assert.match(statusRoute, /nextClip\.status === "extension_retry" \? "extension_retry" : "rendering"/);
  assert.match(statusRoute, /status = \?, error_message = NULL, updated_at = \?.*"extending"/s);
  assert.match(statusRoute, /getMediaBucket\(\)\.put/);
  assert.match(statusRoute, /provider_job_id = \? AND extension_count = \? AND updated_at = \?/);
  assert.match(veo, /durationSeconds: 6 \| 8 = 8/);
  assert.doesNotMatch(veo, /task: "extend"/);
  assert.match(veo, /video: \{[\s\S]*bytesBase64Encoded: video\.base64/);
  assert.doesNotMatch(veo, /mimeType: video\.mimeType \?\? "video\/mp4"/);
  assert.match(videoProvider, /interface VideoProvider/);
  assert.match(videoProvider, /google-veo-3\.1-fast/);
  assert.match(videoProvider, /start: startVeoClip/);
  assert.match(providerMedia, /candidate\.mimeType !== "video\/mp4"/);
  assert.match(providerMedia, /value instanceof Uint8Array && value\.byteLength > 0/);
  assert.match(storyStore, /extensionCount: clip\?\.extensionCount \?\? 0/);
  assert.match(storyStore, /storyPackageMatchesBrief/);
  assert.match(storyPackageBinding, /plan\.canon\.characterBible === pair\.bible/);
  assert.match(storyPackageBinding, /plan\.canon\.locationBible === setting\.bible/);
  assert.match(storyPackageBinding, /plan\.canon\.visualStyle === pair\.style/);
  assert.match(storyPackageBinding, /plan\.canon\.narratorVoiceId === expectedNarratorVoiceId/);
  assert.match(schema, /extensionCount: integer\("extension_count"\)\.notNull\(\)\.default\(0\)/);
  assert.match(migration, /ADD `extension_count` integer DEFAULT 0 NOT NULL/);
  assert.match(retryRoute, /extension_count = 0/);
  assert.match(retryRoute, /STORY_RECOMPILE_REQUIRED/);
  assert.match(retryRoute, /inspectStoredPlaybackMedia/);
  assert.ok(
    retryRoute.indexOf("classifyStoryPackageCompatibility") < retryRoute.indexOf("const db = getDb()"),
    "retry compatibility validation must happen before workflow mutation",
  );
  assert.doesNotMatch(retryRoute, /startVeoClip/);
  assert.match(storyStore, /export function parseStoredStoryBrief/);
  assert.match(storyStore, /export function validateStoredStoryBrief/);
  assert.match(storyStore, /const \{ plan, brief \} = options/);
  assert.match(mediaRoute, /if \(!isClipId\(slot\)\) return null/);
  assert.match(mediaRoute, /canonicalStoryMediaKey\(storyId, slot\)/);
  assert.match(storyMedia, /`stories\/\$\{storyId\}\/\$\{slot\}\.mp4`/);
  assert.match(mediaRoute, /clip\.mimeType !== "video\/mp4"/);
  assert.match(mediaRoute, /metadata\.size <= 0/);
  assert.match(mediaRoute, /"X-Content-Type-Options": "nosniff"/);
  assert.match(storyMigrations, /legacy_requires_recompile/);
  assert.match(storyMigrations, /unversioned_requires_recompile/);
  assert.match(storyMigrations, /allowPreExtensionShape/);
  assert.match(storyMigrations, /hasExactUnversionedPlaybackShape/);
  assert.match(storyMigrations, /assertChildSafePackage/);
  assert.deepEqual(JSON.parse(hosting), {
    project_id: "appgprj_6a76f9dddcd08191b025b1859772fa43",
    d1: "DB",
    r2: "MEDIA",
  });
});
