# Branching story compiler compliance audit

Audit date: 2026-08-09

Canonical specification: [`docs/branching-story-compiler-spec.md`](branching-story-compiler-spec.md)
Canonical SHA-256: `4269e1694a89b63a8b55bda586e4d41d23c80f088f58efc4f41161483ef5ebdc`

The canonical file is a byte-for-byte copy of both user attachments. Future compiler work must read that file first, then use this document as a status index and re-check every claim against current code and tests.

## Verdict

The application implements the core branching-story compiler and four-clip parent workflow. The 2026-08-08 audit found and fixed these release-blocking degradations:

1. Branch end states were being overwritten with the finale-required state before validation.
2. Beat reads/updates and per-character knowledge were being fabricated from prose instead of generated as typed state data.
3. Stored packages trusted forged approval flags instead of reconstructing policy, ranking, semantic thresholds, convergence, shots, and prompts.
4. Branch-aware finale narration was persisted but discarded by playback.
5. Duplicate state entries could satisfy convergence checks without representing the required cast or promise set.
6. Model-echoed parent instructions could re-enter every downstream prompt through `MoralSpec` fields.
7. Stored graphs did not re-check global beat-ID uniqueness or require promise and relationship facts to be declared.
8. Setup beats had no deterministic payoff mapping, and fresh provider prompts left prop IDs unresolved.
9. Completed schema `1.0` stories had healthy stored media but the strict `1.1` poll route rejected them, while the retry route could mutate legacy jobs before discovering the incompatibility.
10. Historical unversioned stories, including the original pre-extension four-by-eight-second format, had no explicit playback/recompile boundary; stored media readiness also trusted row labels without proving canonical object ownership and existence.
11. Completed provider output could reach extension/storage without an exact MP4 envelope or nonempty decoded bytes, allowing an unusable clip to be marked ready.
12. Render boundaries matched parent-selected canon IDs but did not bind the exact catalog character bible, location bible, visual style, or narrator voice.
13. Deleting the compiler trace from a current package could make it resemble broad unversioned playback and bypass current-package validation.

The implementation is **not the entire long-term production architecture described in the specification**. Canonical image/keyframe packs, post-render visual QA, separate audio composition, a durable background workflow engine, shot-level media checkpoints, the 180-case rated corpus, deletion/retention controls, and full observability remain incomplete. Do not describe those items as implemented.

## Core compiler matrix

