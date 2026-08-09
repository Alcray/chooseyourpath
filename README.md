# KindPath Story Studio

KindPath is a parent-facing branching children's-story compiler. A parent supplies a lesson, recurring characters, world, age band, and language. The application compiles that input through policy, three adventure premises, independent premise ranking, a hierarchical outline, a typed two-branch story graph, independent review, and an eight-segment shot manifest before video quota can be used.

Read these files before changing compiler, rendering, safety, or playback behavior:

- [`docs/branching-story-compiler-spec.md`](docs/branching-story-compiler-spec.md) — exact canonical architecture supplied by the user.
- [`docs/branching-story-compiler-compliance.md`](docs/branching-story-compiler-compliance.md) — current evidence-backed implementation status and release gaps.
- [`.agents/skills/moral-story-engine/SKILL.md`](.agents/skills/moral-story-engine/SKILL.md) — required engineering workflow and validators.

## Local development

Requires Node.js 22.13 or later.

```bash
npm install
npm run dev
```

The local runtime needs `GOOGLE_API_KEY`. Veo uses the key-only Gemini API when the key permits it, or the Vertex API when `GOOGLE_CLOUD_PROJECT_NUMBER` is configured. Keep credentials in ignored local/runtime configuration and never commit them.

## Verification

```bash
sha256sum --check docs/branching-story-compiler-spec.sha256
npm test
.agents/skills/moral-story-engine/scripts/run_story_evals.sh
npm run test:ui
```

The local approval-boundary test uses local D1 and no provider quota:

```bash
npm run test:approval-live
npm run test:compatibility-live
```

To exercise native playback with an existing completed current or historical story, provide its local story ID explicitly:

```bash
TEST_READY_STORY_ID=<story-uuid> npx playwright test tests/e2e/legacy-media-live.spec.ts
```

That opt-in check selects the supplied record, decodes all four real files, exercises native pause/resume on both choices and the shared ending, and accelerates scene boundaries with synthetic `ended` events. It does not claim natural transition latency or mathematically gapless playback.

Provider live tests are opt-in because they may use quota:

```bash
npm run test:planner-live
npm run test:route-live
npm run test:pipeline-live
```

Do not deploy model, schema, provider, or prompt changes until the static suite, compiler evaluations, live Gemini route, parent approval UI, progress states, both playback branches, pause/resume, shared ending, and applicable real-video checks have passed.

## Persistence

Cloudflare D1 stores owner-scoped blueprints, versioned `StoryPackage` records, jobs, and status. R2 stores generated media. Logical bindings are declared in [`.openai/hosting.json`](.openai/hosting.json).
