---
name: moral-story-engine
description: Implement, review, or change the KindPath branching children's story compiler, including moral policy, premise generation, typed story graphs, branch convergence, canon-locked shot manifests, Gemini prompts/schemas, video-provider adapters, golden cases, or story safety evaluations. Use for changes under app/lib/story*, compiler-config, Gemini/Veo integration, planning/render routes, and story compiler tests.
---

# Moral Story Engine

Treat KindPath as a branching story compiler, not a prompt-to-video wrapper. Never send the parent's raw lesson directly to a video provider.

## Required workflow

1. Read `../../../docs/branching-story-compiler-spec.md` before any implementation or compliance review. It is the exact canonical product architecture. Then read `../../../docs/branching-story-compiler-compliance.md` when it exists for the latest evidence-backed audit; re-verify its claims against code and tests rather than assuming they remain current.
2. Read the relevant reference before editing:
   - `references/story-contract.md` for story structure and stage ownership.
   - `references/story-schema.md` for package types and persisted artifacts.
   - `references/continuity-rules.md` for state and branch convergence.
   - `references/child-safety-rules.md` for policy decisions and pedagogy.
   - `references/visual-canon-rules.md` for shot manifests and provider prompts.
   - `references/evaluation-rubric.md` for release thresholds and tests.
3. Preserve these explicit stages: policy, three premises, independent premise ranking, hierarchical outline, typed story graph, independent review, and shot manifest.
4. Keep deterministic validation separate from model judgment. Reject malformed stage output before advancing.
5. Keep provider-specific code behind `VideoProvider`. Compile canon IDs into provider prompts only after parent approval.
6. Store the complete versioned `StoryPackage`, not only the rendered prompts.
7. Add or update golden cases whenever policy, prompt text, schemas, state rules, scoring, or provider compilation changes.
8. Run the resource scripts and application tests before handoff.

## Validation commands

From the repository root:

```bash
sha256sum --check docs/branching-story-compiler-spec.sha256
python3 .agents/skills/moral-story-engine/scripts/validate_story_package.py tests/fixtures/compiled-story-input.json
python3 .agents/skills/moral-story-engine/scripts/validate_branch_convergence.py tests/fixtures/compiled-story-input.json
.agents/skills/moral-story-engine/scripts/run_story_evals.sh
python3 .agents/skills/moral-story-engine/scripts/inspect_prompt_changes.py
```

For model or route changes, also run the opt-in live tests when credentials and quota are intentionally available. Never expose or commit API keys.

## Release blockers

Do not release a story package when any deterministic check fails, the independent review has a score below 3/5, the harmful branch lacks repair, either branch cannot satisfy the finale state, a shot invents a canon ID, spoken words exceed the shot duration, or the policy decision is `REJECT`.

Do not deploy a provider/prompt/schema change based only on static tests. Exercise the parent approval screen, progress states, both playback branches, pause/resume, and the shared ending. A schema change also requires an explicit compatibility or migration path for persisted blueprints and in-flight stories.