| Requirement | Status | Evidence / remaining gap |
| --- | --- | --- |
| Moral is compiled before story generation | Implemented | `classifyMoralPolicy` runs before any model call; `MoralSpec` stores behavior, motive, temptation, consequences, repair, age, intensity, and forbidden treatments. |
| Four-way policy (`ALLOW`, `TRANSFORM`, `REQUIRE_PARENT_REVIEW`, `REJECT`) | Partial | Deterministic rules cover the four decisions, including tested English/Armenian cases for discrimination, humiliation, unsafe obedience, mental-health sensitivity, and prompt injection. This regex policy is not a comprehensive moderation or child-development policy service; unmatched input defaults to `ALLOW`. |
| Raw parent lesson is isolated after policy | Implemented | Only the moral-interpretation call receives delimited source text. Its output is rejected if it quotes long source/compiled text or contains prompt-injection language. Premise, rank, outline/graph, review, and shot prompts receive validated behavioral fields without `sourceLesson` or `compiledLesson`; generated artifacts are rescanned before advancing. Provider prompts receive shots, resolved canon, and seed. |
| Moral controls the choice rather than replacing the plot | Implemented | Each premise requires an external goal, relationship, escalation, setup/payoff, effort, temptation, and natural consequence; prompts and semantic review enforce story-first framing. |
| Exactly three premises | Implemented | Schema, runtime validator, persisted-package validator, and Python validator require exactly three unique candidates. |
| Independent premise ranking | Implemented | A separate model role evaluates all three candidates, scores the seven-part storyness contract, and must select its highest-scoring passing premise. Writer self-selection is not authoritative. |
| Hierarchical outline before typed graph | Implemented | The metadata stage produces and locks setup, dilemma, both arcs, both bridges, finale, and reflection. Beat and state calls receive that locked outline, and `StoryPackage.outline` persists it. |
| Typed branching graph | Implemented | Package includes initial state, shared prefix, exactly one binary choice, two branches, convergence requirements and bridges, shared finale, branch narration, and reflection. |
| Explicit boundary state | Implemented | The four boundary states track time, location, unique present characters, prop condition/holder, separate character knowledge, relationships, and unique promise IDs. Canon IDs, globally unique state IDs, and declared relationship/promise facts are checked. |
| Beat reads, updates, and setup payoff | Partial | Every beat declares nonempty, declared typed fact keys, beat IDs are globally unique, and every setup beat maps to a real later payoff on both paths. The system does not yet store mutation values or execute every beat as a reducer over intermediate state snapshots; end-state validation remains the authoritative transition proof. |
| Harmful branch is a complete mini-arc | Implemented | Deterministic checks require a natural consequence before repair; prompts and independent review cover proportionality, dignity, and reconnection. |
| Convergence is proven, not manufactured | Implemented | Generated end states remain unchanged. Both must satisfy time, location, duplicate-free exact cast, prop state/holder, required knowledge, required relationships, and the duplicate-free exact unresolved-promise set. Adversarial tests cover representative failures across these boundaries. |
| Parameterized finale | Partial | One shared visual ending is retained, while the selected branch narration is rendered as an accessible caption/overlay and the reflection prompt follows. Branch-specific synthesized audio is not yet mixed into the ending. |
| Structured model output | Implemented | Every model stage uses a JSON response schema and strict runtime validation before advancing. |
| Deterministic validation separate from model judgment | Implemented | Code checks policy, shape, IDs, story state, branch order/convergence, shot layout, duration, continuity IDs, word budget, stored evidence, and prompt reconstruction. A separate reviewer scores nine semantic dimensions. |
| Writer, editor, and judge separation | Partial | Premise writer/ranker and graph writer/independent judge are separate roles, with one judge-driven rewrite. There is not a third dedicated graph editor between writer and final judge. |
| Complete versioned source of truth | Partial | Schema `1.1` persists policy, premises/rank, outline, canon, graph, payoff mappings, shots, checks, semantic review, parent review, prompts, clips, and seed. It does not include approved keyframes, post-render QA, audio mix, or publication artifacts. |
| Schema migration/backward compatibility | Implemented as explicit compatibility, not synthetic migration | Schema `1.0` and the older unversioned formats lack required `1.1` evidence, so none is relabeled as `1.1`. The unversioned reader accepts only the frozen eight-field historical root shape and strips nested provider prompts; the schema `1.0` projection additionally strips raw lesson/compiler/non-playback data. It supports both pre-extension 8/8/8/8 and later 8/20/20/8 stored layouts only when the plan, exact four rows, canonical per-story MP4 keys, extension counts, and nonempty R2 objects agree. A current package with deleted compiler evidence is rejected instead of downgraded. Historical blueprints, incomplete polling, and retry return stable `409` recompile-required errors before provider access or mutation; the UI preserves the brief for a fresh `1.1` compile and review. |
| Revalidation at render boundaries | Implemented | Render start and polling recompute policy, moral-field isolation, premise count/ranking, outline shape, semantic score floor, graph structure/checks, shot checks, and every provider prompt. They also bind the package to the parent brief's exact catalog character/location bibles, visual style, narrator voice, character IDs, language, age, and lesson. Forged persisted flags and the audited tamper cases do not pass. |

## Canon, rendering, and playback matrix

