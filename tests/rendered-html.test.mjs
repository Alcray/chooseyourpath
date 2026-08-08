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
  const [studio, plannerRoute, storyRoute, statusRoute, retryRoute, hosting] = await Promise.all([
    readFile(new URL("../app/studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/plan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stories/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stories/[storyId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stories/[storyId]/retry/route.ts", import.meta.url), "utf8"),
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
  assert.match(studio, /handleMediaError\(clipId\)/);
  assert.match(studio, /transitionWatchdogRef/);
  assert.match(studio, /\/api\/stories\/\$\{storyId\}/);
  assert.match(studio, /className="progress-track"/);
  assert.match(studio, /aria-valuenow=\{readyCount\}/);
  assert.match(plannerRoute, /thinkingBudget:\s*0/);
  assert.match(plannerRoute, /maxOutputTokens:\s*16384/);
  assert.match(plannerRoute, /candidate\.finishReason === "MAX_TOKENS"/);
  assert.match(plannerRoute, /filter\(\(part\) => !part\.thought\)/);
  assert.match(plannerRoute, /incomplete blueprint\. Please try again\./);
  assert.match(storyRoute, /startVeoClip/);
  assert.match(statusRoute, /pollVeoClip/);
  assert.match(statusRoute, /getMediaBucket\(\)\.put/);
  assert.match(statusRoute, /status = \? AND provider_job_id = \? AND updated_at = \?/);
  assert.match(retryRoute, /\.bind\("starting", index, clip\.id, "failed"\)/);
  assert.doesNotMatch(retryRoute, /startVeoClip/);
  assert.deepEqual(JSON.parse(hosting), {
    project_id: "appgprj_6a76f9dddcd08191b025b1859772fa43",
    d1: "DB",
    r2: "MEDIA",
  });
});
