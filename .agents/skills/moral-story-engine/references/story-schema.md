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

The current package contract is schema `1.1` with prompt `branching-compiler-v2`. The raw `sourceLesson` is retained only for audit and policy revalidation; downstream model prompts receive the behavioral moral fields without `sourceLesson` or `compiledLesson`.

Schema `1.0` packages do not contain all `1.1` release artifacts. Do not deploy the strict reader over persisted or in-flight `1.0` stories without an explicit migration or compatibility path.

Persist the package in the existing blueprint/story JSON field. Recompute policy, ranking, semantic thresholds, graph checks, shot checks, and render prompts at both render start and render polling boundaries. This prevents stale or tampered artifacts from reaching a provider.

The four playback clips are compiled from this fixed segment layout:

- opening: one fresh 8-second segment;
- positive: one fresh 6-second segment plus two 7-second extensions;
- negative: one fresh 6-second segment plus two 7-second extensions;
- ending: one fresh 8-second segment.

Never use free-form provider prompts as the canonical story representation.