| Requirement | Status | Evidence / remaining gap |
| --- | --- | --- |
| Locked recurring character/location/prop IDs | Implemented | Canon is locked before shots; unknown state or shot IDs are rejected; fresh prompts resolve character/location bibles and each in-frame prop's name, registered owner, and initial condition. |
| Full character asset packs | Missing | There are no versioned front/side/three-quarter sheets, expression sheets, scale charts, wardrobe variants, or actual reference-image files. Current canon is IDs plus prose bibles. |
| Approved keyframe-first image-to-video | Missing | Fresh Veo calls remain text-to-video. No keyframe generation, reference-image binding, or first-frame QA stage exists. |
| Eight bounded shot-manifest segments | Partial | Runtime validation proves the exact `8 + (6+7+7) + (6+7+7) + 8` layout, IDs, three timed beats, continuity pointers, transcripts, and word budgets. “One continuous action,” graph-to-shot semantic alignment, choice timing, and branch-neutral ending content are still prompt/reviewer requirements rather than deterministic proofs. |
| Shot-level prop condition and ownership | Partial | Graph states track condition and holder, but each shot currently references prop IDs without a structured per-shot condition/holder snapshot. Provider text therefore cannot independently prove that the rendered prop state matches the graph. |
| Extension prompt discipline | Implemented | Extensions reference the exact predecessor segment ID and contain only next action/continuity instructions; they do not repeat the full canon bible. |
| Provider interface | Partial | Routes depend on `VideoProvider`, and prompt language is provider-neutral. Completed output is treated as untrusted: exact `video/mp4`, valid base64, and nonempty decoded bytes are required before either extension or canonical R2 storage, and storage metadata is forced to MP4. The Veo adapter supports both the key-only Gemini API and the project-scoped Vertex API, but the only implementation and provider video type are still Veo-specific. |
| Twenty-second constructive and harmful paths | Implemented | Each choice path uses a 6-second base plus two 7-second extensions and is stored as one provider-produced video. |
| Four-clip branch playback | Implemented | Playback is opening → selected branch → shared ending. Both paths are generated before child playback, and four persistent video nodes are preloaded. |
| Seamless switching | Partial | Four persistent nodes preload in one player, both decision branches are explicitly warmed while the opening plays, the selected branch warms the ending, range streaming is supported, and transition recovery is visible. This is not one MediaSource/HLS stream and cannot guarantee a gapless A/V boundary. |
| Pause/resume | Implemented | The active persistent video element retains native controls and node identity; the ending narration overlay cannot intercept those controls. The deterministic browser test verifies both routes with simulated media. Separate opt-in Chromium tests selected completed schema `1.0` and current schema `1.1` records, decoded all four stored Veo files, exercised both paths through the shared ending, and proved native pause/resume position retention. Those tests accelerate boundaries with synthetic `ended` events, so they do not prove natural end timing, handoff latency, or gaplessness. |
| Real generation progress | Partial | Video progress is driven by persisted provider state and extension count. Text-compiler progress is still an estimated client stage timer rather than server-streamed stage completion. |
| Post-render visual QA and selective rerender | Missing | Returned video bytes are not frame-sampled or compared against canon, action, props, anomalies, unintended text, or safety. Failed long branches restart from zero rather than from a saved 6/13-second checkpoint. |
| Separate voice/audio and deterministic assembly | Partial | Veo native audio and exact transcripts are used, with deterministic captions and branch text. There is no `VoiceProvider`, lip-sync/audio QA, separate music mix, or FFmpeg/Remotion assembly stage. |

## Product, safety, and operations matrix

| Requirement | Status | Evidence / remaining gap |
| --- | --- | --- |
| Parent review materials before video quota | Implemented | The blueprint shows every candidate's seven storyness fields, independent rank reason, all nine semantic scores, choices, both branches, checks, and the eight-shot storyboard before rendering. |
| Server-side approval gate | Implemented | Render-start code validates and persists an approved copy before loading the provider or creating jobs; sensitive topics require explicit acknowledgement. Unit, mocked-browser, and local live-route/D1 tests prove an unacknowledged request returns `400` with zero story rows and zero clip jobs. |
| Reflection and generated-story disclosure | Implemented | The child sees the branch reflection after the ending and the intro states that the story was AI-generated and parent-reviewed. |
| Minimal child data | Implemented | The product asks for no child photo, voice, real name, or profile; Veo disallows people; branch choice remains local playback state. |
| Story/media deletion and retention | Missing | Owner-scoped persistence exists, but there is no complete parent deletion workflow or documented retention policy for blueprint, story, and media objects. |
| Durable workflow | Partial | D1/R2 state, stale claims, partial success, idempotent story start, and recovery survive reloads. Progress still advances through status polling, not an autonomous Temporal-style worker. Provider start/extend cannot be exactly-once across a crash after provider acceptance. |
| Trace and observability | Partial | Schema/prompt/model/time/stages, seed, scores, current status, provider job ID, extension count, and latest error are stored. Retry history, model snapshot, provider/reference-asset versions, latency, cost, human publication review, and visual-QA traces are incomplete. |
| Dependency security | Partial | Non-breaking audit fixes updated 27 packages, and `npm audit --omit=dev` reports zero production dependency vulnerabilities. The complete development/build tree still reports 14 advisories (10 high) whose automated fixes require breaking Vinext/Cloudflare/Vite/React/tooling changes; no forced downgrade or upgrade was applied. |
| Golden evaluation corpus | Partial | Current deterministic corpus contains 32 English/Armenian policy cases, one fully compiled package, adversarial tamper cases, prompt-isolation tests, and mocked full-UI branch coverage. It is not the proposed 20 themes × 3 ages × 3 settings rated corpus and has no frame-level visual evaluation set. |
| Human review before publication | Partial | Parent review gates rendering. There is no separate risk-tiered editorial publication workflow because the current product does not publish stories publicly. |

