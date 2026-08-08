# Story package schema

`StoryPackage` is the versioned persisted source of truth. It includes:

- legacy playback fields: title, parent summary, narrator setup, question, two choices, seed, four clips;
- compiler trace: schema version, prompt version, model, timestamp, and passed stages;
- `MoralSpec` and all three `AdventurePremise` candidates;
- selected premise ID;
- locked `StoryCanon` with registered character, location, prop, style, and voice IDs;
- `StoryGraph` with explicit states, beats, branches, convergence, and reflection;
- eight `ShotManifestEntry` records;
- deterministic checks and an independent `SemanticReview`.

Persist the package in the existing blueprint/story JSON field. Validate it again at both render start and render polling boundaries. This prevents stale or tampered artifacts from reaching a provider.

The four playback clips are compiled from this fixed segment layout:

- opening: one fresh 8-second segment;
- positive: one fresh 6-second segment plus two 7-second extensions;
- negative: one fresh 6-second segment plus two 7-second extensions;
- ending: one fresh 8-second segment.

Never use free-form provider prompts as the canonical story representation.
