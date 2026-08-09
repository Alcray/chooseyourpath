# Story package schema

`StoryPackage` is the versioned persisted source of truth. It includes:

- legacy playback fields: title, parent summary, narrator setup, question, two choices, seed, four clips;
- compiler trace: schema version, prompt version, model, timestamp, and passed stages;
- `MoralSpec` and all three `AdventurePremise` candidates;
- independent premise evaluations, selected premise ID, and the locked `HierarchicalStoryOutline`;
- locked `StoryCanon` with registered character, location, prop, style, and voice IDs;
- `StoryGraph` with explicit boundary states, globally unique beats, setup-to-payoff mappings for both paths, branches, convergence, and reflection;
- eight `ShotManifestEntry` records;
- deterministic checks and an independent `SemanticReview`.
- a pending or approved `ParentReview`, including sensitive-topic acknowledgement.

The current package contract is schema `1.1` with prompt `branching-compiler-v3`. Prompt `branching-compiler-v2` remains readable for stored text-only 20-second stories but cannot start a new reference-guided render. The raw `sourceLesson` is retained only for audit and policy revalidation; downstream model prompts receive the behavioral moral fields without `sourceLesson` or `compiledLesson`.

Schema `1.0` packages and the older unversioned formats do not contain all `1.1` release artifacts and must never be relabeled or promoted. The unversioned reader is frozen to the byte-verified historical eight-field root shape, so deleting `compiler` from a current package cannot downgrade it. The compatibility reader preserves only a sanitized playback projection for stories whose four canonical stored media objects are complete; it accepts both the original four 8-second clips and the later 8/20/20/8 layout when the persisted plan and extension counts agree. Historical blueprints, partial stories, polling, and retries return an explicit recompile-required conflict before provider access or workflow mutation; a new `1.1` package requires the stored brief and exact catalog-derived canon to pass the full compiler and parent review again.

Persist the package in the existing blueprint/story JSON field. Recompute policy, ranking, semantic thresholds, graph checks, shot checks, and render prompts at both render start and render polling boundaries. This prevents stale or tampered artifacts from reaching a provider.

The four playback clips are compiled from this fixed segment layout:

- opening: one fresh 8-second segment;
- positive: one fresh reference-guided 8-second segment plus two 7-second extensions;
- negative: one fresh reference-guided 8-second segment plus two 7-second extensions;
- ending: one fresh 8-second segment.

Never use free-form provider prompts as the canonical story representation.

Treat completed provider media as untrusted. Require exact `video/mp4`, valid base64, and nonempty decoded bytes before extension or R2 ingestion, then persist the canonical MP4 MIME rather than arbitrary provider metadata.