## Recommended production stack status

The specification's TypeScript/Python split, PydanticAI, Temporal, PostgreSQL, Langfuse, Promptfoo, ComfyUI, FFmpeg/Remotion/Blender, local open-video backends, LoRA training, and DSPy are recommendations for scale, not present-tense claims. The MVP currently uses TypeScript, Gemini structured output, D1, R2, a `VideoProvider` abstraction, and Veo. Any move toward the recommended stack should preserve the canonical `StoryPackage` contract rather than rewrite story semantics around a provider.

## Verification evidence

Passed on 2026-08-08:

- application lint, typecheck, production build, rendered-page checks, and compiler unit tests;
- repository StoryPackage and branch-convergence validators;
- prompt-change inspection and the Moral Story Engine evaluation script;
- skill structure validation;
- local live sensitive-approval route coverage proving `400` before any story or clip job is persisted;
- production dependency audit with zero findings after 27 non-breaking transitive updates;
- mocked browser coverage for sensitive parent acknowledgement, complete review evidence/storyboard, exact persisted progress, four stable video elements, both choices, branch-specific WebVTT, reflection accessibility, shared ending, and simulated pause/resume position retention.

Additional evidence passed on 2026-08-09:

- 32 focused compatibility/media/provider/canon-binding assertions covering schema `1.0`, the byte-locked real-row unversioned shape, pre-extension unversioned clips, prompt/raw-lesson isolation, current-package downgrade rejection, unsafe or malformed playback, exact provider MP4 validation, exact catalog canon binding, canonical object keys, extension counts, exact clip sets, and state-specific workflow invariants;
- live local D1 route coverage proving historical blueprint start, incomplete polling, and retry return `409` before story/clip insertion, provider access, or workflow mutation; malformed stored briefs and altered catalog canon stop before provider/mutation; conflicting idempotency keys do not reuse another blueprint; and one retry resets ready rows whose R2 objects are missing;
- seven deterministic recovery-browser cases covering stale local history replacement, late hydration cancellation, poll/retry/start recompile recovery, brief/focus preservation, continued polling until all four media URLs exist, and a manual recheck path when a ready row's media remains unavailable after automatic polling stops;
- the actual completed local schema `1.0` story now returns playback-only `200`, with all four R2-backed media endpoints returning `200`;
- native Chromium decoding and pause/resume on both decision paths and the shared ending using those four stored provider videos; transition boundaries were accelerated synthetically and are not evidence of natural gaplessness.
- live Gemini story compilation through the parent UI returned a valid Armenian schema `1.1` package with all deterministic checks passing;
- a new schema `1.1` story rendered through the project-scoped Veo 3.1 Fast adapter, including two seven-second extensions on each decision branch, and stored all four canonical MP4 objects;
- FFprobe verified H.264/AAC 1280×720 media at 8.000s, 20.084s, 20.084s, and 8.000s, and native Chromium decoded all four files, retained pause/resume position, exercised both choices, reached the shared ending, and displayed completion.

Not passed in this audit:

- natural-duration transition-latency and stall measurements for the stored four-file player;
- resolution or explicit acceptance of 14 remaining development/build dependency advisories (10 high) that require breaking dependency changes;
- post-render frame/audio QA, which is not implemented.

## Release status

**Do not deploy this compiler/prompt/schema revision yet.** Static, route-boundary, mocked-browser, compatibility, live Gemini, real current-schema Veo, and stored native-media tests pass. A decision on the remaining build-tool advisories is still required before deployment. Production-grade visual QA, deletion/retention, natural transition measurement, and durable workflow gaps above must also be accepted explicitly or implemented before treating the complete long-term architecture as delivered.
